/**
 * YAML/JSON parsing and typed configuration construction.
 */
import type {
  FlagConfig,
  FlagDefinition,
  FlagSchedule,
  FlagLifecycleState,
  SegmentDefinition,
  Rule,
  ValidationError,
  RolloutStrategy,
} from './types.js';
import { validateConfig } from './schema.js';
import { KNOWN_FLAG_FIELDS, KNOWN_ROOT_FIELDS } from './schema-fields.js';

/**
 * Parse and validate a raw configuration object into a typed `FlagConfig`.
 * Combines validation and type-safe parsing in one step.
 *
 * @param raw - The raw parsed object (from `parseYaml()` or `JSON.parse()`).
 * @param strict - When `true`, unknown fields are treated as errors. Defaults to `false`.
 * @returns Object with `config` (typed `FlagConfig`), `errors` (fatal validation errors), and `warnings` (non-fatal issues like unknown fields in lenient mode).
 *
 * @example
 * ```ts
 * const { config, errors, warnings } = parseFlagConfig(parseYaml(yaml));
 * if (errors.length > 0) throw new Error('Invalid config');
 * ```
 */
export function parseFlagConfig(
  raw: unknown,
  strict: boolean = false,
): {
  config: FlagConfig;
  errors: ValidationError[];
  warnings: ValidationError[];
} {
  const errors = validateConfig(raw, strict);
  const warnings: ValidationError[] = [];

  if (errors.length > 0) {
    return { config: { flags: {} }, errors, warnings };
  }

  const obj = raw as Record<string, unknown>;
  const flagsRaw = obj.flags as Record<string, unknown>;
  const flags: Record<string, FlagDefinition> = {};

  // Detect unknown root fields in lenient mode
  if (!strict) {
    for (const key of Object.keys(obj)) {
      if (!KNOWN_ROOT_FIELDS.has(key)) {
        warnings.push({ path: key, message: `Unknown field "${key}" (ignored)` });
      }
    }
  }

  for (const [name, def] of Object.entries(flagsRaw)) {
    const d = def as Record<string, unknown>;
    const flagDef: FlagDefinition = {
      enabled: d.enabled as boolean,
    };

    if (d.description !== undefined) flagDef.description = d.description as string;
    if (d.tags !== undefined) flagDef.tags = d.tags as string[];
    if (d.rollout !== undefined) flagDef.rollout = d.rollout as number | RolloutStrategy;

    if (d.rules !== undefined) {
      flagDef.rules = (d.rules as Record<string, unknown>[]).map((r) => {
        const rule: Rule = { conditions: (r.conditions as Record<string, unknown>) ?? {} };
        if (r.enabled !== undefined) rule.enabled = r.enabled as boolean;
        if (r.rollout !== undefined) rule.rollout = r.rollout as number;
        if (r.variant !== undefined) rule.variant = r.variant as string;
        if (r.segment !== undefined) rule.segment = r.segment as string;
        return rule;
      });
    }

    if (d.variants !== undefined) {
      flagDef.variants = (d.variants as Record<string, unknown>[]).map((v) => ({
        name: v.name as string,
        weight: v.weight as number,
      }));
    }

    if (d.schedule !== undefined) {
      const s = d.schedule as Record<string, unknown>;
      const schedule: FlagSchedule = {};
      if (s.enableAt !== undefined) schedule.enableAt = s.enableAt as string;
      if (s.disableAt !== undefined) schedule.disableAt = s.disableAt as string;
      flagDef.schedule = schedule;
    }

    if (d.requires !== undefined) {
      flagDef.requires = d.requires as string[];
    }

    if (d.lifecycle !== undefined) {
      const lc = d.lifecycle as Record<string, unknown>;
      flagDef.lifecycle = {
        state: lc.state as FlagLifecycleState,
        ...(lc.sunsetAt !== undefined ? { sunsetAt: lc.sunsetAt as string } : {}),
      };
    }

    if (d.config !== undefined) {
      flagDef.config = d.config as Record<string, unknown>;
    }

    // Detect unknown flag fields in lenient mode
    if (!strict) {
      for (const key of Object.keys(d)) {
        if (!KNOWN_FLAG_FIELDS.has(key)) {
          warnings.push({
            path: `flags.${name}.${key}`,
            message: `Unknown field "${key}" (ignored)`,
          });
        }
      }
    }

    flags[name] = flagDef;
  }

  // Parse personas
  const personas = obj.personas
    ? (obj.personas as Record<string, Record<string, unknown>>)
    : undefined;

  // Parse segments
  let segments: Record<string, SegmentDefinition> | undefined;
  if (obj.segments) {
    segments = {};
    const segsRaw = obj.segments as Record<string, Record<string, unknown>>;
    for (const [sName, sDef] of Object.entries(segsRaw)) {
      segments[sName] = {
        conditions: (sDef.conditions as Record<string, unknown>) ?? {},
        ...(sDef.extends ? { extends: sDef.extends as string[] } : {}),
      };
    }
  }

  return {
    config: {
      version: (obj.version as number) ?? 1,
      flags,
      ...(personas ? { personas } : {}),
      ...(segments ? { segments } : {}),
    },
    errors: [],
    warnings,
  };
}
