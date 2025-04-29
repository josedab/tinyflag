/**
 * Rollout percentage resolution and schedule evaluation.
 */
import type { FlagDefinition, UserContext, RolloutStrategy } from './types.js';
import { murmurhash3 } from './hash.js';
import { matchCondition } from './operators.js';

/**
 * Resolve a rollout field (number or strategy) to an effective percentage.
 * Returns a number 0–100 or undefined if not applicable.
 */
export function resolveRolloutPercentage(
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
 * Check if a flag's schedule overrides its enabled state at the current time.
 * Returns the effective enabled state after applying schedule.
 */
export function applySchedule(flag: FlagDefinition, now: number = Date.now()): boolean {
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
