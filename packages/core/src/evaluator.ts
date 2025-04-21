import type { FlagDefinition, FlagConfig, Rule, UserContext, RolloutStrategy, SegmentDefinition } from './types.js';
import type { TinyFlagErrorCode } from './types.js';
import { rolloutBucket, selectVariant, murmurhash3 } from './hash.js';
import { isDebug } from './debug.js';

/** Warnings collected during evaluation (e.g., sunset warnings). */
export type EvaluationWarning = { code: TinyFlagErrorCode; message: string; flagName: string };
let lastEvaluationWarnings: EvaluationWarning[] = [];

/** Get and clear warnings from the last evaluation call. */
export function getEvaluationWarnings(): EvaluationWarning[] {
  const warnings = lastEvaluationWarnings;
  lastEvaluationWarnings = [];
  return warnings;
}

/**
 * Instance-scoped evaluation environment.
 * Avoids module-level mutable state when passed to internal helpers.
 */
export interface EvaluationEnv {
  readonly allFlags: Record<string, FlagDefinition>;
  readonly segments: Record<string, SegmentDefinition>;
}

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
 * Evaluate whether all conditions in a rule match the user context.
 * Uses AND logic — all conditions must match for the rule to apply.
 * If the rule references a named segment, resolves segment conditions first.
 *
 * @param rule - The targeting rule to evaluate.
 * @param context - The user context to match against.
 * @param segments - Optional named segment definitions for segment reference resolution. Falls back to module-level context if not provided.
 * @returns `true` if all conditions in the rule match the context.
 */
export function matchRule(rule: Rule, context: UserContext, segments?: Record<string, SegmentDefinition>): boolean {
  const resolvedSegments = segments ?? currentSegments;
  let conditions = rule.conditions;

  // Resolve segment reference
  if (rule.segment && resolvedSegments[rule.segment]) {
    const segConditions = resolveSegmentConditions(rule.segment, resolvedSegments);
    conditions = { ...segConditions, ...conditions };
  }

  const entries = Object.entries(conditions);

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
  segments?: Record<string, SegmentDefinition>,
): boolean {
  if (cache.has(flagName)) return cache.get(flagName)!;
  if (visiting.has(flagName)) return false; // circular dependency

  const flag = allFlags[flagName];
  if (!flag) return false;

  visiting.add(flagName);

  if (flag.requires && flag.requires.length > 0) {
    for (const reqName of flag.requires) {
      if (!checkPrerequisites(reqName, allFlags, context, visiting, cache, segments)) {
        visiting.delete(flagName);
        cache.set(flagName, false);
        return false;
      }
      // Check if the prerequisite itself evaluates as enabled
      const reqFlag = allFlags[reqName];
      if (!reqFlag || !evaluateFlagCore(reqName, reqFlag, context, segments)) {
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
 * Detect circular dependencies in flag prerequisite chains using depth-first search.
 * Returns an array of cycle paths. An empty array means no cycles exist.
 *
 * @param flags - Map of all flag definitions to check for circular `requires` references.
 * @returns Array of cycle paths, where each path is an array of flag names forming the cycle (e.g., `['a', 'b', 'a']`).
 *
 * @example
 * ```ts
 * const cycles = detectCircularDependencies(ff.getFlags());
 * if (cycles.length > 0) {
 *   console.warn('Circular dependencies:', cycles);
 * }
 * ```
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
 * Build a human-readable ASCII dependency tree for a flag's prerequisite chain.
 *
 * @param flagName - The root flag to build the tree for.
 * @param flags - Map of all flag definitions.
 * @param indent - Internal: current indentation prefix. Defaults to `''`.
 * @param visited - Internal: set of visited flag names for circular detection. Defaults to empty set.
 * @returns Multi-line string showing the dependency tree with status icons (✅ enabled, ❌ disabled, ⚠️ missing).
 *
 * @example
 * ```ts
 * console.log(buildDependencyTree('checkout-v2', ff.getFlags()));
 * // checkout-v2 ✅
 * // └── payments-v2 ✅
 * ```
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
function evaluateFlagCore(flagName: string, flag: FlagDefinition, context?: UserContext, segments?: Record<string, SegmentDefinition>): boolean {
  const scheduledEnabled = applySchedule(flag);
  if (!scheduledEnabled) return false;
  if (!flag.enabled) return false;

  if (flag.rules && flag.rules.length > 0 && context) {
    for (const rule of flag.rules) {
      if (matchRule(rule, context, segments)) {
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
let currentSegments: Record<string, SegmentDefinition> = {};

/**
 * Set the module-level evaluation context for prerequisite and segment resolution.
 * Called by TinyFlag.load() to update the global state. Prefer passing `EvaluationEnv`
 * directly to evaluation functions for multi-instance safety.
 *
 * @param flags - Map of all flag definitions.
 * @param segments - Optional map of named segment definitions.
 */
export function setEvaluationContext(flags: Record<string, FlagDefinition>, segments?: Record<string, SegmentDefinition>): void {
  currentFlags = flags;
  currentSegments = segments ?? {};
}

/**
 * Resolve all conditions for a segment, including inherited conditions.
 * Uses a visited set to prevent circular resolution.
 */
function resolveSegmentConditions(
  segmentName: string,
  segments: Record<string, SegmentDefinition>,
  visited: Set<string> = new Set(),
): Record<string, unknown> {
  if (visited.has(segmentName)) return {};
  visited.add(segmentName);

  const segment = segments[segmentName];
  if (!segment) return {};

  let conditions = { ...segment.conditions };

  if (segment.extends) {
    for (const parent of segment.extends) {
      const parentConditions = resolveSegmentConditions(parent, segments, visited);
      conditions = { ...parentConditions, ...conditions };
    }
  }

  return conditions;
}

/**
 * Core flag evaluation: determines if a flag is enabled for a given context.
 * Never throws — returns `false` for any error case.
 *
 * Evaluation order: lifecycle → prerequisites → schedule → enabled → rules → rollout → default.
 *
 * @param flagName - The name of the flag being evaluated.
 * @param flag - The flag definition to evaluate.
 * @param context - Optional user context for targeting rules and rollout bucketing.
 * @param env - Optional instance-scoped evaluation environment. When provided, uses instance-scoped state instead of module globals for multi-instance safety.
 * @param warnings - Optional array to collect evaluation warnings (e.g., sunset warnings). When provided, warnings are pushed here instead of the module-level array.
 * @returns `true` if the flag is enabled for the given context, `false` otherwise.
 */
export function evaluateFlag(
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
  env?: EvaluationEnv,
  warnings?: EvaluationWarning[],
): boolean {
  const allFlags = env?.allFlags ?? currentFlags;
  const segments = env?.segments ?? currentSegments;
  const warnSink = warnings ?? lastEvaluationWarnings;

  // Step 0: Check lifecycle state
  if (flag.lifecycle) {
    const state = flag.lifecycle.state;
    if (state === 'archived') return false;
    if (state === 'draft' && !isDebug()) return false;
    if (state === 'sunset') {
      warnSink.push({
        code: 'SUNSET_FLAG',
        message: `Flag "${flagName}" is in sunset state${flag.lifecycle.sunsetAt ? ` since ${flag.lifecycle.sunsetAt}` : ''}`,
        flagName,
      });
    }
  }

  // Step 1: Check prerequisites
  if (flag.requires && flag.requires.length > 0) {
    const cache = new Map<string, boolean>();
    if (!checkPrerequisites(flagName, allFlags, context, new Set(), cache, segments)) {
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
      if (matchRule(rule, context, segments)) {
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
 * Never throws — returns `null` variant for any error case.
 *
 * @param flagName - The name of the flag being evaluated.
 * @param flag - The flag definition containing variant weights.
 * @param context - Optional user context. `userId` is required for deterministic variant assignment.
 * @param env - Optional instance-scoped evaluation environment for multi-instance safety.
 * @param warnings - Optional array to collect evaluation warnings.
 * @returns Object with `variant` (assigned variant name or `null`) and `enabled` (flag enabled state).
 */
export function evaluateVariant(
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
  env?: EvaluationEnv,
  warnings?: EvaluationWarning[],
): { variant: string | null; enabled: boolean } {
  const allFlags = env?.allFlags ?? currentFlags;
  const segments = env?.segments ?? currentSegments;

  if (!applySchedule(flag)) return { variant: null, enabled: false };
  if (!flag.enabled) return { variant: null, enabled: false };

  // Check prerequisites
  if (flag.requires && flag.requires.length > 0) {
    const cache = new Map<string, boolean>();
    if (!checkPrerequisites(flagName, allFlags, context, new Set(), cache, segments)) {
      return { variant: null, enabled: false };
    }
  }

  if (!flag.variants || flag.variants.length === 0) {
    return { variant: null, enabled: evaluateFlag(flagName, flag, context, env, warnings) };
  }

  // Check rules for forced variant
  if (flag.rules && flag.rules.length > 0 && context) {
    for (const rule of flag.rules) {
      if (matchRule(rule, context, segments)) {
        if (rule.variant) {
          const ruleEnabled = rule.enabled !== undefined ? rule.enabled : true;
          return { variant: rule.variant, enabled: ruleEnabled };
        }
        break;
      }
    }
  }

  // Need userId for deterministic variant assignment
  if (!context?.userId) return { variant: null, enabled: evaluateFlag(flagName, flag, context, env, warnings) };

  const enabled = evaluateFlag(flagName, flag, context, env, warnings);
  return { variant: selectVariant(flagName, context.userId, flag.variants), enabled };
}

/**
 * Evaluate a flag using a named persona as the base context.
 * Persona context is merged with any additional context (additional takes precedence).
 *
 * @param flagName - The name of the flag to evaluate.
 * @param flag - The flag definition.
 * @param personaContext - The persona's context properties (e.g., `{ userId: 'test', plan: 'pro' }`).
 * @param additionalContext - Optional additional context that overrides persona properties.
 * @returns `true` if the flag is enabled for the merged context.
 */
export function evaluateWithPersona(
  flagName: string,
  flag: FlagDefinition,
  personaContext: Record<string, unknown>,
  additionalContext?: UserContext,
): boolean {
  const merged: UserContext = { ...personaContext, ...additionalContext };
  return evaluateFlag(flagName, flag, merged);
}
