import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { TinyFlag } from 'tinyflag';
import type { TinyFlagOptions, UserContext, FlagConfig } from 'tinyflag';

interface TinyFlagContextValue {
  instance: TinyFlag;
  version: number;
  context?: UserContext;
}

const TinyFlagContext = createContext<TinyFlagContextValue | null>(null);

export interface TinyFlagProviderProps {
  /** TinyFlag source — file path, URL, or inline FlagConfig. */
  source: TinyFlagOptions['source'];
  /** User context for flag evaluation. */
  context?: UserContext;
  /** Custom headers for URL source. */
  headers?: Record<string, string>;
  /** Polling interval for URL source (ms). */
  pollInterval?: number;
  /** Enable file watching. */
  watch?: boolean;
  /** Strict validation mode. */
  strict?: boolean;
  /** Deduplicate exposure events per (flag, userId). Default: true. */
  deduplicate?: boolean;
  /** Timeout in ms for fetching flags from a URL. Default: 5000. */
  fetchTimeout?: number;
  /** Enable debug logging. Default: false. */
  debug?: boolean;
  /** Pre-initialized TinyFlag instance (for SSR). */
  instance?: TinyFlag;
  children?: React.ReactNode;
}

/**
 * Provider component that makes TinyFlag available to child components.
 * Supports SSR by accepting a pre-initialized instance.
 */
export function TinyFlagProvider({
  source,
  context,
  headers,
  pollInterval,
  watch,
  strict,
  deduplicate,
  fetchTimeout,
  debug,
  instance: externalInstance,
  children,
}: TinyFlagProviderProps): React.ReactElement {
  const [version, setVersion] = useState(0);

  const instance = useMemo(() => {
    if (externalInstance) return externalInstance;
    return new TinyFlag({
      source,
      headers,
      pollInterval,
      watch,
      strict,
      deduplicate,
      fetchTimeout,
      debug,
    });
  }, [externalInstance, source]);

  useEffect(() => {
    if (!externalInstance) {
      instance.init().catch(() => {});
    }

    const handleChange = () => setVersion((v) => v + 1);
    instance.on('change', handleChange);

    return () => {
      instance.off('change', handleChange);
      if (!externalInstance) {
        instance.destroy();
      }
    };
  }, [instance, externalInstance]);

  const value = useMemo(() => ({ instance, version, context }), [instance, version, context]);

  return React.createElement(TinyFlagContext.Provider, { value }, children);
}

function useTinyFlag(): TinyFlagContextValue {
  const ctx = useContext(TinyFlagContext);
  if (!ctx) {
    throw new Error(
      'useFlag/useVariant must be used inside <TinyFlagProvider>. ' +
        'Wrap your app with <TinyFlagProvider source="...">.',
    );
  }
  return ctx;
}

/**
 * React hook that returns whether a feature flag is enabled.
 * Re-renders when the flag value changes.
 */
export function useFlag(flagName: string): boolean {
  const { instance, version, context } = useTinyFlag();
  return useMemo(
    () => instance.isEnabled(flagName, context),
    [instance, flagName, context, version],
  );
}

/**
 * React hook that returns the assigned variant for a feature flag.
 * Re-renders when the variant assignment changes.
 */
export function useVariant(flagName: string): string | null {
  const { instance, version, context } = useTinyFlag();
  return useMemo(
    () => instance.getVariant(flagName, context),
    [instance, flagName, context, version],
  );
}

/**
 * React hook that returns the TinyFlag instance for advanced use cases.
 */
export function useTinyFlagInstance(): TinyFlag {
  return useTinyFlag().instance;
}
