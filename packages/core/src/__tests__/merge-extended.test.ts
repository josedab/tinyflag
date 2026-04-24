import { describe, it, expect } from 'vitest';
import { diffEnvConfigs, formatEnvDiff, mergeFlagConfigs } from '../merge.js';
import type { FlagConfig } from '../types.js';

function makeConfig(flags: Record<string, any>, extras: Partial<FlagConfig> = {}): FlagConfig {
  return { version: 1, flags, ...extras };
}

describe('diffEnvConfigs', () => {
  it('detects flags only in envA', () => {
    const envA = makeConfig({ 'flag-a': { enabled: true } });
    const envB = makeConfig({});
    const diffs = diffEnvConfigs('staging', envA, 'prod', envB);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].flag).toBe('flag-a');
    expect(diffs[0].field).toBe('(flag)');
    expect(diffs[0].envA.value).toBe('defined');
    expect(diffs[0].envB.value).toBeUndefined();
  });

  it('detects flags only in envB', () => {
    const envA = makeConfig({});
    const envB = makeConfig({ 'flag-b': { enabled: false } });
    const diffs = diffEnvConfigs('staging', envA, 'prod', envB);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].envA.value).toBeUndefined();
    expect(diffs[0].envB.value).toBe('defined');
  });

  it('detects different enabled values', () => {
    const envA = makeConfig({ f: { enabled: true } });
    const envB = makeConfig({ f: { enabled: false } });
    const diffs = diffEnvConfigs('staging', envA, 'prod', envB);

    const enabledDiff = diffs.find((d) => d.field === 'enabled');
    expect(enabledDiff).toBeDefined();
    expect(enabledDiff!.envA.value).toBe(true);
    expect(enabledDiff!.envB.value).toBe(false);
  });

  it('detects different rollout values', () => {
    const envA = makeConfig({ f: { enabled: true, rollout: 10 } });
    const envB = makeConfig({ f: { enabled: true, rollout: 90 } });
    const diffs = diffEnvConfigs('s', envA, 'p', envB);

    const rolloutDiff = diffs.find((d) => d.field === 'rollout');
    expect(rolloutDiff).toBeDefined();
    expect(rolloutDiff!.envA.value).toBe(10);
    expect(rolloutDiff!.envB.value).toBe(90);
  });

  it('detects different rules', () => {
    const envA = makeConfig({ f: { enabled: true, rules: [{ conditions: { plan: 'pro' } }] } });
    const envB = makeConfig({
      f: { enabled: true, rules: [{ conditions: { plan: 'enterprise' } }] },
    });
    const diffs = diffEnvConfigs('s', envA, 'p', envB);

    const rulesDiff = diffs.find((d) => d.field === 'rules');
    expect(rulesDiff).toBeDefined();
  });

  it('detects different variants', () => {
    const envA = makeConfig({ f: { enabled: true, variants: [{ name: 'a', weight: 50 }] } });
    const envB = makeConfig({ f: { enabled: true, variants: [{ name: 'b', weight: 50 }] } });
    const diffs = diffEnvConfigs('s', envA, 'p', envB);

    const variantsDiff = diffs.find((d) => d.field === 'variants');
    expect(variantsDiff).toBeDefined();
  });

  it('returns empty diff for identical environments', () => {
    const config = makeConfig({ f: { enabled: true, rollout: 50 } });
    const diffs = diffEnvConfigs('staging', config, 'prod', config);
    expect(diffs).toHaveLength(0);
  });

  it('handles undefined rollout/rules/variants comparisons', () => {
    const envA = makeConfig({ f: { enabled: true } });
    const envB = makeConfig({ f: { enabled: true } });
    const diffs = diffEnvConfigs('s', envA, 'p', envB);
    expect(diffs).toHaveLength(0);
  });
});

describe('formatEnvDiff', () => {
  it('returns header-only for empty diff', () => {
    const output = formatEnvDiff([]);
    expect(output).toContain('No differences');
  });

  it('formats a single flag diff', () => {
    const diffs = diffEnvConfigs(
      'staging',
      makeConfig({ f: { enabled: true } }),
      'prod',
      makeConfig({ f: { enabled: false } }),
    );
    const output = formatEnvDiff(diffs);
    expect(output).toContain('staging');
    expect(output).toContain('prod');
    expect(output).toContain('enabled');
    expect(output).toContain('1 difference');
  });

  it('formats multi-flag diff', () => {
    const diffs = diffEnvConfigs(
      'staging',
      makeConfig({ a: { enabled: true, rollout: 10 }, b: { enabled: true } }),
      'prod',
      makeConfig({ a: { enabled: false, rollout: 90 }, b: { enabled: false } }),
    );
    const output = formatEnvDiff(diffs);
    expect(output).toContain('a:');
    expect(output).toContain('b:');
    expect(output).toMatch(/\d+ difference/);
  });
});

describe('mergeFlagConfigs - segments', () => {
  it('merges overlapping segments from multiple configs', () => {
    const c1 = makeConfig(
      { f: { enabled: true } },
      { segments: { beta: { conditions: { plan: 'beta' } } } },
    );
    const c2 = makeConfig(
      { f: { enabled: true } },
      { segments: { beta: { conditions: { plan: 'beta-v2' } } } },
    );
    const { config, warnings } = mergeFlagConfigs([c1, c2]);
    expect(config.segments?.beta.conditions.plan).toBe('beta-v2');
    expect(warnings.some((w) => w.flag.includes('segment:beta'))).toBe(true);
  });

  it('merges disjoint segments from both sources', () => {
    const c1 = makeConfig(
      { f: { enabled: true } },
      { segments: { alpha: { conditions: { plan: 'alpha' } } } },
    );
    const c2 = makeConfig(
      { f: { enabled: true } },
      { segments: { beta: { conditions: { plan: 'beta' } } } },
    );
    const { config } = mergeFlagConfigs([c1, c2]);
    expect(config.segments?.alpha).toBeDefined();
    expect(config.segments?.beta).toBeDefined();
  });

  it('skips segments when none provided', () => {
    const c1 = makeConfig({ f: { enabled: true } });
    const c2 = makeConfig({ g: { enabled: true } });
    const { config } = mergeFlagConfigs([c1, c2]);
    expect(config.segments).toBeUndefined();
  });
});

describe('mergeFlagConfigs - personas', () => {
  it('merges personas from both sources', () => {
    const c1 = makeConfig(
      { f: { enabled: true } },
      { personas: { admin: { role: 'admin', plan: 'enterprise' } } },
    );
    const c2 = makeConfig(
      { f: { enabled: true } },
      { personas: { admin: { region: 'us' }, user: { role: 'viewer' } } },
    );
    const { config } = mergeFlagConfigs([c1, c2]);
    expect(config.personas?.admin).toEqual({ role: 'admin', plan: 'enterprise', region: 'us' });
    expect(config.personas?.user).toEqual({ role: 'viewer' });
  });

  it('later persona properties override earlier ones', () => {
    const c1 = makeConfig({}, { personas: { test: { name: 'old' } } });
    const c2 = makeConfig({}, { personas: { test: { name: 'new' } } });
    const { config } = mergeFlagConfigs([c1, c2]);
    expect(config.personas?.test.name).toBe('new');
  });
});
