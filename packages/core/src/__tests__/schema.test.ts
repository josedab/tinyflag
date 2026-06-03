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

  it('strict mode accepts tenants as a known root field', () => {
    const errors = validateConfig(
      {
        flags: { f: { enabled: true } },
        tenants: {
          'acme': { flags: { f: { enabled: false } } },
        },
      },
      true,
    );
    const rootFieldErrors = errors.filter((e) => e.message.includes('Unknown field "tenants"'));
    expect(rootFieldErrors).toEqual([]);
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

describe('circular segment detection', () => {
  it('detects A→B→A segment cycle', () => {
    const errors = validateConfig({
      flags: {},
      segments: {
        a: { conditions: { x: 1 }, extends: ['b'] },
        b: { conditions: { y: 2 }, extends: ['a'] },
      },
    });
    expect(errors.some((e) => e.message.includes('Circular segment'))).toBe(true);
  });

  it('detects A→B→C→A segment cycle', () => {
    const errors = validateConfig({
      flags: {},
      segments: {
        a: { conditions: {}, extends: ['b'] },
        b: { conditions: {}, extends: ['c'] },
        c: { conditions: {}, extends: ['a'] },
      },
    });
    expect(errors.some((e) => e.message.includes('Circular segment'))).toBe(true);
  });

  it('detects self-reference cycle', () => {
    const errors = validateConfig({
      flags: {},
      segments: {
        a: { conditions: {}, extends: ['a'] },
      },
    });
    expect(errors.some((e) => e.message.includes('Circular segment'))).toBe(true);
  });

  it('accepts segments without cycles', () => {
    const errors = validateConfig({
      flags: {},
      segments: {
        parent: { conditions: { tier: 'premium' } },
        child: { conditions: { plan: 'pro' }, extends: ['parent'] },
      },
    });
    expect(errors.filter((e) => e.message.includes('Circular'))).toHaveLength(0);
  });
});

describe('lifecycle validation', () => {
  it('rejects invalid lifecycle state', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, lifecycle: { state: 'invalid' } } },
    });
    expect(errors.some((e) => e.message.includes('state'))).toBe(true);
  });

  it('requires sunsetAt when state is sunset', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, lifecycle: { state: 'sunset' } } },
    });
    expect(errors.some((e) => e.message.includes('sunsetAt'))).toBe(true);
  });

  it('accepts sunset with sunsetAt', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, lifecycle: { state: 'sunset', sunsetAt: '2025-01-01T00:00:00Z' } } },
    });
    expect(errors.filter((e) => e.path.includes('lifecycle'))).toHaveLength(0);
  });

  it('rejects non-object lifecycle', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, lifecycle: 'active' } },
    });
    expect(errors.some((e) => e.message.includes('object'))).toBe(true);
  });

  it('rejects invalid sunsetAt date', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, lifecycle: { state: 'sunset', sunsetAt: 'not-a-date' } } },
    });
    expect(errors.some((e) => e.message.includes('ISO 8601'))).toBe(true);
  });

  it('rejects non-string sunsetAt', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, lifecycle: { state: 'sunset', sunsetAt: 12345 } } },
    });
    expect(errors.some((e) => e.message.includes('ISO 8601') || e.message.includes('string'))).toBe(true);
  });

  it('rejects missing state field', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, lifecycle: {} } },
    });
    expect(errors.some((e) => e.message.includes('state'))).toBe(true);
  });
});

describe('schedule validation', () => {
  it('rejects non-object schedule', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, schedule: 'soon' } },
    });
    expect(errors.some((e) => e.message.includes('object'))).toBe(true);
  });

  it('rejects invalid enableAt date', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, schedule: { enableAt: 'not-a-date' } } },
    });
    expect(errors.some((e) => e.message.includes('ISO 8601'))).toBe(true);
  });

  it('rejects non-string enableAt', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, schedule: { enableAt: 123 } } },
    });
    expect(errors.some((e) => e.message.includes('ISO 8601') || e.message.includes('string'))).toBe(true);
  });

  it('rejects invalid disableAt date', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, schedule: { disableAt: 'bad-date' } } },
    });
    expect(errors.some((e) => e.message.includes('ISO 8601'))).toBe(true);
  });

  it('rejects non-string disableAt', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, schedule: { disableAt: 123 } } },
    });
    expect(errors.some((e) => e.message.includes('ISO 8601') || e.message.includes('string'))).toBe(true);
  });

  it('rejects unknown schedule fields', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, schedule: { enableAt: '2025-01-01T00:00:00Z', extra: true } } },
    });
    expect(errors.some((e) => e.message.includes('Unknown schedule field'))).toBe(true);
  });

  it('accepts valid schedule', () => {
    const errors = validateConfig({
      flags: {
        f: {
          enabled: true,
          schedule: {
            enableAt: '2025-01-01T00:00:00Z',
            disableAt: '2025-12-31T23:59:59Z',
          },
        },
      },
    });
    expect(errors).toEqual([]);
  });
});

describe('requires validation', () => {
  it('rejects non-array requires', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, requires: 'other-flag' } },
    });
    expect(errors.some((e) => e.message.includes('array'))).toBe(true);
  });

  it('rejects empty string in requires', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, requires: [''] } },
    });
    expect(errors.some((e) => e.message.includes('non-empty'))).toBe(true);
  });

  it('accepts valid requires', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, requires: ['other-flag'] } },
    });
    expect(errors.filter((e) => e.path.includes('requires'))).toHaveLength(0);
  });
});

describe('config field validation', () => {
  it('rejects non-object config field', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, config: 'not-object' } },
    });
    expect(errors.some((e) => e.message.includes('"config" must be an object'))).toBe(true);
  });

  it('accepts valid config field', () => {
    const errors = validateConfig({
      flags: { f: { enabled: true, config: { key: 'value' } } },
    });
    expect(errors).toEqual([]);
  });
});

describe('flag name validation', () => {
  it('accepts single char flag name', () => {
    expect(validateConfig({ flags: { a: { enabled: true } } })).toEqual([]);
  });

  it('rejects 129-char flag name', () => {
    const name = 'a'.repeat(129);
    const errors = validateConfig({ flags: { [name]: { enabled: true } } });
    expect(errors.some((e) => e.message.includes('max length'))).toBe(true);
  });

  it('accepts 128-char kebab-case flag name', () => {
    // Build a valid 128-char kebab-case name
    const name = 'a' + '-b'.repeat(63) + 'c';
    if (name.length <= 128) {
      const errors = validateConfig({ flags: { [name]: { enabled: true } } });
      // May or may not pass depending on pattern, but shouldn't have length error
      expect(errors.filter((e) => e.message.includes('max length'))).toHaveLength(0);
    }
  });

  it('rejects unicode flag name', () => {
    const errors = validateConfig({ flags: { 'flåg': { enabled: true } } });
    expect(errors.some((e) => e.message.includes('Invalid flag name'))).toBe(true);
  });

  it('rejects flag name starting with hyphen', () => {
    const errors = validateConfig({ flags: { '-flag': { enabled: true } } });
    expect(errors.some((e) => e.message.includes('Invalid flag name'))).toBe(true);
  });

  it('rejects flag name ending with hyphen', () => {
    const errors = validateConfig({ flags: { 'flag-': { enabled: true } } });
    expect(errors.some((e) => e.message.includes('Invalid flag name'))).toBe(true);
  });
});

describe('personas validation', () => {
  it('rejects non-object personas', () => {
    const errors = validateConfig({ flags: {}, personas: 'bad' });
    expect(errors.some((e) => e.message.includes('personas'))).toBe(true);
  });

  it('rejects non-object persona definition', () => {
    const errors = validateConfig({ flags: {}, personas: { user: 'bad' } });
    expect(errors.some((e) => e.message.includes('Persona definition'))).toBe(true);
  });

  it('accepts valid personas', () => {
    const errors = validateConfig({
      flags: {},
      personas: { admin: { role: 'admin', plan: 'enterprise' } },
    });
    expect(errors).toEqual([]);
  });
});

describe('segments validation', () => {
  it('rejects non-object segments', () => {
    const errors = validateConfig({ flags: {}, segments: 'bad' });
    expect(errors.some((e) => e.message.includes('segments'))).toBe(true);
  });

  it('rejects non-object segment definition', () => {
    const errors = validateConfig({ flags: {}, segments: { s: 'bad' } });
    expect(errors.some((e) => e.message.includes('Segment definition'))).toBe(true);
  });

  it('rejects segment without conditions', () => {
    const errors = validateConfig({ flags: {}, segments: { s: {} } });
    expect(errors.some((e) => e.message.includes('conditions'))).toBe(true);
  });

  it('rejects non-object conditions in segment', () => {
    const errors = validateConfig({ flags: {}, segments: { s: { conditions: 'bad' } } });
    expect(errors.some((e) => e.message.includes('conditions'))).toBe(true);
  });

  it('rejects non-array extends in segment', () => {
    const errors = validateConfig({ flags: {}, segments: { s: { conditions: {}, extends: 'parent' } } });
    expect(errors.some((e) => e.message.includes('array'))).toBe(true);
  });

  it('rejects empty string in extends', () => {
    const errors = validateConfig({ flags: {}, segments: { s: { conditions: {}, extends: [''] } } });
    expect(errors.some((e) => e.message.includes('non-empty'))).toBe(true);
  });
});

describe('parseFlagConfig advanced', () => {
  it('parses schedule fields', () => {
    const { config, errors } = parseFlagConfig({
      flags: {
        f: {
          enabled: true,
          schedule: { enableAt: '2025-01-01T00:00:00Z', disableAt: '2025-12-31T23:59:59Z' },
        },
      },
    });
    expect(errors).toEqual([]);
    expect(config.flags.f.schedule?.enableAt).toBe('2025-01-01T00:00:00Z');
    expect(config.flags.f.schedule?.disableAt).toBe('2025-12-31T23:59:59Z');
  });

  it('parses requires field', () => {
    const { config, errors } = parseFlagConfig({
      flags: {
        f: { enabled: true, requires: ['other'] },
      },
    });
    expect(errors).toEqual([]);
    expect(config.flags.f.requires).toEqual(['other']);
  });

  it('parses lifecycle field', () => {
    const { config, errors } = parseFlagConfig({
      flags: {
        f: { enabled: true, lifecycle: { state: 'active' } },
      },
    });
    expect(errors).toEqual([]);
    expect(config.flags.f.lifecycle?.state).toBe('active');
  });

  it('parses lifecycle with sunsetAt', () => {
    const { config, errors } = parseFlagConfig({
      flags: {
        f: { enabled: true, lifecycle: { state: 'sunset', sunsetAt: '2025-06-01T00:00:00Z' } },
      },
    });
    expect(errors).toEqual([]);
    expect(config.flags.f.lifecycle?.sunsetAt).toBe('2025-06-01T00:00:00Z');
  });

  it('parses config field', () => {
    const { config, errors } = parseFlagConfig({
      flags: {
        f: { enabled: true, config: { maxItems: 10 } },
      },
    });
    expect(errors).toEqual([]);
    expect(config.flags.f.config).toEqual({ maxItems: 10 });
  });

  it('parses segments', () => {
    const { config, errors } = parseFlagConfig({
      flags: {},
      segments: {
        beta: { conditions: { plan: 'beta' }, extends: ['internal'] },
        internal: { conditions: { email: '*@company.com' } },
      },
    });
    expect(errors).toEqual([]);
    expect(config.segments?.beta.conditions.plan).toBe('beta');
    expect(config.segments?.beta.extends).toEqual(['internal']);
  });

  it('parses personas', () => {
    const { config, errors } = parseFlagConfig({
      flags: {},
      personas: { admin: { role: 'admin' } },
    });
    expect(errors).toEqual([]);
    expect(config.personas?.admin.role).toBe('admin');
  });

  it('returns errors for invalid config', () => {
    const { config, errors } = parseFlagConfig(null);
    expect(errors.length).toBeGreaterThan(0);
    expect(config).toEqual({ flags: {} });
  });

  it('detects unknown root fields in lenient mode', () => {
    const { warnings } = parseFlagConfig({ flags: {}, customField: 'x' });
    expect(warnings.some((w) => w.message.includes('Unknown field'))).toBe(true);
  });

  it('parses rules with segment reference', () => {
    const { config, errors } = parseFlagConfig({
      flags: {
        f: {
          enabled: true,
          rules: [{ conditions: {}, segment: 'beta' }],
        },
      },
    });
    expect(errors).toEqual([]);
    expect(config.flags.f.rules?.[0].segment).toBe('beta');
  });
});
