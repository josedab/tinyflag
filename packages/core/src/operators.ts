/**
 * Condition matching and rule evaluation operators.
 */
import type { Rule, UserContext, SegmentDefinition } from './types.js';

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
 * Evaluate whether a single condition matches the user context.
 */
export function matchCondition(contextValue: unknown, expected: unknown): boolean {
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
 * Recursively resolve all conditions for a segment, including inherited conditions.
 * Uses a visited set to prevent circular resolution.
 */
export function resolveSegmentConditions(
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
 * Evaluate whether all conditions in a rule match the user context.
 * Uses AND logic — all conditions must match for the rule to apply.
 * If the rule references a named segment, resolves segment conditions first.
 *
 * @param rule - The targeting rule to evaluate.
 * @param context - The user context to match against.
 * @param segments - Named segment definitions for segment reference resolution.
 * @returns `true` if all conditions in the rule match the context.
 */
export function matchRule(
  rule: Rule,
  context: UserContext,
  segments: Record<string, SegmentDefinition> = {},
): boolean {
  let conditions = rule.conditions;

  // Resolve segment reference
  if (rule.segment && segments[rule.segment]) {
    const segConditions = resolveSegmentConditions(rule.segment, segments);
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
