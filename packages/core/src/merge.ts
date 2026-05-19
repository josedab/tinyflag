import type { FlagConfig, FlagDefinition, Variant, MergeWarning } from './types.js';

/**
 * Deep-merge multiple FlagConfig objects in order (later sources override earlier).
 * - `enabled`, `rollout`, `description`, `tags`, `rules` are overridden by later sources.
 * - `variants` are merged by name: later sources can add or replace variants.
 * Returns merged config and any conflict warnings.
 */
export function mergeFlagConfigs(
  configs: FlagConfig[],
): { config: FlagConfig; warnings: MergeWarning[] } {
  if (configs.length === 0) {
    return { config: { flags: {} }, warnings: [] };
  }
  if (configs.length === 1) {
    return { config: configs[0], warnings: [] };
  }

  const warnings: MergeWarning[] = [];
  const merged: Record<string, FlagDefinition> = {};

  for (const cfg of configs) {
    for (const [name, def] of Object.entries(cfg.flags)) {
      if (merged[name]) {
        const base = merged[name];
        const result = mergeFlagDefinition(name, base, def, warnings);
        merged[name] = result;
      } else {
        merged[name] = { ...def };
      }
    }
  }

  return {
    config: { version: configs[configs.length - 1].version ?? 1, flags: merged },
    warnings,
  };
}

function mergeFlagDefinition(
  name: string,
  base: FlagDefinition,
  overlay: FlagDefinition,
  warnings: MergeWarning[],
): FlagDefinition {
  const result: FlagDefinition = { ...base };

  // Override scalar fields
  if (overlay.enabled !== base.enabled) {
    warnings.push({
      flag: name,
      field: 'enabled',
      message: `Overriding enabled: ${base.enabled} → ${overlay.enabled}`,
    });
    result.enabled = overlay.enabled;
  }

  if (overlay.rollout !== undefined && overlay.rollout !== base.rollout) {
    warnings.push({
      flag: name,
      field: 'rollout',
      message: `Overriding rollout: ${base.rollout ?? 'none'} → ${overlay.rollout}`,
    });
    result.rollout = overlay.rollout;
  }

  if (overlay.description !== undefined) {
    result.description = overlay.description;
  }

  if (overlay.tags !== undefined) {
    result.tags = overlay.tags;
  }

  if (overlay.rules !== undefined) {
    if (base.rules && base.rules.length > 0) {
      warnings.push({
        flag: name,
        field: 'rules',
        message: `Overriding ${base.rules.length} rule(s) with ${overlay.rules.length} rule(s)`,
      });
    }
    result.rules = overlay.rules;
  }

  // Override schedule
  if (overlay.schedule !== undefined) {
    result.schedule = overlay.schedule;
  }

  // Merge variants by name
  if (overlay.variants !== undefined) {
    if (base.variants && base.variants.length > 0) {
      const variantMap = new Map<string, Variant>();
      for (const v of base.variants) {
        variantMap.set(v.name, { ...v });
      }
      for (const v of overlay.variants) {
        if (variantMap.has(v.name)) {
          warnings.push({
            flag: name,
            field: `variants.${v.name}`,
            message: `Overriding variant "${v.name}" weight: ${variantMap.get(v.name)!.weight} → ${v.weight}`,
          });
        }
        variantMap.set(v.name, { ...v });
      }
      result.variants = Array.from(variantMap.values());
    } else {
      result.variants = overlay.variants;
    }
  }

  return result;
}
