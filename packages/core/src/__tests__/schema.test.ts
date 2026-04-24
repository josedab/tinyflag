import { describe, it, expect } from 'vitest';
import { validateConfig, parseFlagConfig } from '../schema.js';

describe('validateConfig', () => {
  it('accepts valid minimal config', () => {
    expect(validateConfig({ version: 1, flags: { 'my-flag': { enabled: true } } })).toEqual([]);
  });

  it('rejects null config', () => {
    expect(validateConfig(null).length).toBeGreaterThan(0);
  });

  it('rejects config without flags', () => {
    expect(validateConfig({ version: 1 }).some((e) => e.path === 'flags')).toBe(true);
  });

  it('rejects unsupported version', () => {
    expect(validateConfig({ version: 99, flags: {} }).some((e) => e.path === 'version')).toBe(true);
  });

  it('rejects missing enabled field', () => {
    expect(
      validateConfig({ flags: { 'my-flag': { rollout: 50 } } }).some((e) =>
        e.message.includes('"enabled"'),
      ),
    ).toBe(true);
  });

  it('rejects rollout outside 0-100', () => {
    expect(
      validateConfig({ flags: { 'my-flag': { enabled: true, rollout: 150 } } }).some((e) =>
        e.message.includes('0-100'),
      ),
    ).toBe(true);
  });

  it('rejects invalid flag name with spaces', () => {
    expect(
      validateConfig({ flags: { 'my flag': { enabled: true } } }).some((e) =>
        e.message.includes('Invalid flag name'),
      ),
    ).toBe(true);
  });

  it('rejects empty flag name', () => {
    expect(
      validateConfig({ flags: { '': { enabled: true } } }).some((e) => e.message.includes('empty')),
    ).toBe(true);
  });

  it('accepts valid kebab-case names', () => {
    expect(
      validateConfig({
        flags: {
          a: { enabled: true },
          'my-flag': { enabled: true },
          'feature-123': { enabled: true },
        },
      }),
    ).toEqual([]);
  });

  it('rejects all-zero variant weights', () => {
    expect(
      validateConfig({
        flags: {
          f: {
            enabled: true,
            variants: [
              { name: 'a', weight: 0 },
              { name: 'b', weight: 0 },
            ],
          },
        },
      }).some((e) => e.message.includes('zero')),
    ).toBe(true);
  });

  it('rejects variant with empty name', () => {
    expect(
      validateConfig({
        flags: { f: { enabled: true, variants: [{ name: '', weight: 1 }] } },
      }).some((e) => e.message.includes('non-empty')),
    ).toBe(true);
  });

  it('rejects rule without conditions', () => {
    expect(
      validateConfig({
        flags: { f: { enabled: true, rules: [{ enabled: true }] } },
      }).some((e) => e.message.includes('conditions')),
    ).toBe(true);
  });

  it('strict mode rejects unknown fields', () => {
    const errors = validateConfig(
      { flags: { f: { enabled: true, unknownField: 'x' } }, extra: true },
      true,
    );
    expect(errors.some((e) => e.message.includes('Unknown field'))).toBe(true);
  });

  it('lenient mode allows unknown fields', () => {
    expect(validateConfig({ flags: { f: { enabled: true, extra: 'x' } }, extra: true })).toEqual(
      [],
    );
  });

  it('accepts empty flags object', () => {
    expect(validateConfig({ flags: {} })).toEqual([]);
  });
});

describe('parseFlagConfig', () => {
  it('returns typed config for valid input', () => {
    const { config, errors } = parseFlagConfig({
      version: 1,
      flags: { 'my-flag': { enabled: true, rollout: 50, variants: [{ name: 'a', weight: 1 }] } },
    });
    expect(errors).toEqual([]);
    expect(config.flags['my-flag'].enabled).toBe(true);
    expect(config.flags['my-flag'].rollout).toBe(50);
  });

  it('reports warnings for unknown fields in lenient mode', () => {
    const { errors, warnings } = parseFlagConfig({
      flags: { f: { enabled: true, custom: 'x' } },
      extra: true,
    });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.message.includes('Unknown field'))).toBe(true);
  });
});

describe('validateConfig edge cases', () => {
  it('rejects non-object config', () => {
    expect(validateConfig('string').length).toBeGreaterThan(0);
    expect(validateConfig(42).length).toBeGreaterThan(0);
    expect(validateConfig([1, 2]).length).toBeGreaterThan(0);
  });

  it('rejects flags as array', () => {
    expect(validateConfig({ flags: [1, 2] }).some((e) => e.message.includes('object'))).toBe(true);
  });

  it('rejects flags as null', () => {
    expect(validateConfig({ flags: null }).some((e) => e.message.includes('object'))).toBe(true);
  });

  it('rejects non-boolean enabled', () => {
    expect(
      validateConfig({ flags: { f: { enabled: 'yes' } } }).some((e) =>
        e.message.includes('boolean'),
      ),
    ).toBe(true);
  });

  it('rejects non-string description', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, description: 123 } } }).some((e) =>
        e.message.includes('string'),
      ),
    ).toBe(true);
  });

  it('rejects non-array tags', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, tags: 'beta' } } }).some((e) =>
        e.message.includes('array'),
      ),
    ).toBe(true);
  });

  it('rejects non-string tag items', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, tags: [123] } } }).some((e) =>
        e.message.includes('string'),
      ),
    ).toBe(true);
  });

  it('rejects non-integer rollout', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, rollout: 3.5 } } }).some((e) =>
        e.message.includes('integer'),
      ),
    ).toBe(true);
  });

  it('rejects non-array rules', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, rules: 'rule' } } }).some((e) =>
        e.message.includes('array'),
      ),
    ).toBe(true);
  });

  it('rejects rule as non-object', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, rules: ['bad'] } } }).some((e) =>
        e.message.includes('object'),
      ),
    ).toBe(true);
  });

  it('rejects rule conditions as array', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, rules: [{ conditions: [1] }] } } }).some((e) =>
        e.message.includes('object'),
      ),
    ).toBe(true);
  });

  it('rejects rule with invalid rollout', () => {
    expect(
      validateConfig({
        flags: { f: { enabled: true, rules: [{ conditions: {}, rollout: 200 }] } },
      }).some((e) => e.message.includes('0-100')),
    ).toBe(true);
  });

  it('rejects rule with non-string variant', () => {
    expect(
      validateConfig({
        flags: { f: { enabled: true, rules: [{ conditions: {}, variant: 123 }] } },
      }).some((e) => e.message.includes('string')),
    ).toBe(true);
  });

  it('rejects rule with non-boolean enabled', () => {
    expect(
      validateConfig({
        flags: { f: { enabled: true, rules: [{ conditions: {}, enabled: 'yes' }] } },
      }).some((e) => e.message.includes('boolean')),
    ).toBe(true);
  });

  it('rejects variant as non-object', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, variants: ['bad'] } } }).some((e) =>
        e.message.includes('object'),
      ),
    ).toBe(true);
  });

  it('rejects variant with negative weight', () => {
    expect(
      validateConfig({
        flags: { f: { enabled: true, variants: [{ name: 'a', weight: -1 }] } },
      }).some((e) => e.message.includes('non-negative')),
    ).toBe(true);
  });

  it('rejects non-array variants', () => {
    expect(
      validateConfig({ flags: { f: { enabled: true, variants: 'bad' } } }).some((e) =>
        e.message.includes('array'),
      ),
    ).toBe(true);
  });

  it('rejects flag name exceeding max length', () => {
    const longName = 'a'.repeat(129);
    expect(
      validateConfig({ flags: { [longName]: { enabled: true } } }).some((e) =>
        e.message.includes('max length'),
      ),
    ).toBe(true);
  });

  it('rejects flag definition as non-object', () => {
    expect(
      validateConfig({ flags: { f: 'not-object' } }).some((e) => e.message.includes('object')),
    ).toBe(true);
  });

  it('accepts version 1 explicitly', () => {
    expect(validateConfig({ version: 1, flags: {} })).toEqual([]);
  });

  it('parseFlagConfig handles rules and variants correctly', () => {
    const { config, errors } = parseFlagConfig({
      flags: {
        f: {
          enabled: true,
          description: 'test',
          tags: ['beta'],
          rollout: 50,
          rules: [{ conditions: { plan: 'pro' }, enabled: true, rollout: 80, variant: 'premium' }],
          variants: [
            { name: 'a', weight: 50 },
            { name: 'b', weight: 50 },
          ],
        },
      },
    });
    expect(errors).toEqual([]);
    expect(config.flags.f.rules?.[0].variant).toBe('premium');
    expect(config.flags.f.variants?.[0].name).toBe('a');
    expect(config.flags.f.description).toBe('test');
    expect(config.flags.f.tags).toEqual(['beta']);
  });
});
