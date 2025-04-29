/**
 * Flag prerequisite checking and dependency analysis.
 */
import type { FlagDefinition, UserContext, SegmentDefinition } from './types.js';

/**
 * Core flag evaluation function type for prerequisite checking.
 * Avoids circular imports by accepting the evaluator as a parameter.
 */
type FlagEvaluator = (
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
  segments?: Record<string, SegmentDefinition>,
) => boolean;

/**
 * Recursively check if all prerequisite flags are enabled.
 * Uses a visiting set to detect circular dependencies at evaluation time.
 */
export function checkPrerequisites(
  flagName: string,
  allFlags: Record<string, FlagDefinition>,
  context: UserContext | undefined,
  visiting: Set<string>,
  cache: Map<string, boolean>,
  segments: Record<string, SegmentDefinition> | undefined,
  evaluateFlagCore: FlagEvaluator,
): boolean {
  if (cache.has(flagName)) return cache.get(flagName)!;
  if (visiting.has(flagName)) return false; // circular dependency

  const flag = allFlags[flagName];
  if (!flag) return false;

  visiting.add(flagName);

  if (flag.requires && flag.requires.length > 0) {
    for (const reqName of flag.requires) {
      if (
        !checkPrerequisites(reqName, allFlags, context, visiting, cache, segments, evaluateFlagCore)
      ) {
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
