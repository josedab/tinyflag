import type { FlagConfig, FlagDefinition, UserContext } from './types.js';
import { evaluateFlag, evaluateVariant, setEvaluationContext } from './evaluator.js';

/** Context identifying a specific tenant. */
export interface TenantContext {
  /** Unique tenant identifier. */
  tenantId: string;
  /** Additional tenant-level attributes. */
  [key: string]: unknown;
}

/** Tenant-specific flag overrides in the config. */
export interface TenantFlagConfig {
  /** Optional tenant description. */
  description?: string;
  /** Tenant-specific flag overrides (merged on top of global defaults). */
  flags: Record<string, Partial<FlagDefinition>>;
}

/** Extended flag config with tenant support. */
export interface MultiTenantFlagConfig extends FlagConfig {
  tenants?: Record<string, TenantFlagConfig>;
}

/**
 * Resolve flags for a specific tenant by merging global defaults with tenant overrides.
 * Tenant-specific values take precedence over global defaults.
 * If the tenant doesn't exist, returns global flags unchanged.
 */
export function resolveTenantFlags(
  config: MultiTenantFlagConfig,
  tenantId: string,
): Record<string, FlagDefinition> {
  const globalFlags = { ...config.flags };

  if (!config.tenants || !config.tenants[tenantId]) {
    return globalFlags;
  }

  const tenantConfig = config.tenants[tenantId];
  const result: Record<string, FlagDefinition> = { ...globalFlags };

  for (const [flagName, overrides] of Object.entries(tenantConfig.flags)) {
    const base = result[flagName];
    if (base) {
      result[flagName] = { ...base, ...overrides } as FlagDefinition;
    } else {
      // Tenant-only flag (not in global scope)
      if ('enabled' in overrides && typeof overrides.enabled === 'boolean') {
        result[flagName] = overrides as FlagDefinition;
      }
    }
  }

  return result;
}

/**
 * Evaluate a flag for a specific tenant and user context.
 */
export function evaluateTenantFlag(
  config: MultiTenantFlagConfig,
  flagName: string,
  tenant: TenantContext,
  context?: UserContext,
): boolean {
  const tenantFlags = resolveTenantFlags(config, tenant.tenantId);
  const flag = tenantFlags[flagName];
  if (!flag) return false;

  setEvaluationContext(tenantFlags, config.segments);
  return evaluateFlag(flagName, flag, context);
}

/**
 * Evaluate a variant for a specific tenant and user context.
 */
export function evaluateTenantVariant(
  config: MultiTenantFlagConfig,
  flagName: string,
  tenant: TenantContext,
  context?: UserContext,
): { variant: string | null; enabled: boolean } {
  const tenantFlags = resolveTenantFlags(config, tenant.tenantId);
  const flag = tenantFlags[flagName];
  if (!flag) return { variant: null, enabled: false };

  setEvaluationContext(tenantFlags, config.segments);
  return evaluateVariant(flagName, flag, context);
}

/**
 * List all tenants in a config.
 */
export function listTenants(config: MultiTenantFlagConfig): string[] {
  if (!config.tenants) return [];
  return Object.keys(config.tenants).sort();
}

/**
 * Compare flag values between two tenants (or a tenant vs global).
 */
export function diffTenantFlags(
  config: MultiTenantFlagConfig,
  tenantA: string | null,
  tenantB: string | null,
): TenantDiffEntry[] {
  const flagsA = tenantA
    ? resolveTenantFlags(config, tenantA)
    : config.flags;
  const flagsB = tenantB
    ? resolveTenantFlags(config, tenantB)
    : config.flags;

  const allFlags = new Set([...Object.keys(flagsA), ...Object.keys(flagsB)]);
  const diffs: TenantDiffEntry[] = [];

  for (const flag of allFlags) {
    const a = flagsA[flag];
    const b = flagsB[flag];

    if (!a && b) {
      diffs.push({ flag, type: 'added', tenantA: tenantA ?? '(global)', tenantB: tenantB ?? '(global)' });
    } else if (a && !b) {
      diffs.push({ flag, type: 'removed', tenantA: tenantA ?? '(global)', tenantB: tenantB ?? '(global)' });
    } else if (a && b) {
      const changes: string[] = [];
      if (a.enabled !== b.enabled) changes.push(`enabled: ${a.enabled} → ${b.enabled}`);
      if (a.rollout !== b.rollout) changes.push(`rollout: ${a.rollout} → ${b.rollout}`);
      if (changes.length > 0) {
        diffs.push({
          flag,
          type: 'modified',
          changes,
          tenantA: tenantA ?? '(global)',
          tenantB: tenantB ?? '(global)',
        });
      }
    }
  }

  return diffs;
}

/** Entry in a tenant flag diff. */
export interface TenantDiffEntry {
  flag: string;
  type: 'added' | 'removed' | 'modified';
  changes?: string[];
  tenantA: string;
  tenantB: string;
}

/**
 * Validate that no cross-tenant flag leakage occurs.
 * Returns violations where a tenant can see flags from another tenant's namespace.
 */
export function validateTenantIsolation(
  config: MultiTenantFlagConfig,
): TenantIsolationViolation[] {
  const violations: TenantIsolationViolation[] = [];
  const tenants = listTenants(config);

  for (const tenantId of tenants) {
    const tenantFlags = resolveTenantFlags(config, tenantId);
    const tenantConfig = config.tenants![tenantId];

    for (const [flagName, flagDef] of Object.entries(tenantFlags)) {
      // Check if this flag is tenant-only (not in global) and only belongs to this tenant
      if (!config.flags[flagName] && tenantConfig.flags[flagName]) {
        // This is a tenant-specific flag — verify other tenants don't see it
        for (const otherId of tenants) {
          if (otherId === tenantId) continue;
          const otherFlags = resolveTenantFlags(config, otherId);
          if (otherFlags[flagName]) {
            violations.push({
              flag: flagName,
              sourceTenant: tenantId,
              leakedToTenant: otherId,
            });
          }
        }
      }
    }
  }

  return violations;
}

/** A tenant isolation violation. */
export interface TenantIsolationViolation {
  flag: string;
  sourceTenant: string;
  leakedToTenant: string;
}

/**
 * Format tenant list as human-readable output.
 */
export function formatTenantList(
  config: MultiTenantFlagConfig,
): string {
  const tenants = listTenants(config);
  if (tenants.length === 0) return 'No tenants configured.';

  const lines = ['Tenants:', ''];
  for (const id of tenants) {
    const tc = config.tenants![id];
    const overrideCount = Object.keys(tc.flags).length;
    const desc = tc.description ? ` — ${tc.description}` : '';
    lines.push(`  ${id}${desc} (${overrideCount} flag override${overrideCount !== 1 ? 's' : ''})`);
  }
  return lines.join('\n');
}
