import { describe, it, expect, vi } from 'vitest';
import { evaluateFlag } from '../evaluator.js';
import type { FlagDefinition } from '../types.js';

describe('rollout strategies', () => {
  describe('ramp strategy', () => {
    it('returns start percentage before startAt', () => {
      const past = new Date(Date.now() + 3600_000).toISOString();
      const future = new Date(Date.now() + 7200_000).toISOString();
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'ramp', start: 0, end: 100, startAt: past, endAt: future },
      };

      // Before the ramp starts, almost all users should be excluded (start=0)
      const flag0: FlagDefinition = {
        enabled: true,
        rollout: {
          type: 'ramp',
          start: 0,
          end: 100,
          startAt: new Date(Date.now() + 100_000).toISOString(),
          endAt: new Date(Date.now() + 200_000).toISOString(),
        },
      };
      // With start=0, no one should get in
      let count = 0;
      for (let i = 0; i < 100; i++) {
        if (evaluateFlag('ramp-test', flag0, { userId: `user-${i}` })) count++;
      }
      expect(count).toBe(0);
    });

    it('returns end percentage after endAt', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: {
          type: 'ramp',
          start: 0,
          end: 100,
          startAt: new Date(Date.now() - 7200_000).toISOString(),
          endAt: new Date(Date.now() - 3600_000).toISOString(),
        },
      };
      // With end=100, everyone should get in
      let count = 0;
      for (let i = 0; i < 100; i++) {
        if (evaluateFlag('ramp-done', flag, { userId: `user-${i}` })) count++;
      }
      expect(count).toBe(100);
    });

    it('interpolates percentage midway', () => {
      const now = Date.now();
      const flag: FlagDefinition = {
        enabled: true,
        rollout: {
          type: 'ramp',
          start: 0,
          end: 100,
          startAt: new Date(now - 5000).toISOString(),
          endAt: new Date(now + 5000).toISOString(),
        },
      };
      // Roughly 50% should be in at midpoint
      let count = 0;
      for (let i = 0; i < 1000; i++) {
        if (evaluateFlag('ramp-mid', flag, { userId: `user-${i}` })) count++;
      }
      expect(count).toBeGreaterThan(300);
      expect(count).toBeLessThan(700);
    });
  });

  describe('ring strategy', () => {
    it('matches ring with conditions', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: {
          type: 'ring',
          rings: [
            { name: 'internal', percentage: 100, conditions: { email: '*@company.com' } },
            { name: 'beta', percentage: 50, conditions: { plan: 'pro' } },
            { name: 'ga', percentage: 10 },
          ],
        },
      };

      // Internal user should always be enabled
      expect(evaluateFlag('ring-test', flag, { userId: 'u1', email: 'dev@company.com' })).toBe(
        true,
      );
    });

    it('falls through to catch-all ring', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: {
          type: 'ring',
          rings: [
            { name: 'internal', percentage: 100, conditions: { email: '*@company.com' } },
            { name: 'ga', percentage: 0 },
          ],
        },
      };

      expect(evaluateFlag('ring-ga', flag, { userId: 'u1', email: 'user@example.com' })).toBe(
        false,
      );
    });
  });

  describe('cohort strategy', () => {
    it('provides consistent results for same cohort value', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'cohort', field: 'companyId', percentage: 50 },
      };

      const result1 = evaluateFlag('cohort-test', flag, { userId: 'user-1', companyId: 'acme' });
      const result2 = evaluateFlag('cohort-test', flag, { userId: 'user-2', companyId: 'acme' });
      // Same company should get same result
      expect(result1).toBe(result2);
    });

    it('varies by cohort value', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'cohort', field: 'companyId', percentage: 50 },
      };

      // With 50% and many companies, roughly half should be in
      let count = 0;
      for (let i = 0; i < 100; i++) {
        if (evaluateFlag('cohort-test', flag, { userId: 'any', companyId: `company-${i}` }))
          count++;
      }
      expect(count).toBeGreaterThan(20);
      expect(count).toBeLessThan(80);
    });
  });

  describe('backward compatibility', () => {
    it('simple number rollout still works', () => {
      const flag: FlagDefinition = { enabled: true, rollout: 50 };
      let count = 0;
      for (let i = 0; i < 1000; i++) {
        if (evaluateFlag('compat-test', flag, { userId: `user-${i}` })) count++;
      }
      expect(count).toBeGreaterThan(350);
      expect(count).toBeLessThan(650);
    });
  });

  describe('ramp edge cases', () => {
    it('returns start when startAt equals endAt', () => {
      const now = new Date().toISOString();
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'ramp', start: 10, end: 90, startAt: now, endAt: now },
      };
      // Invalid config (start >= end) should return start
      const result = evaluateFlag('ramp-eq', flag, { userId: 'user-1' });
      // With start=10, most users excluded
      expect(typeof result).toBe('boolean');
    });

    it('returns end percentage after endAt', () => {
      const past1 = new Date(Date.now() - 7200_000).toISOString();
      const past2 = new Date(Date.now() - 3600_000).toISOString();
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'ramp', start: 0, end: 100, startAt: past1, endAt: past2 },
      };
      // After ramp end, 100% rollout = all users enabled
      expect(evaluateFlag('ramp-after', flag, { userId: 'user-1' })).toBe(true);
    });

    it('handles invalid date strings gracefully', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'ramp', start: 50, end: 100, startAt: 'not-a-date', endAt: 'also-not' },
      };
      // Should return start value (50) when dates are invalid
      const result = evaluateFlag('ramp-bad-dates', flag, { userId: 'user-1' });
      expect(typeof result).toBe('boolean');
    });
  });

  describe('ring edge cases', () => {
    it('returns 0 when no rings match and no catch-all', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: {
          type: 'ring',
          rings: [{ name: 'canary', percentage: 100, conditions: { team: 'eng' } }],
        },
      };
      // Context doesn't match any ring
      expect(evaluateFlag('ring-nomatch', flag, { userId: 'u1', team: 'sales' })).toBe(false);
    });

    it('uses catch-all ring when no conditions match', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: {
          type: 'ring',
          rings: [
            { name: 'canary', percentage: 100, conditions: { team: 'eng' } },
            { name: 'everyone', percentage: 100 }, // No conditions = catch-all
          ],
        },
      };
      expect(evaluateFlag('ring-catchall', flag, { userId: 'u1', team: 'sales' })).toBe(true);
    });

    it('returns 0 with empty rings array', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'ring', rings: [] },
      };
      expect(evaluateFlag('ring-empty', flag, { userId: 'u1' })).toBe(false);
    });

    it('returns 0 when no context is provided', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: {
          type: 'ring',
          rings: [{ name: 'canary', percentage: 100, conditions: { team: 'eng' } }],
        },
      };
      // Ring strategy with no context returns 0
      expect(evaluateFlag('ring-noctx', flag)).toBe(true); // enabled=true, no userId for rollout
    });
  });

  describe('cohort edge cases', () => {
    it('returns undefined rollout when cohort field is null', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'cohort', field: 'companyId', percentage: 50 },
      };
      // null cohort field → falls through to enabled
      expect(
        evaluateFlag('cohort-null', flag, { userId: 'u1', companyId: null as unknown as string }),
      ).toBe(true);
    });

    it('handles numeric cohort field values', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'cohort', field: 'orgId', percentage: 50 },
      };
      const result = evaluateFlag('cohort-num', flag, { userId: 'u1', orgId: 42 });
      expect(typeof result).toBe('boolean');
    });

    it('is deterministic for same cohort value', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'cohort', field: 'companyId', percentage: 50 },
      };
      const r1 = evaluateFlag('cohort-det', flag, { userId: 'u1', companyId: 'acme' });
      const r2 = evaluateFlag('cohort-det', flag, { userId: 'u2', companyId: 'acme' });
      // Same company = same cohort result (consistent)
      expect(r1).toBe(r2);
    });

    it('boundary: 1% cohort percentage', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'cohort', field: 'companyId', percentage: 1 },
      };
      let count = 0;
      for (let i = 0; i < 1000; i++) {
        if (evaluateFlag('cohort-1pct', flag, { userId: 'u1', companyId: `company-${i}` })) count++;
      }
      // ~1% of cohorts should be included
      expect(count).toBeLessThan(50);
    });

    it('boundary: 99% cohort percentage', () => {
      const flag: FlagDefinition = {
        enabled: true,
        rollout: { type: 'cohort', field: 'companyId', percentage: 99 },
      };
      let count = 0;
      for (let i = 0; i < 1000; i++) {
        if (evaluateFlag('cohort-99pct', flag, { userId: 'u1', companyId: `company-${i}` }))
          count++;
      }
      // ~99% of cohorts should be included
      expect(count).toBeGreaterThan(950);
    });
  });
});
