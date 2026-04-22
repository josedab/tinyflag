import type { FlagDefinition, Rule, UserContext } from './types.js';
import { rolloutBucket, selectVariant } from './hash.js';

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

/**
 * Simple glob matching: only the * wildcard is supported.
 * Converts glob to regex for matching.
 */
function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
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
 * Core flag evaluation: determines if a flag is enabled for a given context.
 * Never throws — returns false for any error case.
 */
export function evaluateFlag(
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
): boolean {
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

  // Step 4: Rollout with userId
  if (flag.rollout !== undefined && context?.userId) {
    const bucket = rolloutBucket(flagName, context.userId);
    return bucket < flag.rollout;
  }

  // Step 5: Rollout without userId — fall through to enabled state [DECIDED]

  // Step 6: Return global enabled state
  return flag.enabled;
}

/**
 * Core variant evaluation: determines which variant a user is assigned to.
 * Never throws — returns null for any error case.
 */
export function evaluateVariant(
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
): string | null {
  if (!flag.enabled) return null;
  if (!flag.variants || flag.variants.length === 0) return null;

  // Check rules for forced variant
  if (flag.rules && flag.rules.length > 0 && context) {
    for (const rule of flag.rules) {
      if (matchRule(rule, context)) {
        if (rule.variant) return rule.variant;
        break;
      }
    }
  }

  // Need userId for deterministic variant assignment
  if (!context?.userId) return null;

  return selectVariant(flagName, context.userId, flag.variants);
}
