import { describe, it, expect } from 'vitest';
import { evaluateFlag, evaluateVariant, matchRule } from '../evaluator.js';
import type { FlagDefinition, Rule, UserContext } from '../types.js';

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
  it('returns null for disabled flag', () => {
    const flag: FlagDefinition = {
      enabled: false,
      variants: [{ name: 'a', weight: 1 }],
    };
    expect(evaluateVariant('f', flag, { userId: '1' })).toBeNull();
  });

  it('returns null for flag without variants', () => {
    expect(evaluateVariant('f', { enabled: true }, { userId: '1' })).toBeNull();
  });

  it('returns null when no userId', () => {
    const flag: FlagDefinition = {
      enabled: true,
      variants: [{ name: 'a', weight: 1 }],
    };
    expect(evaluateVariant('f', flag)).toBeNull();
    expect(evaluateVariant('f', flag, {})).toBeNull();
  });

  it('returns deterministic variant', () => {
    const flag: FlagDefinition = {
      enabled: true,
      variants: [{ name: 'control', weight: 50 }, { name: 'test', weight: 50 }],
    };
    const a = evaluateVariant('f', flag, { userId: '1' });
    const b = evaluateVariant('f', flag, { userId: '1' });
    expect(a).toBe(b);
  });

  it('returns forced variant from matching rule', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rules: [{ conditions: { plan: 'pro' }, variant: 'premium' }],
      variants: [{ name: 'control', weight: 50 }, { name: 'premium', weight: 50 }],
    };
    expect(evaluateVariant('f', flag, { userId: '1', plan: 'pro' })).toBe('premium');
  });
});
