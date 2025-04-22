import { describe, it, expect } from 'vitest';
import { createMockTinyFlag, createFlag } from '../testing.js';

describe('createMockTinyFlag', () => {
  it('creates instance from boolean flag values', async () => {
    const ff = await createMockTinyFlag({
      flags: {
        'feature-on': true,
        'feature-off': false,
      },
    });

    expect(ff.isEnabled('feature-on')).toBe(true);
    expect(ff.isEnabled('feature-off')).toBe(false);
    ff.destroy();
  });

  it('creates instance from full flag definitions', async () => {
    const ff = await createMockTinyFlag({
      flags: {
        'experiment': {
          enabled: true,
          variants: [
            { name: 'control', weight: 50 },
            { name: 'new-flow', weight: 50 },
          ],
        },
      },
    });

    expect(ff.isEnabled('experiment')).toBe(true);
    const variant = ff.getVariant('experiment', { userId: 'user-1' });
    expect(['control', 'new-flow']).toContain(variant);
    ff.destroy();
  });

  it('supports mixed boolean and full definitions', async () => {
    const ff = await createMockTinyFlag({
      flags: {
        'simple': true,
        'complex': {
          enabled: true,
          rollout: 50,
          description: 'A complex flag',
        },
      },
    });

    expect(ff.isEnabled('simple')).toBe(true);
    expect(ff.getFlags()['complex'].description).toBe('A complex flag');
    ff.destroy();
  });

  it('supports overrides on mock instance', async () => {
    const ff = await createMockTinyFlag({
      flags: { 'feature': false },
    });

    expect(ff.isEnabled('feature')).toBe(false);
    ff.override('feature', true);
    expect(ff.isEnabled('feature')).toBe(true);
    ff.destroy();
  });
});

describe('createFlag', () => {
  it('creates a simple enabled flag', () => {
    const flag = createFlag({ enabled: true });
    expect(flag.enabled).toBe(true);
  });

  it('creates a flag with rollout', () => {
    const flag = createFlag({ enabled: true, rollout: 50 });
    expect(flag.rollout).toBe(50);
  });

  it('creates a flag with variants', () => {
    const flag = createFlag({
      enabled: true,
      variants: [
        { name: 'a', weight: 50 },
        { name: 'b', weight: 50 },
      ],
    });
    expect(flag.variants).toHaveLength(2);
  });
});
