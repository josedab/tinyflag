import type { UserContext } from './types.js';

export interface ResolvedOverride<T> {
  value: T;
  source: 'environment' | 'local';
}

export function normalizeFlagName(flagName: string): string | undefined {
  const normalized = flagName?.trim();
  return normalized || undefined;
}

export function normalizeContext(context?: UserContext): UserContext | undefined {
  if (context === null || context === undefined) return undefined;
  if (context.userId === '') {
    const { userId, ...rest } = context;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }
  return context;
}

export function resolveEnabledOverride(
  flagName: string,
  overrides: ReadonlyMap<string, boolean | string>,
): ResolvedOverride<boolean> | undefined {
  const environment = getEnvironmentOverride(flagName);
  if (environment !== undefined) {
    return {
      value: typeof environment === 'boolean' ? environment : true,
      source: 'environment',
    };
  }

  const local = overrides.get(flagName);
  return typeof local === 'boolean' ? { value: local, source: 'local' } : undefined;
}

export function resolveVariantOverride(
  flagName: string,
  overrides: ReadonlyMap<string, boolean | string>,
): ResolvedOverride<string | null> | undefined {
  const environment = getEnvironmentOverride(flagName);
  if (typeof environment === 'string') {
    return { value: environment, source: 'environment' };
  }
  if (environment === false) {
    return { value: null, source: 'environment' };
  }

  const local = overrides.get(flagName);
  if (typeof local === 'string') {
    return { value: local, source: 'local' };
  }
  return local === false ? { value: null, source: 'local' } : undefined;
}

export function resolveAllFlagsOverride(
  flagName: string,
  overrides: ReadonlyMap<string, boolean | string>,
): { enabled: boolean; variant: string | null } | undefined {
  const environment = getEnvironmentOverride(flagName);
  if (typeof environment === 'boolean') {
    return { enabled: environment, variant: null };
  }
  if (typeof environment === 'string') {
    return { enabled: true, variant: environment };
  }

  const local = overrides.get(flagName);
  if (typeof local === 'boolean') {
    return { enabled: local, variant: null };
  }
  return typeof local === 'string' ? { enabled: true, variant: local } : undefined;
}

function getEnvironmentOverride(flagName: string): boolean | string | undefined {
  try {
    if (typeof process === 'undefined' || !process.env) return undefined;
    const envValue = process.env[flagNameToEnvVar(flagName)];
    if (envValue === undefined || envValue === '') return undefined;

    const lower = envValue.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    return envValue;
  } catch {
    return undefined;
  }
}

function flagNameToEnvVar(flagName: string): string {
  return 'TINYFLAG_' + flagName.replace(/-/g, '_').toUpperCase();
}
