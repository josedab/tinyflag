import { afterEach, describe, expect, it } from 'vitest';
import { TinyFlag } from '../tinyflag.js';
import type { FlagDefinition } from '../types.js';

const instances: TinyFlag[] = [];

afterEach(() => {
  for (const instance of instances.splice(0)) {
    instance.destroy();
  }
  delete process.env.TINYFLAG_CONFIG_FLAG;
});

describe('TinyFlag facade characterization', () => {
  it('getConfig follows file evaluation rather than runtime overrides', async () => {
    const instance = await createInstance({
      'config-flag': {
        enabled: true,
        config: { color: 'blue' },
      },
    });

    instance.override('config-flag', false);
    expect(instance.getConfig('config-flag')).toEqual({ color: 'blue' });
  });

  it('getConfig ignores an enabling environment override for a disabled flag', async () => {
    process.env.TINYFLAG_CONFIG_FLAG = 'true';
    const instance = await createInstance({
      'config-flag': {
        enabled: false,
        config: { color: 'blue' },
      },
    });

    expect(instance.getConfig('config-flag')).toBeNull();
  });

  it('evaluateWithPersona follows file evaluation rather than runtime overrides', async () => {
    const instance = await createInstance(
      {
        'persona-flag': {
          enabled: true,
          rules: [{ conditions: { plan: 'pro' }, enabled: true }],
        },
      },
      { pro: { plan: 'pro', userId: 'persona-user' } },
    );

    instance.override('persona-flag', false);
    expect(instance.evaluateWithPersona('persona-flag', 'pro')).toBe(true);
  });

  it('getAllFlags exposes string overrides as enabled variants', async () => {
    const instance = await createInstance({
      experiment: {
        enabled: false,
        variants: [{ name: 'control', weight: 100 }],
      },
    });

    instance.override('experiment', 'treatment');
    expect(instance.getAllFlags({ userId: 'user-1' })).toEqual({
      experiment: { enabled: true, variant: 'treatment' },
    });
  });

  it('deduplicates exposure across enabled and variant reads for the same user', async () => {
    const instance = await createInstance({
      experiment: {
        enabled: true,
        variants: [{ name: 'control', weight: 100 }],
      },
    });
    const exposures: string[] = [];
    instance.on('exposure', (event) => exposures.push(`${event.flag}:${event.userId}`));

    instance.isEnabled('experiment', { userId: 'user-1' });
    instance.getVariant('experiment', { userId: 'user-1' });

    expect(exposures).toEqual(['experiment:user-1']);
  });

  it('destroy clears overrides but leaves loaded flags evaluable', async () => {
    const instance = await createInstance({
      'destroy-flag': { enabled: true },
    });
    instance.override('destroy-flag', false);
    expect(instance.isEnabled('destroy-flag')).toBe(false);

    instance.destroy();
    expect(instance.isEnabled('destroy-flag')).toBe(true);
  });
});

async function createInstance(
  flags: Record<string, FlagDefinition>,
  personas?: Record<string, Record<string, unknown>>,
): Promise<TinyFlag> {
  const instance = new TinyFlag({
    source: {
      version: 1,
      flags,
      personas,
    },
  });
  instances.push(instance);
  await instance.init();
  return instance;
}
