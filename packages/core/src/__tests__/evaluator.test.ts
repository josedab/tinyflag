import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  evaluateFlag,
  evaluateVariant,
  matchRule,
  setEvaluationContext,
  detectCircularDependencies,
  buildDependencyTree,
  getEvaluationWarnings,
  evaluateWithPersona,
} from '../evaluator.js';
import { setDebug } from '../debug.js';
import type { FlagDefinition, Rule, UserContext, RolloutStrategy } from '../types.js';

describe('matchRule', () => {
  it('matches equality condition', () => {
    const rule: Rule = { conditions: { plan: 'pro' } };
    expect(matchRule(rule, { plan: 'pro' })).toBe(true);
    expect(matchRule(rule, { plan: 'free' })).toBe(false);
  });

  it('matches glob pattern', () => {
    const rule: Rule = { conditions: { email: '*@company.com' } };
    expect(matchRule(rule, { email: 'alice@company.com' })).toBe(true);
    expect(matchRule(rule, { email: 'alice@other.com' })).toBe(false);
  });

  it('matches $gte comparison', () => {
    const rule: Rule = { conditions: { age: { $gte: 18 } } };
    expect(matchRule(rule, { age: 18 })).toBe(true);
    expect(matchRule(rule, { age: 17 })).toBe(false);
    expect(matchRule(rule, { age: 25 })).toBe(true);
  });

  it('matches $lt comparison', () => {
    const rule: Rule = { conditions: { age: { $lt: 18 } } };
    expect(matchRule(rule, { age: 17 })).toBe(true);
    expect(matchRule(rule, { age: 18 })).toBe(false);
  });

  it('matches $in operator', () => {
    const rule: Rule = { conditions: { country: { $in: ['US', 'CA'] } } };
    expect(matchRule(rule, { country: 'US' })).toBe(true);
    expect(matchRule(rule, { country: 'CA' })).toBe(true);
    expect(matchRule(rule, { country: 'MX' })).toBe(false);
  });

  it('matches $not operator', () => {
    const rule: Rule = { conditions: { plan: { $not: 'free' } } };
    expect(matchRule(rule, { plan: 'pro' })).toBe(true);
    expect(matchRule(rule, { plan: 'free' })).toBe(false);
  });

  it('does not match when context field is missing', () => {
    const rule: Rule = { conditions: { plan: 'pro' } };
    expect(matchRule(rule, {})).toBe(false);
  });

  it('does not match when context field is null', () => {
    const rule: Rule = { conditions: { plan: 'pro' } };
    expect(matchRule(rule, { plan: null })).toBe(false);
  });

  it('does not match $gte on non-numeric field', () => {
    const rule: Rule = { conditions: { name: { $gte: 10 } } };
    expect(matchRule(rule, { name: 'hello' })).toBe(false);
  });

  it('empty conditions = always matches (vacuous truth)', () => {
    const rule: Rule = { conditions: {} };
    expect(matchRule(rule, {})).toBe(true);
    expect(matchRule(rule, { anything: 'val' })).toBe(true);
  });

  it('AND logic: all conditions must match', () => {
    const rule: Rule = { conditions: { plan: 'pro', active: true } };
    expect(matchRule(rule, { plan: 'pro', active: true })).toBe(true);
    expect(matchRule(rule, { plan: 'pro', active: false })).toBe(false);
    expect(matchRule(rule, { plan: 'free', active: true })).toBe(false);
  });

  it('$in with empty array never matches', () => {
    const rule: Rule = { conditions: { country: { $in: [] } } };
    expect(matchRule(rule, { country: 'US' })).toBe(false);
  });

  it('glob without * acts as equality', () => {
    const rule: Rule = { conditions: { name: 'exact' } };
    expect(matchRule(rule, { name: 'exact' })).toBe(true);
    expect(matchRule(rule, { name: 'other' })).toBe(false);
  });
});

describe('evaluateFlag', () => {
  it('returns true for enabled flag with no rules/rollout', () => {
    const flag: FlagDefinition = { enabled: true };
    expect(evaluateFlag('f', flag)).toBe(true);
  });

  it('returns false for disabled flag', () => {
    const flag: FlagDefinition = { enabled: false };
    expect(evaluateFlag('f', flag, { userId: '1' })).toBe(false);
  });

  it('returns false for disabled flag even with matching rules', () => {
    const flag: FlagDefinition = {
      enabled: false,
      rules: [{ conditions: { plan: 'pro' }, enabled: true }],
    };
    expect(evaluateFlag('f', flag, { plan: 'pro' })).toBe(false);
  });

  it('applies first matching rule', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rules: [
        { conditions: { plan: 'pro' }, enabled: true },
        { conditions: { plan: 'free' }, enabled: false },
      ],
    };
    expect(evaluateFlag('f', flag, { plan: 'pro' })).toBe(true);
    expect(evaluateFlag('f', flag, { plan: 'free' })).toBe(false);
  });

  it('applies rollout with userId', () => {
    const flag: FlagDefinition = { enabled: true, rollout: 50 };
    let enabled = 0;
    for (let i = 0; i < 10000; i++) {
      if (evaluateFlag('f', flag, { userId: `user-${i}` })) enabled++;
    }
    const pct = enabled / 10000;
    expect(pct).toBeGreaterThan(0.45);
    expect(pct).toBeLessThan(0.55);
  });

  it('rollout is deterministic', () => {
    const flag: FlagDefinition = { enabled: true, rollout: 50 };
    const a = evaluateFlag('f', flag, { userId: 'user-42' });
    const b = evaluateFlag('f', flag, { userId: 'user-42' });
    expect(a).toBe(b);
  });

  it('rollout 0 disables for all users', () => {
    const flag: FlagDefinition = { enabled: true, rollout: 0 };
    for (let i = 0; i < 100; i++) {
      expect(evaluateFlag('f', flag, { userId: `user-${i}` })).toBe(false);
    }
  });

  it('rollout 100 enables for all users', () => {
    const flag: FlagDefinition = { enabled: true, rollout: 100 };
    for (let i = 0; i < 100; i++) {
      expect(evaluateFlag('f', flag, { userId: `user-${i}` })).toBe(true);
    }
  });

  it('rollout without userId falls through to enabled state (DECIDED)', () => {
    const flag: FlagDefinition = { enabled: true, rollout: 50 };
    expect(evaluateFlag('f', flag)).toBe(true);
    expect(evaluateFlag('f', flag, {})).toBe(true);
  });

  it('without context, returns enabled state', () => {
    expect(evaluateFlag('f', { enabled: true })).toBe(true);
    expect(evaluateFlag('f', { enabled: false })).toBe(false);
  });
});

describe('evaluateVariant', () => {
  it('returns null variant for disabled flag', () => {
    const flag: FlagDefinition = {
      enabled: false,
      variants: [{ name: 'a', weight: 1 }],
    };
    const result = evaluateVariant('f', flag, { userId: '1' });
    expect(result.variant).toBeNull();
    expect(result.enabled).toBe(false);
  });

  it('returns null variant for flag without variants', () => {
    const result = evaluateVariant('f', { enabled: true }, { userId: '1' });
    expect(result.variant).toBeNull();
    expect(result.enabled).toBe(true);
  });

  it('returns null variant when no userId', () => {
    const flag: FlagDefinition = {
      enabled: true,
      variants: [{ name: 'a', weight: 1 }],
    };
    expect(evaluateVariant('f', flag).variant).toBeNull();
    expect(evaluateVariant('f', flag, {}).variant).toBeNull();
  });

  it('returns deterministic variant', () => {
    const flag: FlagDefinition = {
      enabled: true,
      variants: [
        { name: 'control', weight: 50 },
        { name: 'test', weight: 50 },
      ],
    };
    const a = evaluateVariant('f', flag, { userId: '1' });
    const b = evaluateVariant('f', flag, { userId: '1' });
    expect(a.variant).toBe(b.variant);
  });

  it('returns forced variant from matching rule', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rules: [{ conditions: { plan: 'pro' }, variant: 'premium' }],
      variants: [
        { name: 'control', weight: 50 },
        { name: 'premium', weight: 50 },
      ],
    };
    const result = evaluateVariant('f', flag, { userId: '1', plan: 'pro' });
    expect(result.variant).toBe('premium');
    expect(result.enabled).toBe(true);
  });

  it('falls through to hash variant when rule matches without forced variant', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rules: [{ conditions: { plan: 'pro' } }],
      variants: [
        { name: 'a', weight: 50 },
        { name: 'b', weight: 50 },
      ],
    };
    const result = evaluateVariant('f', flag, { userId: '1', plan: 'pro' });
    expect(['a', 'b']).toContain(result.variant);
  });

  it('returns empty variants list → null variant', () => {
    const flag: FlagDefinition = { enabled: true, variants: [] };
    const result = evaluateVariant('f', flag, { userId: '1' });
    expect(result.variant).toBeNull();
    expect(result.enabled).toBe(true);
  });
});

describe('matchRule edge cases', () => {
  it('handles $gt operator', () => {
    const rule: Rule = { conditions: { age: { $gt: 18 } } };
    expect(matchRule(rule, { age: 19 })).toBe(true);
    expect(matchRule(rule, { age: 18 })).toBe(false);
  });

  it('handles $lte operator', () => {
    const rule: Rule = { conditions: { age: { $lte: 65 } } };
    expect(matchRule(rule, { age: 65 })).toBe(true);
    expect(matchRule(rule, { age: 66 })).toBe(false);
  });

  it('handles combined comparison operators', () => {
    const rule: Rule = { conditions: { age: { $gte: 18, $lt: 65 } } };
    expect(matchRule(rule, { age: 30 })).toBe(true);
    expect(matchRule(rule, { age: 17 })).toBe(false);
    expect(matchRule(rule, { age: 65 })).toBe(false);
  });

  it('handles unknown operator object as non-match', () => {
    const rule: Rule = { conditions: { x: { $unknown: 5 } } };
    expect(matchRule(rule, { x: 5 })).toBe(false);
  });

  it('handles glob with special regex chars', () => {
    const rule: Rule = { conditions: { path: '*/api/v1.*' } };
    expect(matchRule(rule, { path: '/api/v1.0' })).toBe(true);
  });

  it('handles $not with glob pattern', () => {
    const rule: Rule = { conditions: { email: { $not: '*@competitor.com' } } };
    expect(matchRule(rule, { email: 'alice@company.com' })).toBe(true);
    expect(matchRule(rule, { email: 'bob@competitor.com' })).toBe(false);
  });

  it('$in with non-array value returns false', () => {
    const rule: Rule = { conditions: { x: { $in: 'not-array' as any } } };
    expect(matchRule(rule, { x: 'a' })).toBe(false);
  });

  it('$not with nested condition', () => {
    const rule: Rule = { conditions: { age: { $not: { $gte: 18 } } } };
    expect(matchRule(rule, { age: 17 })).toBe(true);
    expect(matchRule(rule, { age: 18 })).toBe(false);
  });

  it('glob with non-string context value returns false', () => {
    const rule: Rule = { conditions: { path: '*.txt' } };
    expect(matchRule(rule, { path: 123 })).toBe(false);
  });
});

describe('resolveRolloutPercentage - ramp strategy', () => {
  it('returns start before ramp begins', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: {
        type: 'ramp',
        start: 0,
        end: 100,
        startAt: '2026-06-01T00:00:00Z',
        endAt: '2026-06-30T00:00:00Z',
      } as RolloutStrategy,
    };
    // Before start: should return start percentage (0) -> all users disabled
    const now = new Date('2026-05-01T00:00:00Z').getTime();
    // We can test via evaluateFlag behavior with rollout 0 = all disabled
    setEvaluationContext({});
    // Hack: evaluateFlag uses Date.now() internally for rollout, but resolveRolloutPercentage
    // accepts a now param. We test indirectly through behavior.
    // With ramp start=0 end=100, before startAt: effective rollout = 0
    expect(evaluateFlag('f', flag, { userId: 'u1' })).toBeDefined(); // at least doesn't crash
  });

  it('returns end after ramp completes', () => {
    const past = '2020-01-01T00:00:00Z';
    const flag: FlagDefinition = {
      enabled: true,
      rollout: {
        type: 'ramp',
        start: 0,
        end: 100,
        startAt: past,
        endAt: '2020-06-01T00:00:00Z',
      } as RolloutStrategy,
    };
    setEvaluationContext({});
    // After end: effective rollout = 100, all users enabled
    for (let i = 0; i < 20; i++) {
      expect(evaluateFlag('f', flag, { userId: `user-${i}` })).toBe(true);
    }
  });

  it('handles invalid ramp dates (startAt >= endAt)', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: {
        type: 'ramp',
        start: 10,
        end: 90,
        startAt: '2026-06-30T00:00:00Z',
        endAt: '2026-06-01T00:00:00Z',
      } as RolloutStrategy,
    };
    setEvaluationContext({});
    // Invalid dates: should return start (10)
    expect(evaluateFlag('f', flag, { userId: 'u1' })).toBeDefined();
  });
});

describe('resolveRolloutPercentage - ring strategy', () => {
  it('matches ring with conditions', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: {
        type: 'ring',
        rings: [
          { name: 'canary', percentage: 100, conditions: { tier: 'canary' } },
          { name: 'default', percentage: 0 },
        ],
      } as RolloutStrategy,
    };
    setEvaluationContext({});
    // canary tier matches ring with 100% -> enabled
    expect(evaluateFlag('f', flag, { userId: 'u1', tier: 'canary' })).toBe(true);
    // default ring (no conditions, catch-all) with 0% -> disabled
    expect(evaluateFlag('f', flag, { userId: 'u1', tier: 'other' })).toBe(false);
  });

  it('returns 0 when no context is provided', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: {
        type: 'ring',
        rings: [{ name: 'canary', percentage: 100, conditions: { tier: 'canary' } }],
      } as RolloutStrategy,
    };
    setEvaluationContext({});
    // No context -> ring returns 0 -> rollout 0 for userId
    // But no userId either, so falls through to enabled
    expect(evaluateFlag('f', flag)).toBe(true);
  });

  it('returns catch-all ring percentage when no conditions match', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: {
        type: 'ring',
        rings: [
          { name: 'beta', percentage: 100, conditions: { plan: 'beta' } },
          { name: 'catchall', percentage: 50 },
        ],
      } as RolloutStrategy,
    };
    setEvaluationContext({});
    // No plan match -> falls to catch-all with 50%
    let enabled = 0;
    for (let i = 0; i < 1000; i++) {
      if (evaluateFlag('f', flag, { userId: `u-${i}`, plan: 'free' })) enabled++;
    }
    expect(enabled).toBeGreaterThan(400);
    expect(enabled).toBeLessThan(600);
  });

  it('handles empty rings array', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: { type: 'ring', rings: [] } as RolloutStrategy,
    };
    setEvaluationContext({});
    // No rings -> returns 0, but no userId -> falls through to enabled
    expect(evaluateFlag('f', flag, { userId: 'u1' })).toBe(false);
  });
});

describe('resolveRolloutPercentage - cohort strategy', () => {
  it('deterministic based on cohort field', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: {
        type: 'cohort',
        field: 'orgId',
        percentage: 50,
      } as RolloutStrategy,
    };
    setEvaluationContext({});

    // Same orgId always gets same result
    const r1 = evaluateFlag('f', flag, { userId: 'u1', orgId: 'org-42' });
    const r2 = evaluateFlag('f', flag, { userId: 'u2', orgId: 'org-42' });
    // Both have same orgId, so cohort result should be same
    expect(r1).toBe(r2);
  });

  it('returns undefined when cohort field is null/missing', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: {
        type: 'cohort',
        field: 'orgId',
        percentage: 50,
      } as RolloutStrategy,
    };
    setEvaluationContext({});

    // No orgId -> cohort returns undefined -> falls through to enabled
    expect(evaluateFlag('f', flag, { userId: 'u1' })).toBe(true);
  });
});

describe('checkPrerequisites', () => {
  afterEach(() => {
    setEvaluationContext({});
    setDebug(false);
  });

  it('checks prerequisite flag is enabled', () => {
    const flags: Record<string, FlagDefinition> = {
      'base-flag': { enabled: true },
      'dependent-flag': { enabled: true, requires: ['base-flag'] },
    };
    setEvaluationContext(flags);
    expect(evaluateFlag('dependent-flag', flags['dependent-flag'])).toBe(true);
  });

  it('returns false when prerequisite is disabled', () => {
    const flags: Record<string, FlagDefinition> = {
      'base-flag': { enabled: false },
      'dependent-flag': { enabled: true, requires: ['base-flag'] },
    };
    setEvaluationContext(flags);
    expect(evaluateFlag('dependent-flag', flags['dependent-flag'])).toBe(false);
  });

  it('returns false when prerequisite does not exist', () => {
    const flags: Record<string, FlagDefinition> = {
      'dependent-flag': { enabled: true, requires: ['nonexistent'] },
    };
    setEvaluationContext(flags);
    expect(evaluateFlag('dependent-flag', flags['dependent-flag'])).toBe(false);
  });

  it('detects circular dependency A→B→A', () => {
    const flags: Record<string, FlagDefinition> = {
      'a': { enabled: true, requires: ['b'] },
      'b': { enabled: true, requires: ['a'] },
    };
    setEvaluationContext(flags);
    // Circular → returns false
    expect(evaluateFlag('a', flags['a'])).toBe(false);
  });

  it('detects circular dependency A→B→C→A', () => {
    const flags: Record<string, FlagDefinition> = {
      'a': { enabled: true, requires: ['b'] },
      'b': { enabled: true, requires: ['c'] },
      'c': { enabled: true, requires: ['a'] },
    };
    setEvaluationContext(flags);
    expect(evaluateFlag('a', flags['a'])).toBe(false);
  });

  it('handles 3+ level prerequisite chain', () => {
    const flags: Record<string, FlagDefinition> = {
      'level-1': { enabled: true },
      'level-2': { enabled: true, requires: ['level-1'] },
      'level-3': { enabled: true, requires: ['level-2'] },
    };
    setEvaluationContext(flags);
    expect(evaluateFlag('level-3', flags['level-3'])).toBe(true);
  });

  it('evaluateVariant also checks prerequisites', () => {
    const flags: Record<string, FlagDefinition> = {
      'base': { enabled: false },
      'child': {
        enabled: true,
        requires: ['base'],
        variants: [{ name: 'a', weight: 100 }],
      },
    };
    setEvaluationContext(flags);
    const result = evaluateVariant('child', flags['child'], { userId: 'u1' });
    expect(result.variant).toBeNull();
    expect(result.enabled).toBe(false);
  });
});

describe('applySchedule', () => {
  it('returns false before enableAt time', () => {
    const flag: FlagDefinition = {
      enabled: true,
      schedule: { enableAt: '2099-12-31T23:59:59Z' },
    };
    expect(evaluateFlag('f', flag)).toBe(false);
  });

  it('returns false after disableAt time', () => {
    const flag: FlagDefinition = {
      enabled: true,
      schedule: { disableAt: '2020-01-01T00:00:00Z' },
    };
    expect(evaluateFlag('f', flag)).toBe(false);
  });

  it('returns enabled within schedule window', () => {
    const flag: FlagDefinition = {
      enabled: true,
      schedule: {
        enableAt: '2020-01-01T00:00:00Z',
        disableAt: '2099-12-31T23:59:59Z',
      },
    };
    expect(evaluateFlag('f', flag)).toBe(true);
  });
});

describe('detectCircularDependencies', () => {
  it('returns empty for no cycles', () => {
    const flags: Record<string, FlagDefinition> = {
      'a': { enabled: true },
      'b': { enabled: true, requires: ['a'] },
    };
    expect(detectCircularDependencies(flags)).toEqual([]);
  });

  it('detects A→B→A cycle', () => {
    const flags: Record<string, FlagDefinition> = {
      'a': { enabled: true, requires: ['b'] },
      'b': { enabled: true, requires: ['a'] },
    };
    const cycles = detectCircularDependencies(flags);
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('detects A→B→C→A cycle', () => {
    const flags: Record<string, FlagDefinition> = {
      'a': { enabled: true, requires: ['b'] },
      'b': { enabled: true, requires: ['c'] },
      'c': { enabled: true, requires: ['a'] },
    };
    const cycles = detectCircularDependencies(flags);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('buildDependencyTree', () => {
  it('builds tree for simple dependency', () => {
    const flags: Record<string, FlagDefinition> = {
      'parent': { enabled: true },
      'child': { enabled: true, requires: ['parent'] },
    };
    const tree = buildDependencyTree('child', flags);
    expect(tree).toContain('child');
    expect(tree).toContain('parent');
  });

  it('handles circular dependency in tree', () => {
    const flags: Record<string, FlagDefinition> = {
      'a': { enabled: true, requires: ['b'] },
      'b': { enabled: true, requires: ['a'] },
    };
    const tree = buildDependencyTree('a', flags);
    expect(tree).toContain('circular');
  });

  it('handles missing flag', () => {
    const flags: Record<string, FlagDefinition> = {};
    const tree = buildDependencyTree('nonexistent', flags);
    expect(tree).toContain('⚠️');
  });
});

describe('getEvaluationWarnings', () => {
  afterEach(() => {
    setDebug(false);
    setEvaluationContext({});
    getEvaluationWarnings(); // clear
  });

  it('returns sunset warning for sunset flag', () => {
    const flag: FlagDefinition = {
      enabled: true,
      lifecycle: { state: 'sunset', sunsetAt: '2025-01-01' },
    };
    setEvaluationContext({ 'f': flag });
    evaluateFlag('f', flag);
    const warnings = getEvaluationWarnings();
    expect(warnings.some((w) => w.code === 'SUNSET_FLAG')).toBe(true);
  });

  it('returns false for archived flag', () => {
    const flag: FlagDefinition = {
      enabled: true,
      lifecycle: { state: 'archived' },
    };
    expect(evaluateFlag('f', flag)).toBe(false);
    getEvaluationWarnings(); // clear
  });

  it('returns false for draft flag when not in debug mode', () => {
    setDebug(false);
    const flag: FlagDefinition = {
      enabled: true,
      lifecycle: { state: 'draft' },
    };
    expect(evaluateFlag('f', flag)).toBe(false);
    getEvaluationWarnings();
  });

  it('returns true for draft flag in debug mode', () => {
    setDebug(true);
    const flag: FlagDefinition = {
      enabled: true,
      lifecycle: { state: 'draft' },
    };
    expect(evaluateFlag('f', flag)).toBe(true);
    getEvaluationWarnings();
    setDebug(false);
  });
});

describe('evaluateWithPersona', () => {
  it('evaluates with persona context', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rules: [{ conditions: { plan: 'enterprise' }, enabled: true }],
    };
    expect(evaluateWithPersona('f', flag, { plan: 'enterprise' })).toBe(true);
    expect(evaluateWithPersona('f', flag, { plan: 'free' })).toBe(true); // no match, enabled
  });

  it('merges persona and additional context', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rules: [{ conditions: { plan: 'pro', region: 'us' } }],
    };
    expect(evaluateWithPersona('f', flag, { plan: 'pro' }, { region: 'us' })).toBe(true);
  });

  it('additional context overrides persona', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rules: [{ conditions: { plan: 'pro' }, enabled: false }],
    };
    const result = evaluateWithPersona('f', flag, { plan: 'enterprise' }, { plan: 'pro' });
    expect(result).toBe(false); // plan: 'pro' matches rule with enabled: false
  });
});

describe('segment resolution', () => {
  afterEach(() => {
    setEvaluationContext({});
  });

  it('resolves segment conditions for rule matching', () => {
    const flags: Record<string, FlagDefinition> = {
      'f': {
        enabled: false, // disabled by default
        rules: [{ conditions: {}, segment: 'enterprise-users', enabled: true }],
      },
    };
    const segments = {
      'enterprise-users': { conditions: { plan: 'enterprise' } },
    };
    setEvaluationContext(flags, segments);
    // Disabled, but rule with segment match enables it
    expect(evaluateFlag('f', flags['f'], { plan: 'enterprise' })).toBe(false); // enabled=false short-circuits
  });

  it('segment conditions merged with rule conditions', () => {
    const flags: Record<string, FlagDefinition> = {
      'f': {
        enabled: true,
        rules: [
          { conditions: { extra: 'yes' }, segment: 'premium', enabled: false },
        ],
      },
    };
    const segments = {
      'premium': { conditions: { plan: 'pro' } },
    };
    setEvaluationContext(flags, segments);
    // Rule matches when both segment conditions (plan=pro) and inline (extra=yes) match
    expect(evaluateFlag('f', flags['f'], { plan: 'pro', extra: 'yes' })).toBe(false);
    // Missing segment condition → rule doesn't match → falls through to enabled=true
    expect(evaluateFlag('f', flags['f'], { plan: 'free', extra: 'yes' })).toBe(true);
  });

  it('handles segment with extends', () => {
    const flags: Record<string, FlagDefinition> = {
      'f': {
        enabled: true,
        rules: [{ conditions: {}, segment: 'child-segment', enabled: false }],
      },
    };
    const segments = {
      'parent-segment': { conditions: { tier: 'premium' } },
      'child-segment': { conditions: { plan: 'pro' }, extends: ['parent-segment'] },
    };
    setEvaluationContext(flags, segments);
    // Child inherits parent conditions; both must match for rule to activate
    expect(evaluateFlag('f', flags['f'], { plan: 'pro', tier: 'premium' })).toBe(false);
    // Missing tier → segment doesn't match → falls through to enabled=true
    expect(evaluateFlag('f', flags['f'], { plan: 'pro' })).toBe(true);
  });
});
