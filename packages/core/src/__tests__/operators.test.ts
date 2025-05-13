import { describe, it, expect } from 'vitest';
import { resolveSegmentConditions, matchRule } from '../operators.js';
import type { SegmentDefinition, Rule } from '../types.js';

describe('resolveSegmentConditions with OR operator', () => {
  it('wraps parent conditions in $or when operator is OR', () => {
    const segments: Record<string, SegmentDefinition> = {
      parentA: { conditions: { plan: 'pro' } },
      parentB: { conditions: { plan: 'enterprise' } },
      combined: {
        conditions: { region: 'us' },
        extends: ['parentA', 'parentB'],
        operator: 'OR',
      },
    };
    const result = resolveSegmentConditions('combined', segments);
    expect(result.region).toBe('us');
    expect(result.$or).toBeDefined();
    expect(Array.isArray(result.$or)).toBe(true);
    expect((result.$or as Record<string, unknown>[]).length).toBe(2);
  });

  it('merges parent conditions with AND (default)', () => {
    const segments: Record<string, SegmentDefinition> = {
      parentA: { conditions: { plan: 'pro' } },
      parentB: { conditions: { region: 'us' } },
      combined: {
        conditions: { active: true },
        extends: ['parentA', 'parentB'],
      },
    };
    const result = resolveSegmentConditions('combined', segments);
    expect(result.plan).toBe('pro');
    expect(result.region).toBe('us');
    expect(result.active).toBe(true);
    expect(result.$or).toBeUndefined();
  });

  it('handles empty $or when parents have no conditions', () => {
    const segments: Record<string, SegmentDefinition> = {
      empty: { conditions: {} },
      combined: {
        conditions: { active: true },
        extends: ['empty'],
        operator: 'OR',
      },
    };
    const result = resolveSegmentConditions('combined', segments);
    // Empty parent conditions are filtered out
    expect(result.$or).toBeUndefined();
    expect(result.active).toBe(true);
  });

  it('handles single parent in OR', () => {
    const segments: Record<string, SegmentDefinition> = {
      parent: { conditions: { plan: 'pro' } },
      child: {
        conditions: { active: true },
        extends: ['parent'],
        operator: 'OR',
      },
    };
    const result = resolveSegmentConditions('child', segments);
    expect(result.$or).toHaveLength(1);
    expect((result.$or as Record<string, unknown>[])[0].plan).toBe('pro');
  });

  it('prevents circular reference', () => {
    const segments: Record<string, SegmentDefinition> = {
      a: { conditions: { x: 1 }, extends: ['b'] },
      b: { conditions: { y: 2 }, extends: ['a'] },
    };
    const result = resolveSegmentConditions('a', segments);
    // Should not infinite loop
    expect(result.x).toBe(1);
    expect(result.y).toBe(2);
  });

  it('returns empty for unknown segment', () => {
    const result = resolveSegmentConditions('nonexistent', {});
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('matchRule with $or from segment inheritance', () => {
  it('evaluates OR conditions — matches first alternative', () => {
    const rule: Rule = {
      conditions: {},
      segment: 'combined',
    };
    const segments: Record<string, SegmentDefinition> = {
      parentA: { conditions: { plan: 'pro' } },
      parentB: { conditions: { plan: 'enterprise' } },
      combined: {
        conditions: {},
        extends: ['parentA', 'parentB'],
        operator: 'OR',
      },
    };
    expect(matchRule(rule, { plan: 'pro' }, segments)).toBe(true);
  });

  it('evaluates OR conditions — matches second alternative', () => {
    const rule: Rule = {
      conditions: {},
      segment: 'combined',
    };
    const segments: Record<string, SegmentDefinition> = {
      parentA: { conditions: { plan: 'pro' } },
      parentB: { conditions: { plan: 'enterprise' } },
      combined: {
        conditions: {},
        extends: ['parentA', 'parentB'],
        operator: 'OR',
      },
    };
    expect(matchRule(rule, { plan: 'enterprise' }, segments)).toBe(true);
  });

  it('evaluates OR conditions — no match', () => {
    const rule: Rule = {
      conditions: {},
      segment: 'combined',
    };
    const segments: Record<string, SegmentDefinition> = {
      parentA: { conditions: { plan: 'pro' } },
      parentB: { conditions: { plan: 'enterprise' } },
      combined: {
        conditions: {},
        extends: ['parentA', 'parentB'],
        operator: 'OR',
      },
    };
    expect(matchRule(rule, { plan: 'free' }, segments)).toBe(false);
  });

  it('handles empty $or array (vacuous truth for $or removed)', () => {
    // When all parent segments are empty, no $or is created
    const rule: Rule = { conditions: {} };
    expect(matchRule(rule, {}, {})).toBe(true); // empty conditions = always match
  });

  it('combines own conditions AND $or from segment', () => {
    const rule: Rule = {
      conditions: { active: true },
      segment: 'combined',
    };
    const segments: Record<string, SegmentDefinition> = {
      parentA: { conditions: { plan: 'pro' } },
      parentB: { conditions: { plan: 'enterprise' } },
      combined: {
        conditions: {},
        extends: ['parentA', 'parentB'],
        operator: 'OR',
      },
    };
    // Must match active AND (pro OR enterprise)
    expect(matchRule(rule, { plan: 'pro', active: true }, segments)).toBe(true);
    expect(matchRule(rule, { plan: 'pro', active: false }, segments)).toBe(false);
    expect(matchRule(rule, { plan: 'free', active: true }, segments)).toBe(false);
  });

  it('handles deeply nested OR (parent extends with OR)', () => {
    const segments: Record<string, SegmentDefinition> = {
      grandparent1: { conditions: { tier: 'gold' } },
      grandparent2: { conditions: { tier: 'platinum' } },
      parent: {
        conditions: {},
        extends: ['grandparent1', 'grandparent2'],
        operator: 'OR',
      },
      child: {
        conditions: { region: 'us' },
        extends: ['parent'],
      },
    };
    const rule: Rule = { conditions: {}, segment: 'child' };
    // AND merge: region=us AND $or from parent
    expect(matchRule(rule, { region: 'us', tier: 'gold' }, segments)).toBe(true);
    expect(matchRule(rule, { region: 'eu', tier: 'gold' }, segments)).toBe(false);
  });
});
