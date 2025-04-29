import type { FlagDefinition, UserContext, SegmentDefinition } from './types.js';
import type { TinyFlagErrorCode } from './types.js';
import { rolloutBucket, selectVariant } from './hash.js';
import { isDebug } from './debug.js';
import { matchRule } from './operators.js';
import { resolveRolloutPercentage, applySchedule } from './rollout.js';
import {
  checkPrerequisites,
  detectCircularDependencies,
  buildDependencyTree,
} from './prerequisites.js';

// Re-export sub-modules for public API compatibility
export { matchRule } from './operators.js';
export { detectCircularDependencies, buildDependencyTree } from './prerequisites.js';

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

/** Core evaluation logic without prerequisite checking (used internally). */
function evaluateFlagCore(
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
  segments?: Record<string, SegmentDefinition>,
): boolean {
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
export function setEvaluationContext(
  flags: Record<string, FlagDefinition>,
  segments?: Record<string, SegmentDefinition>,
): void {
  currentFlags = flags;
  currentSegments = segments ?? {};
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
    if (
      !checkPrerequisites(flagName, allFlags, context, new Set(), cache, segments, evaluateFlagCore)
    ) {
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
    if (
      !checkPrerequisites(flagName, allFlags, context, new Set(), cache, segments, evaluateFlagCore)
    ) {
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
  if (!context?.userId)
    return { variant: null, enabled: evaluateFlag(flagName, flag, context, env, warnings) };

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
