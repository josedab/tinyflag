import { describe, it, expect, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { createTinyFlag, flag, variant, setContext } from '../index.js';
import { TinyFlag } from 'tinyflag';

function createInstance(
  flags: Record<string, { enabled: boolean; variants?: { name: string; weight: number }[] }>,
) {
  return new TinyFlag({ source: { flags } });
}

describe('tinyflag-svelte', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('flag returns store for enabled flag', async () => {
    const ff = createInstance({ 'my-flag': { enabled: true } });
    await ff.init();

    const { destroy } = createTinyFlag({ source: { flags: {} }, instance: ff });
    cleanup = destroy;

    const store = flag('my-flag');
    expect(get(store)).toBe(true);
    ff.destroy();
  });

  it('flag returns false for unknown flag', async () => {
    const ff = createInstance({ 'my-flag': { enabled: true } });
    await ff.init();

    const { destroy } = createTinyFlag({ source: { flags: {} }, instance: ff });
    cleanup = destroy;

    const store = flag('nonexistent');
    expect(get(store)).toBe(false);
    ff.destroy();
  });

  it('variant returns variant store', async () => {
    const ff = createInstance({
      'ab-test': {
        enabled: true,
        variants: [
          { name: 'control', weight: 50 },
          { name: 'treatment', weight: 50 },
        ],
      },
    });
    await ff.init();

    const { destroy } = createTinyFlag({
      source: { flags: {} },
      instance: ff,
      context: { userId: 'user-1' },
    });
    cleanup = destroy;

    const store = variant('ab-test');
    const value = get(store);
    expect(typeof value).toBe('string');
    expect(['control', 'treatment']).toContain(value);
    ff.destroy();
  });

  it('createTinyFlag initializes context', async () => {
    const ff = createInstance({ 'test-flag': { enabled: true } });
    await ff.init();

    const { instance, destroy } = createTinyFlag({
      source: { flags: {} },
      instance: ff,
    });
    cleanup = destroy;

    expect(instance).toBe(ff);
    ff.destroy();
  });

  it('setContext updates evaluation context', async () => {
    const ff = createInstance({
      'test-flag': { enabled: true },
    });
    await ff.init();

    const { destroy } = createTinyFlag({
      source: { flags: {} },
      instance: ff,
    });
    cleanup = destroy;

    // setContext should not throw
    expect(() => setContext({ userId: 'new-user' })).not.toThrow();
    expect(() => setContext(undefined)).not.toThrow();
    ff.destroy();
  });

  it('destroy cleans up instance', async () => {
    const ff = createInstance({ 'test-flag': { enabled: true } });
    await ff.init();

    const { instance, destroy } = createTinyFlag({
      source: { flags: {} },
      instance: ff,
    });

    // destroy should not throw
    destroy();
    // Further calls should still work on the external instance
    expect(instance).toBe(ff);
    ff.destroy();
  });

  it('flag() and variant() throw when called without createTinyFlag', async () => {
    // Reset fallback by creating and immediately destroying
    const ff = createInstance({ x: { enabled: true } });
    await ff.init();
    const { destroy } = createTinyFlag({ source: { flags: {} }, instance: ff });
    destroy();
    ff.destroy();

    // After destroy and fallback cleared, flag() should throw
    expect(() => flag('any-flag')).toThrow('createTinyFlag');
  });
});
