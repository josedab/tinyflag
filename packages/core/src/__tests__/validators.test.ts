import { describe, it, expect } from 'vitest';
import {
  validateRolloutStrategy,
  validateRule,
} from '../validators.js';
import type { ValidationError } from '../types.js';

describe('validateRolloutStrategy – ring', () => {
  it('accepts valid ring config', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'ring',
      rings: [
        { name: 'canary', percentage: 1 },
        { name: 'ga', percentage: 100 },
      ],
    }, errors);
    expect(errors).toEqual([]);
  });

  it('rejects non-array rings', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'ring',
      rings: 'not-an-array',
    }, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('array');
  });

  it('rejects ring entry missing name', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'ring',
      rings: [{ percentage: 10 }],
    }, errors);
    expect(errors.some((e) => e.message.includes('"name"'))).toBe(true);
  });

  it('rejects ring entry missing percentage', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'ring',
      rings: [{ name: 'canary' }],
    }, errors);
    expect(errors.some((e) => e.message.includes('"percentage"'))).toBe(true);
  });

  it('rejects ring entry with non-string name', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'ring',
      rings: [{ name: 123, percentage: 10 }],
    }, errors);
    expect(errors.some((e) => e.message.includes('"name"'))).toBe(true);
  });

  it('rejects ring entry with non-number percentage', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'ring',
      rings: [{ name: 'canary', percentage: 'ten' }],
    }, errors);
    expect(errors.some((e) => e.message.includes('"percentage"'))).toBe(true);
  });
});

describe('validateRolloutStrategy – cohort', () => {
  it('accepts valid cohort config', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'cohort',
      field: 'companyId',
      percentage: 25,
    }, errors);
    expect(errors).toEqual([]);
  });

  it('rejects cohort missing field', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'cohort',
      percentage: 25,
    }, errors);
    expect(errors.some((e) => e.message.includes('"field"'))).toBe(true);
  });

  it('rejects cohort missing percentage', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'cohort',
      field: 'companyId',
    }, errors);
    expect(errors.some((e) => e.message.includes('"percentage"'))).toBe(true);
  });

  it('rejects cohort with non-string field', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'cohort',
      field: 42,
      percentage: 25,
    }, errors);
    expect(errors.some((e) => e.message.includes('"field"'))).toBe(true);
  });

  it('rejects cohort with non-number percentage', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {
      type: 'cohort',
      field: 'companyId',
      percentage: 'all',
    }, errors);
    expect(errors.some((e) => e.message.includes('"percentage"'))).toBe(true);
  });
});

describe('validateRolloutStrategy – invalid type', () => {
  it('rejects missing type', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', {}, errors);
    expect(errors.some((e) => e.message.includes('"type"'))).toBe(true);
  });

  it('rejects unknown type', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', { type: 'unknown' }, errors);
    expect(errors.some((e) => e.message.includes('"type"'))).toBe(true);
  });

  it('returns early on invalid type without checking other fields', () => {
    const errors: ValidationError[] = [];
    validateRolloutStrategy('flags.f', { type: 'bad', rings: 'not-array' }, errors);
    expect(errors).toHaveLength(1);
  });
});

describe('validateRule', () => {
  it('accepts valid rule', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' } }, errors);
    expect(errors).toEqual([]);
  });

  it('rejects non-object rule (string)', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', 'not-an-object', errors);
    expect(errors[0].message).toContain('object');
  });

  it('rejects null rule', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', null, errors);
    expect(errors[0].message).toContain('object');
  });

  it('rejects array rule', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', [1, 2], errors);
    expect(errors[0].message).toContain('object');
  });

  it('rejects missing conditions field', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { enabled: true }, errors);
    expect(errors.some((e) => e.message.includes('"conditions"'))).toBe(true);
  });

  it('rejects non-object conditions (array)', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: ['a', 'b'] }, errors);
    expect(errors.some((e) => e.message.includes('"conditions" must be an object'))).toBe(true);
  });

  it('rejects null conditions', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: null }, errors);
    expect(errors.some((e) => e.message.includes('"conditions" must be an object'))).toBe(true);
  });

  it('rejects non-boolean enabled', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' }, enabled: 'yes' }, errors);
    expect(errors.some((e) => e.message.includes('"enabled" must be a boolean'))).toBe(true);
  });

  it('accepts boolean enabled', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' }, enabled: false }, errors);
    expect(errors).toEqual([]);
  });

  it('accepts empty conditions object', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: {} }, errors);
    expect(errors).toEqual([]);
  });

  it('rejects rollout outside 0-100', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' }, rollout: 150 }, errors);
    expect(errors.some((e) => e.message.includes('0-100'))).toBe(true);
  });

  it('rejects negative rollout', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' }, rollout: -5 }, errors);
    expect(errors.some((e) => e.message.includes('0-100'))).toBe(true);
  });

  it('rejects non-number rollout', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' }, rollout: 'half' }, errors);
    expect(errors.some((e) => e.message.includes('0-100'))).toBe(true);
  });

  it('accepts valid rollout', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' }, rollout: 50 }, errors);
    expect(errors).toEqual([]);
  });

  it('rejects non-string variant', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' }, variant: 123 }, errors);
    expect(errors.some((e) => e.message.includes('"variant" must be a string'))).toBe(true);
  });

  it('accepts string variant', () => {
    const errors: ValidationError[] = [];
    validateRule('rules[0]', { conditions: { plan: 'pro' }, variant: 'dark' }, errors);
    expect(errors).toEqual([]);
  });
});
