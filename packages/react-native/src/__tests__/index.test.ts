import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadCachedFlags,
  saveFlagsToCache,
  useFlagWithOffline,
  createOfflineInstance,
} from '../index.js';
import type { StorageAdapter } from '../index.js';
import type { FlagConfig } from 'tinyflag';

function createMockStorage(data: Record<string, string> = {}): StorageAdapter {
  const store = { ...data };
  return {
    getItem: vi.fn(async (key: string) => store[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
  };
}

describe('loadCachedFlags', () => {
  it('returns cached config when available', async () => {
    const config: FlagConfig = { version: 1, flags: { 'my-flag': { enabled: true } } };
    const storage = createMockStorage({ '@tinyflag/flags': JSON.stringify(config) });

    const result = await loadCachedFlags(storage);
    expect(result).toEqual(config);
    expect(storage.getItem).toHaveBeenCalledWith('@tinyflag/flags');
  });

  it('returns null when no cache exists', async () => {
    const storage = createMockStorage();
    const result = await loadCachedFlags(storage);
    expect(result).toBeNull();
  });

  it('returns null on corrupted cache (invalid JSON)', async () => {
    const storage = createMockStorage({ '@tinyflag/flags': 'not valid json' });
    const result = await loadCachedFlags(storage);
    expect(result).toBeNull();
  });

  it('returns null when storage.getItem throws', async () => {
    const storage: StorageAdapter = {
      getItem: vi.fn(async () => {
        throw new Error('Storage unavailable');
      }),
      setItem: vi.fn(),
    };
    const result = await loadCachedFlags(storage);
    expect(result).toBeNull();
  });
});

describe('saveFlagsToCache', () => {
  it('saves flags to storage', async () => {
    const storage = createMockStorage();
    const config: FlagConfig = { version: 1, flags: { 'my-flag': { enabled: true } } };

    await saveFlagsToCache(storage, config);
    expect(storage.setItem).toHaveBeenCalledWith('@tinyflag/flags', JSON.stringify(config));
  });

  it('does not throw when storage.setItem fails', async () => {
    const storage: StorageAdapter = {
      getItem: vi.fn(),
      setItem: vi.fn(async () => {
        throw new Error('Disk full');
      }),
    };

    await expect(saveFlagsToCache(storage, { flags: {} })).resolves.toBeUndefined();
  });
});

describe('useFlagWithOffline', () => {
  it('returns enabled value from instance', () => {
    const mockInstance = {
      isEnabled: vi.fn(() => true),
      getFlags: vi.fn(() => ({ 'my-flag': { enabled: true } })),
    } as any;

    const result = useFlagWithOffline({
      instance: mockInstance,
      flagName: 'my-flag',
    });

    expect(result.enabled).toBe(true);
    expect(result.isOffline).toBe(false);
  });

  it('returns defaultValue when no flags loaded (offline)', () => {
    const mockInstance = {
      isEnabled: vi.fn(() => false),
      getFlags: vi.fn(() => ({})),
    } as any;

    const result = useFlagWithOffline({
      instance: mockInstance,
      flagName: 'my-flag',
      defaultValue: true,
    });

    expect(result.enabled).toBe(true);
    expect(result.isOffline).toBe(true);
  });

  it('defaults to false when offline and no defaultValue', () => {
    const mockInstance = {
      isEnabled: vi.fn(() => false),
      getFlags: vi.fn(() => ({})),
    } as any;

    const result = useFlagWithOffline({
      instance: mockInstance,
      flagName: 'my-flag',
    });

    expect(result.enabled).toBe(false);
    expect(result.isOffline).toBe(true);
  });

  it('passes context to isEnabled', () => {
    const mockInstance = {
      isEnabled: vi.fn(() => false),
      getFlags: vi.fn(() => ({ 'my-flag': { enabled: false } })),
    } as any;

    const context = { userId: 'user-1', plan: 'pro' };
    useFlagWithOffline({
      instance: mockInstance,
      flagName: 'my-flag',
      context,
    });

    expect(mockInstance.isEnabled).toHaveBeenCalledWith('my-flag', context);
  });
});

describe('createOfflineInstance', () => {
  it('creates instance from cache when available', async () => {
    const config: FlagConfig = { version: 1, flags: { 'cached-flag': { enabled: true } } };
    const storage = createMockStorage({ '@tinyflag/flags': JSON.stringify(config) });

    const instance = await createOfflineInstance(
      { source: { version: 1, flags: { 'fresh-flag': { enabled: true } } } },
      storage,
    );

    // Should have the cached flag initially
    expect(instance.isEnabled('cached-flag')).toBe(true);
    instance.destroy();
  });

  it('creates instance from source when no cache', async () => {
    const storage = createMockStorage();

    const instance = await createOfflineInstance(
      { source: { version: 1, flags: { 'fresh-flag': { enabled: true } } } },
      storage,
    );

    expect(instance.isEnabled('fresh-flag')).toBe(true);
    // Should have cached the initial load
    expect(storage.setItem).toHaveBeenCalled();
    instance.destroy();
  });
});
