import { describe, it, expect } from 'vitest';
import { mergeFlagConfigs } from '../merge.js';
import type { FlagConfig, FlagDefinition, MergeWarning } from '../types.js';

function makeConfig(flags: Record<string, FlagDefinition>, version = 1): FlagConfig {
  return { version, flags };
}

describe('mergeFlagConfigs', () => {
  it('returns empty config for empty array', () => {
    const { config, warnings } = mergeFlagConfigs([]);
    expect(config).toEqual({ flags: {} });
    expect(warnings).toEqual([]);
  });

  it('passes through single config unchanged', () => {
    const input = makeConfig({ 'my-flag': { enabled: true, description: 'desc' } });
    const { config, warnings } = mergeFlagConfigs([input]);
    expect(config).toBe(input);
    expect(warnings).toEqual([]);
  });

  it('later config overrides enabled field', () => {
    const c1 = makeConfig({ 'f': { enabled: true } });
    const c2 = makeConfig({ 'f': { enabled: false } });
    const { config, warnings } = mergeFlagConfigs([c1, c2]);
    expect(config.flags['f'].enabled).toBe(false);
    expect(warnings.some((w) => w.field === 'enabled')).toBe(true);
  });

  it('later config overrides rollout', () => {
    const c1 = makeConfig({ 'f': { enabled: true, rollout: 50 } });
    const c2 = makeConfig({ 'f': { enabled: true, rollout: 75 } });
    const { config, warnings } = mergeFlagConfigs([c1, c2]);
    expect(config.flags['f'].rollout).toBe(75);
    expect(warnings.some((w) => w.field === 'rollout')).toBe(true);
  });

  it('later config overrides description', () => {
    const c1 = makeConfig({ 'f': { enabled: true, description: 'old' } });
    const c2 = makeConfig({ 'f': { enabled: true, description: 'new' } });
    const { config } = mergeFlagConfigs([c1, c2]);
    expect(config.flags['f'].description).toBe('new');
  });

  it('later config overrides tags', () => {
    const c1 = makeConfig({ 'f': { enabled: true, tags: ['a', 'b'] } });
    const c2 = makeConfig({ 'f': { enabled: true, tags: ['c'] } });
    const { config } = mergeFlagConfigs([c1, c2]);
    expect(config.flags['f'].tags).toEqual(['c']);
  });

  it('later config overrides rules with warning', () => {
    const c1 = makeConfig({
      'f': {
        enabled: true,
        rules: [{ conditions: { plan: 'pro' } }],
      },
    });
    const c2 = makeConfig({
      'f': {
        enabled: true,
        rules: [{ conditions: { plan: 'enterprise' } }, { conditions: { plan: 'team' } }],
      },
    });
    const { config, warnings } = mergeFlagConfigs([c1, c2]);
    expect(config.flags['f'].rules).toHaveLength(2);
    expect(warnings.some((w) => w.field === 'rules')).toBe(true);
  });

  it('later config overrides schedule', () => {
    const c1 = makeConfig({ 'f': { enabled: true, schedule: { enableAt: '2025-01-01T00:00:00Z' } } });
    const c2 = makeConfig({ 'f': { enabled: true, schedule: { enableAt: '2026-01-01T00:00:00Z' } } });
    const { config } = mergeFlagConfigs([c1, c2]);
    expect(config.flags['f'].schedule?.enableAt).toBe('2026-01-01T00:00:00Z');
  });

  describe('variant merging by name', () => {
    it('adds new variants from overlay', () => {
      const c1 = makeConfig({
        'f': {
          enabled: true,
          variants: [{ name: 'control', weight: 50 }],
        },
      });
      const c2 = makeConfig({
        'f': {
          enabled: true,
          variants: [{ name: 'treatment', weight: 50 }],
        },
      });
      const { config } = mergeFlagConfigs([c1, c2]);
      expect(config.flags['f'].variants).toHaveLength(2);
      expect(config.flags['f'].variants?.find((v) => v.name === 'control')).toBeDefined();
      expect(config.flags['f'].variants?.find((v) => v.name === 'treatment')).toBeDefined();
    });

    it('replaces existing variant weight with warning', () => {
      const c1 = makeConfig({
        'f': {
          enabled: true,
          variants: [{ name: 'control', weight: 50 }, { name: 'treatment', weight: 50 }],
        },
      });
      const c2 = makeConfig({
        'f': {
          enabled: true,
          variants: [{ name: 'control', weight: 80 }],
        },
      });
      const { config, warnings } = mergeFlagConfigs([c1, c2]);
      const control = config.flags['f'].variants?.find((v) => v.name === 'control');
      expect(control?.weight).toBe(80);
      expect(warnings.some((w) => w.field === 'variants.control')).toBe(true);
    });

    it('sets variants directly when base has no variants', () => {
      const c1 = makeConfig({ 'f': { enabled: true } });
      const c2 = makeConfig({
        'f': {
          enabled: true,
          variants: [{ name: 'a', weight: 100 }],
        },
      });
      const { config } = mergeFlagConfigs([c1, c2]);
      expect(config.flags['f'].variants).toEqual([{ name: 'a', weight: 100 }]);
    });
  });

  it('adds flag from second config not in first', () => {
    const c1 = makeConfig({ 'flag-a': { enabled: true } });
    const c2 = makeConfig({ 'flag-b': { enabled: false } });
    const { config, warnings } = mergeFlagConfigs([c1, c2]);
    expect(config.flags['flag-a'].enabled).toBe(true);
    expect(config.flags['flag-b'].enabled).toBe(false);
    expect(warnings).toHaveLength(0);
  });

  it('uses version from last config', () => {
    const c1 = makeConfig({ 'f': { enabled: true } }, 1);
    const c2 = makeConfig({ 'g': { enabled: true } }, 1);
    const { config } = mergeFlagConfigs([c1, c2]);
    expect(config.version).toBe(1);
  });

  it('merges three configs in order', () => {
    const c1 = makeConfig({ 'f': { enabled: true, rollout: 10 } });
    const c2 = makeConfig({ 'f': { enabled: true, rollout: 50 } });
    const c3 = makeConfig({ 'f': { enabled: false, rollout: 90 } });
    const { config, warnings } = mergeFlagConfigs([c1, c2, c3]);
    expect(config.flags['f'].enabled).toBe(false);
    expect(config.flags['f'].rollout).toBe(90);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('generates no warning when enabled values are the same', () => {
    const c1 = makeConfig({ 'f': { enabled: true } });
    const c2 = makeConfig({ 'f': { enabled: true } });
    const { warnings } = mergeFlagConfigs([c1, c2]);
    expect(warnings.filter((w) => w.field === 'enabled')).toHaveLength(0);
  });

  it('generates no warning when rollout is undefined in overlay', () => {
    const c1 = makeConfig({ 'f': { enabled: true, rollout: 50 } });
    const c2 = makeConfig({ 'f': { enabled: true } });
    const { warnings } = mergeFlagConfigs([c1, c2]);
    expect(warnings.filter((w) => w.field === 'rollout')).toHaveLength(0);
  });
});
