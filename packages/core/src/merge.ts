import type {
  FlagConfig,
  FlagDefinition,
  Variant,
  MergeWarning,
  SegmentDefinition,
} from './types.js';

/**
 * Deep-merge multiple FlagConfig objects in order (later sources override earlier).
 * Scalar fields (`enabled`, `rollout`, `description`, `tags`, `rules`) are overridden.
 * Variants are merged by name: later sources can add or replace individual variants.
 *
 * @param configs - Array of flag configurations to merge, in priority order (last wins).
 * @returns Object with `config` (the merged `FlagConfig`) and `warnings` (array of merge conflict descriptions).
 *
 * @example
 * ```ts
 * const { config, warnings } = mergeFlagConfigs([baseConfig, envOverlay]);
 * warnings.forEach(w => console.warn(`${w.flag}.${w.field}: ${w.message}`));
 * ```
 */
export function mergeFlagConfigs(configs: FlagConfig[]): {
  config: FlagConfig;
  warnings: MergeWarning[];
} {
  if (configs.length === 0) {
    return { config: { flags: {} }, warnings: [] };
  }
  if (configs.length === 1) {
    return { config: configs[0], warnings: [] };
  }

  const warnings: MergeWarning[] = [];
  const merged: Record<string, FlagDefinition> = {};
  let mergedSegments: Record<string, SegmentDefinition> | undefined;
  let mergedPersonas: Record<string, Record<string, unknown>> | undefined;

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

    // Merge segments
    if (cfg.segments) {
      if (!mergedSegments) mergedSegments = {};
      for (const [name, seg] of Object.entries(cfg.segments)) {
        if (mergedSegments[name]) {
          warnings.push({
            flag: `segment:${name}`,
            field: 'conditions',
            message: 'Segment overridden by environment overlay',
          });
        }
        mergedSegments[name] = { ...seg };
      }
    }

    // Merge personas
    if (cfg.personas) {
      if (!mergedPersonas) mergedPersonas = {};
      for (const [name, persona] of Object.entries(cfg.personas)) {
        mergedPersonas[name] = { ...(mergedPersonas[name] || {}), ...persona };
      }
    }
  }

  const result: FlagConfig = {
    version: configs[configs.length - 1].version ?? 1,
    flags: merged,
  };
  if (mergedSegments) result.segments = mergedSegments;
  if (mergedPersonas) result.personas = mergedPersonas;

  return { config: result, warnings };
}

/** Result of diffing two environment configs. */
export interface EnvDiffEntry {
  flag: string;
  field: string;
  envA: { name: string; value: unknown };
  envB: { name: string; value: unknown };
}

/**
 * Diff two environment configs to show differences.
 */
export function diffEnvConfigs(
  envAName: string,
  envAConfig: FlagConfig,
  envBName: string,
  envBConfig: FlagConfig,
): EnvDiffEntry[] {
  const diffs: EnvDiffEntry[] = [];
  const allFlags = new Set([...Object.keys(envAConfig.flags), ...Object.keys(envBConfig.flags)]);

  for (const flag of [...allFlags].sort()) {
    const a = envAConfig.flags[flag];
    const b = envBConfig.flags[flag];

    if (!a && b) {
      diffs.push({
        flag,
        field: '(flag)',
        envA: { name: envAName, value: undefined },
        envB: { name: envBName, value: 'defined' },
      });
      continue;
    }
    if (a && !b) {
      diffs.push({
        flag,
        field: '(flag)',
        envA: { name: envAName, value: 'defined' },
        envB: { name: envBName, value: undefined },
      });
      continue;
    }
    if (!a || !b) continue;

    if (a.enabled !== b.enabled) {
      diffs.push({
        flag,
        field: 'enabled',
        envA: { name: envAName, value: a.enabled },
        envB: { name: envBName, value: b.enabled },
      });
    }
    if (a.rollout !== b.rollout) {
      diffs.push({
        flag,
        field: 'rollout',
        envA: { name: envAName, value: a.rollout },
        envB: { name: envBName, value: b.rollout },
      });
    }
    if (JSON.stringify(a.rules) !== JSON.stringify(b.rules)) {
      diffs.push({
        flag,
        field: 'rules',
        envA: { name: envAName, value: a.rules?.length ?? 0 },
        envB: { name: envBName, value: b.rules?.length ?? 0 },
      });
    }
    if (JSON.stringify(a.variants) !== JSON.stringify(b.variants)) {
      diffs.push({
        flag,
        field: 'variants',
        envA: { name: envAName, value: a.variants?.length ?? 0 },
        envB: { name: envBName, value: b.variants?.length ?? 0 },
      });
    }
  }

  return diffs;
}

/** Format environment diff as a table. */
export function formatEnvDiff(diffs: EnvDiffEntry[]): string {
  if (diffs.length === 0) return '✅ No differences between environments.';

  const lines: string[] = [];
  const envAName = diffs[0]?.envA.name || 'envA';
  const envBName = diffs[0]?.envB.name || 'envB';
  lines.push(`📊 Differences: ${envAName} vs ${envBName}`);
  lines.push('');

  let currentFlag = '';
  for (const d of diffs) {
    if (d.flag !== currentFlag) {
      currentFlag = d.flag;
      lines.push(`  ${d.flag}:`);
    }
    const aVal = d.envA.value === undefined ? '(not defined)' : String(d.envA.value);
    const bVal = d.envB.value === undefined ? '(not defined)' : String(d.envB.value);
    lines.push(`    ${d.field}: ${aVal} → ${bVal}`);
  }

  lines.push('');
  lines.push(`Found ${diffs.length} difference(s).`);
  return lines.join('\n');
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
