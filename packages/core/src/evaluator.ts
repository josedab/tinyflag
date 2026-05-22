import type { FlagDefinition, FlagConfig, Rule, UserContext, RolloutStrategy } from './types.js';
import { rolloutBucket, selectVariant, murmurhash3 } from './hash.js';

/**
 * Resolve a rollout field (number or strategy) to an effective percentage.
 * Returns a number 0–100 or undefined if not applicable.
 */
function resolveRolloutPercentage(
  rollout: number | RolloutStrategy | undefined,
  context: UserContext | undefined,
  now: number = Date.now(),
): number | undefined {
  if (rollout === undefined) return undefined;

  // Simple number
  if (typeof rollout === 'number') return rollout;

  // Advanced strategies
  switch (rollout.type) {
    case 'ramp': {
      const startTime = new Date(rollout.startAt).getTime();
      const endTime = new Date(rollout.endAt).getTime();
      if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) return rollout.start;
      if (now <= startTime) return rollout.start;
      if (now >= endTime) return rollout.end;
      const progress = (now - startTime) / (endTime - startTime);
      return Math.round(rollout.start + (rollout.end - rollout.start) * progress);
    }

    case 'ring': {
      if (!context) return 0;
      for (const ring of rollout.rings) {
        if (ring.conditions) {
          const match = Object.entries(ring.conditions).every(([field, expected]) =>
            matchCondition(context[field], expected),
          );
          if (match) return ring.percentage;
        }
      }
      // Check for a catch-all ring (no conditions)
      const catchAll = rollout.rings.find((r) => !r.conditions);
      return catchAll?.percentage ?? 0;
    }

    case 'cohort': {
      const cohortValue = context?.[rollout.field];
      if (cohortValue === undefined || cohortValue === null) return undefined;
      // Use cohort field value as hash seed for cohort stability
      const cohortSeed = murmurhash3(String(cohortValue), 0xdeadbeef);
      const bucket = cohortSeed % 100;
      return bucket < rollout.percentage ? 100 : 0;
    }

    default:
      return undefined;
  }
}

/**
 * Evaluate whether a single condition matches the user context.
 */
function matchCondition(contextValue: unknown, expected: unknown): boolean {
  if (contextValue === undefined || contextValue === null) {
    return false;
  }

  // Operator objects: { $gt, $gte, $lt, $lte, $in, $not }
  if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
    const ops = expected as Record<string, unknown>;

    if ('$in' in ops) {
      const list = ops.$in;
      if (!Array.isArray(list)) return false;
      if (list.length === 0) return false;
      return list.includes(contextValue);
    }

    if ('$not' in ops) {
      return !matchCondition(contextValue, ops.$not);
    }

    // Numeric comparisons
    if ('$gt' in ops || '$gte' in ops || '$lt' in ops || '$lte' in ops) {
      if (typeof contextValue !== 'number') return false;
      const cv = contextValue as number;

      if ('$gt' in ops) {
        if (typeof ops.$gt !== 'number' || !(cv > ops.$gt)) return false;
      }
      if ('$gte' in ops) {
        if (typeof ops.$gte !== 'number' || !(cv >= ops.$gte)) return false;
      }
      if ('$lt' in ops) {
        if (typeof ops.$lt !== 'number' || !(cv < ops.$lt)) return false;
      }
      if ('$lte' in ops) {
        if (typeof ops.$lte !== 'number' || !(cv <= ops.$lte)) return false;
      }
      return true;
    }

    return false;
  }

  // Glob pattern matching (string values containing *)
  if (typeof expected === 'string' && expected.includes('*')) {
    if (typeof contextValue !== 'string') return false;
    return globMatch(expected, contextValue);
  }

  // Strict equality
  return contextValue === expected;
}

const globCache = new Map<string, RegExp>();

/**
 * Simple glob matching: only the * wildcard is supported.
 * Caches compiled regex patterns to avoid recompilation.
 */
function globMatch(pattern: string, value: string): boolean {
  let regex = globCache.get(pattern);
  if (!regex) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
    if (globCache.size > 1000) globCache.clear();
    globCache.set(pattern, regex);
  }
  return regex.test(value);
}

/**
 * Evaluate whether all conditions in a rule match the context.
 * Uses AND logic — all conditions must match.
 */
export function matchRule(rule: Rule, context: UserContext): boolean {
  const entries = Object.entries(rule.conditions);

  // Empty conditions = always matches (vacuous truth)
  if (entries.length === 0) return true;

  for (const [field, expected] of entries) {
    const contextValue = context[field];
    if (!matchCondition(contextValue, expected)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a flag's schedule overrides its enabled state at the current time.
 * Returns the effective enabled state after applying schedule.
 */
function applySchedule(flag: FlagDefinition, now: number = Date.now()): boolean {
  if (!flag.schedule) return flag.enabled;

  const { enableAt, disableAt } = flag.schedule;

  if (enableAt) {
    const enableTime = new Date(enableAt).getTime();
    if (!isNaN(enableTime) && now < enableTime) return false;
  }

  if (disableAt) {
    const disableTime = new Date(disableAt).getTime();
    if (!isNaN(disableTime) && now >= disableTime) return false;
  }

  return flag.enabled;
}

/**
 * Recursively check if all prerequisite flags are enabled.
 * Uses a visiting set to detect circular dependencies at evaluation time.
 */
function checkPrerequisites(
  flagName: string,
  allFlags: Record<string, FlagDefinition>,
  context: UserContext | undefined,
  visiting: Set<string>,
  cache: Map<string, boolean>,
): boolean {
  if (cache.has(flagName)) return cache.get(flagName)!;
  if (visiting.has(flagName)) return false; // circular dependency

  const flag = allFlags[flagName];
  if (!flag) return false;

  visiting.add(flagName);

  if (flag.requires && flag.requires.length > 0) {
    for (const reqName of flag.requires) {
      if (!checkPrerequisites(reqName, allFlags, context, visiting, cache)) {
        visiting.delete(flagName);
        cache.set(flagName, false);
        return false;
      }
      // Check if the prerequisite itself evaluates as enabled
      const reqFlag = allFlags[reqName];
      if (!reqFlag || !evaluateFlagCore(reqName, reqFlag, context)) {
        visiting.delete(flagName);
        cache.set(flagName, false);
        return false;
      }
    }
  }

  visiting.delete(flagName);
  cache.set(flagName, true);
  return true;
}

/**
 * Detect circular dependencies in flag requirements using topological sort.
 * Returns an array of cycle paths (empty if no cycles).
 */
export function detectCircularDependencies(flags: Record<string, FlagDefinition>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(name: string): void {
    if (inStack.has(name)) {
      const cycleStart = path.indexOf(name);
      cycles.push([...path.slice(cycleStart), name]);
      return;
    }
    if (visited.has(name)) return;

    visited.add(name);
    inStack.add(name);
    path.push(name);

    const flag = flags[name];
    if (flag?.requires) {
      for (const req of flag.requires) {
        dfs(req);
      }
    }

    path.pop();
    inStack.delete(name);
  }

  for (const name of Object.keys(flags)) {
    dfs(name);
  }

  return cycles;
}

/**
 * Build an ASCII dependency tree for a flag.
 */
export function buildDependencyTree(
  flagName: string,
  flags: Record<string, FlagDefinition>,
  indent: string = '',
  visited: Set<string> = new Set(),
): string {
  const lines: string[] = [];
  const flag = flags[flagName];
  const status = flag ? (flag.enabled ? '✅' : '❌') : '⚠️';
  lines.push(`${indent}${flagName} ${status}`);

  if (visited.has(flagName)) {
    lines.push(`${indent}  ↻ (circular)`);
    return lines.join('\n');
  }
  visited.add(flagName);

  if (flag?.requires && flag.requires.length > 0) {
    for (let i = 0; i < flag.requires.length; i++) {
      const req = flag.requires[i];
      const isLast = i === flag.requires.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      const childIndent = indent + (isLast ? '    ' : '│   ');
      const subtree = buildDependencyTree(req, flags, '', new Set(visited));
      const subtreeLines = subtree.split('\n');
      lines.push(`${indent}${prefix}${subtreeLines[0]}`);
      for (let j = 1; j < subtreeLines.length; j++) {
        lines.push(`${childIndent}${subtreeLines[j]}`);
      }
    }
  }

  return lines.join('\n');
}

/** Core evaluation logic without prerequisite checking (used internally). */
function evaluateFlagCore(flagName: string, flag: FlagDefinition, context?: UserContext): boolean {
  const scheduledEnabled = applySchedule(flag);
  if (!scheduledEnabled) return false;
  if (!flag.enabled) return false;

  if (flag.rules && flag.rules.length > 0 && context) {
    for (const rule of flag.rules) {
      if (matchRule(rule, context)) {
        const ruleEnabled = rule.enabled !== undefined ? rule.enabled : true;
        if (ruleEnabled && rule.rollout !== undefined && context.userId) {
          const bucket = rolloutBucket(flagName, context.userId);
          return bucket < rule.rollout;
        }
        return ruleEnabled;
      }
    }
  }

  const effectiveRollout = resolveRolloutPercentage(flag.rollout, context);
  if (effectiveRollout !== undefined && context?.userId) {
    const bucket = rolloutBucket(flagName, context.userId);
    return bucket < effectiveRollout;
  }

  return flag.enabled;
}

/** All flags context for prerequisite evaluation. Set by TinyFlag before calling evaluate. */
let currentFlags: Record<string, FlagDefinition> = {};

/** Set the current flag context for prerequisite evaluation. */
export function setEvaluationContext(flags: Record<string, FlagDefinition>): void {
  currentFlags = flags;
}

/**
 * Core flag evaluation: determines if a flag is enabled for a given context.
 * Never throws — returns false for any error case.
 */
export function evaluateFlag(
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
): boolean {
  // Step 0: Check prerequisites
  if (flag.requires && flag.requires.length > 0) {
    const cache = new Map<string, boolean>();
    if (!checkPrerequisites(flagName, currentFlags, context, new Set(), cache)) {
      return false;
    }
  }

  // Step 1: Check schedule
  const scheduledEnabled = applySchedule(flag);
  if (!scheduledEnabled) return false;

  // Step 2: If disabled, always false
  if (!flag.enabled) return false;

  // Step 3: Rules evaluation
  if (flag.rules && flag.rules.length > 0 && context) {
    for (const rule of flag.rules) {
      if (matchRule(rule, context)) {
        // Rule matched — use the rule's enabled value (default: true)
        const ruleEnabled = rule.enabled !== undefined ? rule.enabled : true;

        // If rule has its own rollout, apply it
        if (ruleEnabled && rule.rollout !== undefined && context.userId) {
          const bucket = rolloutBucket(flagName, context.userId);
          return bucket < rule.rollout;
        }

        return ruleEnabled;
      }
    }
  }

  // Step 4: Rollout with userId (supports simple number and advanced strategies)
  const effectiveRollout = resolveRolloutPercentage(flag.rollout, context);
  if (effectiveRollout !== undefined && context?.userId) {
    const bucket = rolloutBucket(flagName, context.userId);
    return bucket < effectiveRollout;
  }

  // Step 5: Rollout without userId — fall through to enabled state [DECIDED]

  // Step 6: Return global enabled state
  return flag.enabled;
}

/**
 * Core variant evaluation: determines which variant a user is assigned to.
 * Also returns the flag's enabled state to avoid duplicate rule evaluation.
 * Never throws — returns null variant for any error case.
 */
export function evaluateVariant(
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
): { variant: string | null; enabled: boolean } {
  if (!applySchedule(flag)) return { variant: null, enabled: false };
  if (!flag.enabled) return { variant: null, enabled: false };

  // Check prerequisites
  if (flag.requires && flag.requires.length > 0) {
    const cache = new Map<string, boolean>();
    if (!checkPrerequisites(flagName, currentFlags, context, new Set(), cache)) {
      return { variant: null, enabled: false };
    }
  }

  if (!flag.variants || flag.variants.length === 0) {
    return { variant: null, enabled: evaluateFlag(flagName, flag, context) };
  }

  // Check rules for forced variant
  if (flag.rules && flag.rules.length > 0 && context) {
    for (const rule of flag.rules) {
      if (matchRule(rule, context)) {
        if (rule.variant) {
          const ruleEnabled = rule.enabled !== undefined ? rule.enabled : true;
          return { variant: rule.variant, enabled: ruleEnabled };
        }
        break;
      }
    }
  }

  // Need userId for deterministic variant assignment
  if (!context?.userId) return { variant: null, enabled: evaluateFlag(flagName, flag, context) };

  const enabled = evaluateFlag(flagName, flag, context);
  return { variant: selectVariant(flagName, context.userId, flag.variants), enabled };
}
