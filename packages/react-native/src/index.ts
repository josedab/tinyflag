import { useEffect, useMemo, useRef, useState } from 'react';
import { TinyFlag } from 'tinyflag';
import type { FlagConfig, UserContext, TinyFlagOptions } from 'tinyflag';

const CACHE_KEY = '@tinyflag/flags';

/** Storage adapter interface for offline flag caching. */
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * Load cached flags from AsyncStorage.
 * Falls back to empty config if no cache exists.
 */
export async function loadCachedFlags(storage: StorageAdapter): Promise<FlagConfig | null> {
  try {
    const cached = await storage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as FlagConfig;
    }
  } catch {
    // Ignore cache read errors
  }
  return null;
}

/**
 * Save flags to AsyncStorage for offline use.
 */
export async function saveFlagsToCache(
  storage: StorageAdapter,
  flags: FlagConfig,
): Promise<void> {
  try {
    await storage.setItem(CACHE_KEY, JSON.stringify(flags));
  } catch {
    // Ignore cache write errors
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
  /** Default value when offline and no cache. */
  defaultValue?: boolean;
}

/**
 * React hook for flag evaluation with offline support.
 * Returns the flag value, falling back to cached value or default when offline.
 */
export function useFlagWithOffline({
  instance,
  flagName,
  context,
  defaultValue = false,
}: UseFlagWithOfflineOptions): { enabled: boolean; isOffline: boolean } {
  const [isOffline, setIsOffline] = useState(false);
  const enabled = useMemo(() => {
    try {
      return instance.isEnabled(flagName, context);
    } catch {
      setIsOffline(true);
      return defaultValue;
    }
  }, [instance, flagName, context, defaultValue]);

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
          await saveFlagsToCache(storage, { flags: flags as Record<string, any> });
        }
      } catch {
        // Ignore refresh errors
      }
    }, interval);

    return () => clearInterval(timer);
  }, [interval, storage]);
}

/**
 * Create a TinyFlag instance with offline-first initialization.
 * Loads from cache first, then fetches from source in background.
 */
export async function createOfflineInstance(
  options: TinyFlagOptions,
  storage: StorageAdapter,
): Promise<TinyFlag> {
  const cached = await loadCachedFlags(storage);

  // Start with cached flags if available
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
        instance.reload({ flags: freshFlags as Record<string, any> });
        saveFlagsToCache(storage, { flags: freshFlags as Record<string, any> });
        freshInstance.destroy();
      })
      .catch(() => {
        freshInstance.destroy();
      });
  } else {
    // Cache the initial load
    const flags = instance.getFlags();
    await saveFlagsToCache(storage, { flags: flags as Record<string, any> });
  }

  return instance;
}
