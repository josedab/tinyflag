import { useEffect, useMemo, useRef, useState } from 'react';
import { TinyFlag } from 'tinyflag';
import type { FlagConfig, FlagDefinition, UserContext, TinyFlagOptions } from 'tinyflag';

const CACHE_KEY = '@tinyflag/flags';

/** Storage adapter interface for offline flag caching (AsyncStorage-compatible). */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * Load cached flags from storage.
 * Returns `null` if no cache exists or the cache is corrupted.
 *
 * @param storage - AsyncStorage-compatible storage adapter.
 * @returns Cached flag configuration, or `null` if unavailable.
 */
export async function loadCachedFlags(storage: StorageAdapter): Promise<FlagConfig | null> {
  try {
    const cached = await storage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as FlagConfig;
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[tinyflag-react-native] Cache read failed:', error instanceof Error ? error.message : String(error));
    }
  }
  return null;
}

/**
 * Save flags to storage for offline use.
 *
 * @param storage - AsyncStorage-compatible storage adapter.
 * @param flags - Flag configuration to cache.
 */
export async function saveFlagsToCache(
  storage: StorageAdapter,
  flags: FlagConfig,
): Promise<void> {
  try {
    await storage.setItem(CACHE_KEY, JSON.stringify(flags));
  } catch (error) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[tinyflag-react-native] Cache write failed:', error instanceof Error ? error.message : String(error));
    }
  }
}

export interface UseFlagWithOfflineOptions {
  /** TinyFlag instance. */
  instance: TinyFlag;
  /** Flag name to evaluate. */
  flagName: string;
  /** User context for evaluation. */
  context?: UserContext;
  /** Storage adapter for offline caching (AsyncStorage-compatible). */
  storage?: StorageAdapter;
  /** Default value when flag is not found. Default: false. */
  defaultValue?: boolean;
}

/**
 * React hook for flag evaluation with offline support.
 * Returns the flag value. The `isOffline` field indicates whether
 * the instance has no flags loaded (e.g., network unavailable and no cache).
 */
export function useFlagWithOffline({
  instance,
  flagName,
  context,
  defaultValue = false,
}: UseFlagWithOfflineOptions): { enabled: boolean; isOffline: boolean } {
  const flags = instance.getFlags();
  const isOffline = Object.keys(flags).length === 0;
  const enabled = isOffline ? defaultValue : instance.isEnabled(flagName, context);

  return { enabled, isOffline };
}

export interface UseBackgroundRefreshOptions {
  /** TinyFlag instance to refresh. */
  instance: TinyFlag;
  /** Refresh interval in ms. Default: 30000 (30s). */
  interval?: number;
  /** Storage adapter for caching after refresh. */
  storage?: StorageAdapter;
}

/**
 * React hook that refreshes flags in the background.
 * For React Native, pair with AppState listener for foreground refresh.
 */
export function useBackgroundRefresh({
  instance,
  interval = 30_000,
  storage,
}: UseBackgroundRefreshOptions): void {
  const instanceRef = useRef(instance);
  instanceRef.current = instance;

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await instanceRef.current.reload();
        if (storage) {
          const flags = instanceRef.current.getFlags();
          await saveFlagsToCache(storage, { flags: flags as Record<string, FlagDefinition> });
        }
      } catch (error) {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[tinyflag-react-native] Background refresh failed:', error instanceof Error ? error.message : String(error));
        }
      }
    }, interval);

    return () => clearInterval(timer);
  }, [interval, storage]);
}

/**
 * Create a TinyFlag instance with offline-first initialization.
 * Loads from cache first, then fetches from source in background.
 *
 * @param options - TinyFlag configuration options.
 * @param storage - AsyncStorage-compatible storage adapter.
 * @returns An initialized TinyFlag instance (may have cached or fresh flags).
 */
export async function createOfflineInstance(
  options: TinyFlagOptions,
  storage: StorageAdapter,
): Promise<TinyFlag> {
  const cached = await loadCachedFlags(storage);

  const instance = new TinyFlag({
    ...options,
    source: cached ?? options.source,
  });
  await instance.init();

  // Background refresh from actual source
  if (cached) {
    const freshInstance = new TinyFlag(options);
    freshInstance
      .init()
      .then(() => {
        const freshFlags = freshInstance.getFlags();
        instance.reload({ flags: freshFlags as Record<string, FlagDefinition> });
        saveFlagsToCache(storage, { flags: freshFlags as Record<string, FlagDefinition> });
        freshInstance.destroy();
      })
      .catch((error) => {
        if (typeof console !== 'undefined' && console.debug) {
          console.debug('[tinyflag-react-native] Background init failed:', error instanceof Error ? error.message : String(error));
        }
        freshInstance.destroy();
      });
  } else {
    const flags = instance.getFlags();
    await saveFlagsToCache(storage, { flags: flags as Record<string, FlagDefinition> });
  }

  return instance;
}
