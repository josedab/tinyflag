import type {
  FlagConfig,
  FlagDefinition,
  FlagSchedule,
  FlagLifecycleState,
  SegmentDefinition,
  Rule,
  Variant,
  ValidationError,
  RolloutStrategy,
} from './types.js';

const FLAG_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const MAX_FLAG_NAME_LENGTH = 128;
const SUPPORTED_VERSIONS = [1];

/** Detect circular inheritance in segment definitions. */
function detectCircularSegments(segments: Record<string, Record<string, unknown>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(name: string): void {
    if (inStack.has(name)) {
      const cycleStart = path.indexOf(name);
      cycles.push([...path.slice(cycleStart), name]);
      return;
    }
    if (visited.has(name)) return;
    visited.add(name);
    inStack.add(name);
    path.push(name);

    const seg = segments[name];
    const exts = seg?.extends as string[] | undefined;
    if (exts) {
      for (const ext of exts) {
        dfs(ext);
      }
    }

    path.pop();
    inStack.delete(name);
  }

  for (const name of Object.keys(segments)) {
    dfs(name);
  }
  return cycles;
}

/**
 * Validate a parsed flag configuration object against the TinyFlag schema.
 *
 * @param config - The parsed configuration object to validate (typically from `parseYaml()` or `JSON.parse()`).
 * @param strict - When `true`, unknown fields are treated as errors instead of warnings. Defaults to `false`.
 * @returns Array of validation errors. An empty array means the configuration is valid.
 *
 * @example
 * ```ts
 * const errors = validateConfig(parseYaml(yamlString));
 * if (errors.length > 0) {
 *   errors.forEach(e => console.error(`${e.path}: ${e.message}`));
 * }
 * ```
 */
export function validateConfig(config: unknown, strict: boolean = false): ValidationError[] {
  const errors: ValidationError[] = [];

  if (config === null || config === undefined) {
    errors.push({ path: '', message: 'Flag configuration is empty' });
    return errors;
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    errors.push({ path: '', message: 'Flag configuration must be an object' });
    return errors;
  }

  const obj = config as Record<string, unknown>;

  // Version check
  if (obj.version !== undefined) {
    if (typeof obj.version !== 'number' || !SUPPORTED_VERSIONS.includes(obj.version)) {
      errors.push({
        path: 'version',
        message: `Unsupported version: ${obj.version}. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
      });
    }
  }

  // Flags field
  if (obj.flags === undefined) {
    errors.push({ path: 'flags', message: 'Missing required field "flags"' });
    return errors;
  }

  if (typeof obj.flags !== 'object' || Array.isArray(obj.flags) || obj.flags === null) {
    errors.push({
      path: 'flags',
      message: '"flags" must be an object mapping flag names to definitions',
    });
    return errors;
  }

  const knownRootFields = new Set(['version', 'flags', 'personas', 'segments', 'tenants']);
  if (strict) {
    for (const key of Object.keys(obj)) {
      if (!knownRootFields.has(key)) {
        errors.push({ path: key, message: `Unknown field "${key}"` });
      }
    }
  }

  // Validate personas
  if (obj.personas !== undefined) {
    if (typeof obj.personas !== 'object' || Array.isArray(obj.personas) || obj.personas === null) {
      errors.push({
        path: 'personas',
        message: '"personas" must be an object mapping names to context objects',
      });
    } else {
      const personas = obj.personas as Record<string, unknown>;
      for (const [pName, pDef] of Object.entries(personas)) {
        if (typeof pDef !== 'object' || pDef === null || Array.isArray(pDef)) {
          errors.push({
            path: `personas.${pName}`,
            message: 'Persona definition must be an object',
          });
        }
      }
    }
  }

  // Validate segments
  if (obj.segments !== undefined) {
    if (typeof obj.segments !== 'object' || Array.isArray(obj.segments) || obj.segments === null) {
      errors.push({
        path: 'segments',
        message: '"segments" must be an object mapping names to segment definitions',
      });
    } else {
      const segments = obj.segments as Record<string, unknown>;
      for (const [sName, sDef] of Object.entries(segments)) {
        if (typeof sDef !== 'object' || sDef === null || Array.isArray(sDef)) {
          errors.push({
            path: `segments.${sName}`,
            message: 'Segment definition must be an object',
          });
        } else {
          const seg = sDef as Record<string, unknown>;
          if (seg.conditions === undefined) {
            errors.push({
              path: `segments.${sName}.conditions`,
              message: 'Segment must have a "conditions" field',
            });
          } else if (
            typeof seg.conditions !== 'object' ||
            seg.conditions === null ||
            Array.isArray(seg.conditions)
          ) {
            errors.push({
              path: `segments.${sName}.conditions`,
              message: '"conditions" must be an object',
            });
          }
          if (seg.extends !== undefined) {
            if (!Array.isArray(seg.extends)) {
              errors.push({
                path: `segments.${sName}.extends`,
                message: '"extends" must be an array of segment names',
              });
            } else {
              for (const ext of seg.extends) {
                if (typeof ext !== 'string' || ext === '') {
                  errors.push({
                    path: `segments.${sName}.extends`,
                    message: 'Extended segment name must be a non-empty string',
                  });
                }
              }
            }
          }
        }
      }
      // Detect circular segment inheritance
      const segmentCircles = detectCircularSegments(
        segments as Record<string, Record<string, unknown>>,
      );
      for (const cycle of segmentCircles) {
        errors.push({
          path: 'segments',
          message: `Circular segment inheritance: ${cycle.join(' → ')}`,
        });
      }
    }
  }

  const flags = obj.flags as Record<string, unknown>;
  for (const [name, def] of Object.entries(flags)) {
    validateFlagName(name, errors);
    validateFlagDefinition(name, def, errors, strict);
  }

  return errors;
}

function validateFlagName(name: string, errors: ValidationError[]): void {
  if (name === '') {
    errors.push({ path: 'flags', message: 'Flag name cannot be empty' });
    return;
  }
  if (name.length > MAX_FLAG_NAME_LENGTH) {
    errors.push({
      path: `flags.${name}`,
      message: `Flag name exceeds max length of ${MAX_FLAG_NAME_LENGTH} characters`,
    });
  }
  if (!FLAG_NAME_PATTERN.test(name)) {
    errors.push({
      path: `flags.${name}`,
      message: `Invalid flag name "${name}". Must be kebab-case: lowercase alphanumeric and hyphens, cannot start or end with a hyphen.`,
    });
  }
}

function validateFlagDefinition(
  name: string,
  def: unknown,
  errors: ValidationError[],
  strict: boolean,
): void {
  const prefix = `flags.${name}`;

  if (typeof def !== 'object' || def === null || Array.isArray(def)) {
    errors.push({ path: prefix, message: 'Flag definition must be an object' });
    return;
  }

  const flag = def as Record<string, unknown>;

  // enabled — required
  if (flag.enabled === undefined) {
    errors.push({ path: `${prefix}.enabled`, message: 'Missing required field "enabled"' });
  } else if (typeof flag.enabled !== 'boolean') {
    errors.push({ path: `${prefix}.enabled`, message: '"enabled" must be a boolean' });
  }

  // description
  if (flag.description !== undefined && typeof flag.description !== 'string') {
    errors.push({ path: `${prefix}.description`, message: '"description" must be a string' });
  }

  // tags
  if (flag.tags !== undefined) {
    if (!Array.isArray(flag.tags)) {
      errors.push({ path: `${prefix}.tags`, message: '"tags" must be an array of strings' });
    } else {
      for (let i = 0; i < flag.tags.length; i++) {
        if (typeof flag.tags[i] !== 'string') {
          errors.push({ path: `${prefix}.tags[${i}]`, message: 'Tag must be a string' });
        }
      }
    }
  }

  // rollout — simple number (0-100) or advanced strategy object
  if (flag.rollout !== undefined) {
    if (typeof flag.rollout === 'number') {
      if (!Number.isInteger(flag.rollout)) {
        errors.push({ path: `${prefix}.rollout`, message: '"rollout" must be an integer' });
      } else if (flag.rollout < 0 || flag.rollout > 100) {
        errors.push({
          path: `${prefix}.rollout`,
          message: `"rollout" must be 0-100, got ${flag.rollout}`,
        });
      }
    } else if (
      typeof flag.rollout === 'object' &&
      flag.rollout !== null &&
      !Array.isArray(flag.rollout)
    ) {
      validateRolloutStrategy(prefix, flag.rollout as Record<string, unknown>, errors);
    } else {
      errors.push({
        path: `${prefix}.rollout`,
        message:
          '"rollout" must be an integer (0-100) or a strategy object ({ type: "ramp" | "ring" | "cohort", ... })',
      });
    }
  }

  // rules
  if (flag.rules !== undefined) {
    if (!Array.isArray(flag.rules)) {
      errors.push({ path: `${prefix}.rules`, message: '"rules" must be an array' });
    } else {
      for (let i = 0; i < flag.rules.length; i++) {
        validateRule(`${prefix}.rules[${i}]`, flag.rules[i], errors);
      }
    }
  }

  // variants
  if (flag.variants !== undefined) {
    if (!Array.isArray(flag.variants)) {
      errors.push({ path: `${prefix}.variants`, message: '"variants" must be an array' });
    } else {
      validateVariants(`${prefix}.variants`, flag.variants, errors);
    }
  }

  // requires
  if (flag.requires !== undefined) {
    if (!Array.isArray(flag.requires)) {
      errors.push({
        path: `${prefix}.requires`,
        message: '"requires" must be an array of flag name strings',
      });
    } else {
      for (let i = 0; i < flag.requires.length; i++) {
        if (typeof flag.requires[i] !== 'string' || flag.requires[i] === '') {
          errors.push({
            path: `${prefix}.requires[${i}]`,
            message: 'Required flag name must be a non-empty string',
          });
        }
      }
    }
  }

  // schedule
  if (flag.schedule !== undefined) {
    if (
      typeof flag.schedule !== 'object' ||
      flag.schedule === null ||
      Array.isArray(flag.schedule)
    ) {
      errors.push({ path: `${prefix}.schedule`, message: '"schedule" must be an object' });
    } else {
      const schedule = flag.schedule as Record<string, unknown>;
      if (schedule.enableAt !== undefined) {
        if (typeof schedule.enableAt !== 'string') {
          errors.push({
            path: `${prefix}.schedule.enableAt`,
            message: '"enableAt" must be an ISO 8601 string',
          });
        } else if (isNaN(new Date(schedule.enableAt).getTime())) {
          errors.push({
            path: `${prefix}.schedule.enableAt`,
            message: `Invalid ISO 8601 date: "${schedule.enableAt}"`,
          });
        }
      }
      if (schedule.disableAt !== undefined) {
        if (typeof schedule.disableAt !== 'string') {
          errors.push({
            path: `${prefix}.schedule.disableAt`,
            message: '"disableAt" must be an ISO 8601 string',
          });
        } else if (isNaN(new Date(schedule.disableAt).getTime())) {
          errors.push({
            path: `${prefix}.schedule.disableAt`,
            message: `Invalid ISO 8601 date: "${schedule.disableAt}"`,
          });
        }
      }
      const knownScheduleFields = new Set(['enableAt', 'disableAt']);
      for (const key of Object.keys(schedule)) {
        if (!knownScheduleFields.has(key)) {
          errors.push({
            path: `${prefix}.schedule.${key}`,
            message: `Unknown schedule field "${key}"`,
          });
        }
      }
    }
  }

  // lifecycle
  if (flag.lifecycle !== undefined) {
    if (
      typeof flag.lifecycle !== 'object' ||
      flag.lifecycle === null ||
      Array.isArray(flag.lifecycle)
    ) {
      errors.push({ path: `${prefix}.lifecycle`, message: '"lifecycle" must be an object' });
    } else {
      const lc = flag.lifecycle as Record<string, unknown>;
      const validStates = ['draft', 'active', 'sunset', 'archived'];
      if (lc.state === undefined) {
        errors.push({
          path: `${prefix}.lifecycle.state`,
          message: 'Missing required field "state"',
        });
      } else if (typeof lc.state !== 'string' || !validStates.includes(lc.state)) {
        errors.push({
          path: `${prefix}.lifecycle.state`,
          message: `"state" must be one of: ${validStates.join(', ')}`,
        });
      }
      if (lc.state === 'sunset' && lc.sunsetAt === undefined) {
        errors.push({
          path: `${prefix}.lifecycle.sunsetAt`,
          message: '"sunsetAt" is required when state is "sunset"',
        });
      }
      if (lc.sunsetAt !== undefined) {
        if (typeof lc.sunsetAt !== 'string') {
          errors.push({
            path: `${prefix}.lifecycle.sunsetAt`,
            message: '"sunsetAt" must be an ISO 8601 string',
          });
        } else if (isNaN(new Date(lc.sunsetAt).getTime())) {
          errors.push({
            path: `${prefix}.lifecycle.sunsetAt`,
            message: `Invalid ISO 8601 date: "${lc.sunsetAt}"`,
          });
        }
      }
    }
  }

  // config
  if (flag.config !== undefined) {
    if (typeof flag.config !== 'object' || flag.config === null || Array.isArray(flag.config)) {
      errors.push({ path: `${prefix}.config`, message: '"config" must be an object' });
    }
  }

  if (strict) {
    const knownFields = new Set([
      'enabled',
      'description',
      'tags',
      'rollout',
      'rules',
      'variants',
      'schedule',
      'requires',
      'lifecycle',
      'config',
    ]);
    for (const key of Object.keys(flag)) {
      if (!knownFields.has(key)) {
        errors.push({ path: `${prefix}.${key}`, message: `Unknown field "${key}"` });
      }
    }
  }
}

function validateRolloutStrategy(
  prefix: string,
  strategy: Record<string, unknown>,
  errors: ValidationError[],
): void {
  const validTypes = ['ramp', 'ring', 'cohort'];
  if (!strategy.type || typeof strategy.type !== 'string' || !validTypes.includes(strategy.type)) {
    errors.push({
      path: `${prefix}.rollout.type`,
      message: `"type" must be one of: ${validTypes.join(', ')}`,
    });
    return;
  }

  switch (strategy.type) {
    case 'ramp': {
      if (typeof strategy.start !== 'number')
        errors.push({
          path: `${prefix}.rollout.start`,
          message: '"start" must be a number (0-100)',
        });
      if (typeof strategy.end !== 'number')
        errors.push({ path: `${prefix}.rollout.end`, message: '"end" must be a number (0-100)' });
      if (typeof strategy.startAt !== 'string')
        errors.push({
          path: `${prefix}.rollout.startAt`,
          message: '"startAt" must be an ISO 8601 string',
        });
      if (typeof strategy.endAt !== 'string')
        errors.push({
          path: `${prefix}.rollout.endAt`,
          message: '"endAt" must be an ISO 8601 string',
        });
      break;
    }
    case 'ring': {
      if (!Array.isArray(strategy.rings)) {
        errors.push({ path: `${prefix}.rollout.rings`, message: '"rings" must be an array' });
      } else {
        for (let i = 0; i < strategy.rings.length; i++) {
          const ring = strategy.rings[i] as Record<string, unknown>;
          if (typeof ring?.name !== 'string')
            errors.push({
              path: `${prefix}.rollout.rings[${i}].name`,
              message: '"name" must be a string',
            });
          if (typeof ring?.percentage !== 'number')
            errors.push({
              path: `${prefix}.rollout.rings[${i}].percentage`,
              message: '"percentage" must be a number',
            });
        }
      }
      break;
    }
    case 'cohort': {
      if (typeof strategy.field !== 'string')
        errors.push({ path: `${prefix}.rollout.field`, message: '"field" must be a string' });
      if (typeof strategy.percentage !== 'number')
        errors.push({
          path: `${prefix}.rollout.percentage`,
          message: '"percentage" must be a number (0-100)',
        });
      break;
    }
  }
}

function validateRule(prefix: string, rule: unknown, errors: ValidationError[]): void {
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
    errors.push({ path: prefix, message: 'Rule must be an object' });
    return;
  }

  const r = rule as Record<string, unknown>;

  if (r.conditions === undefined) {
    errors.push({ path: `${prefix}.conditions`, message: 'Rule must have a "conditions" field' });
  } else if (
    typeof r.conditions !== 'object' ||
    r.conditions === null ||
    Array.isArray(r.conditions)
  ) {
    errors.push({ path: `${prefix}.conditions`, message: '"conditions" must be an object' });
  }

  if (r.enabled !== undefined && typeof r.enabled !== 'boolean') {
    errors.push({ path: `${prefix}.enabled`, message: '"enabled" must be a boolean' });
  }

  if (r.rollout !== undefined) {
    if (typeof r.rollout !== 'number' || r.rollout < 0 || r.rollout > 100) {
      errors.push({ path: `${prefix}.rollout`, message: '"rollout" must be 0-100' });
    }
  }

  if (r.variant !== undefined && typeof r.variant !== 'string') {
    errors.push({ path: `${prefix}.variant`, message: '"variant" must be a string' });
  }
}

function validateVariants(prefix: string, variants: unknown[], errors: ValidationError[]): void {
  let allZero = true;

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const vPrefix = `${prefix}[${i}]`;

    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push({ path: vPrefix, message: 'Variant must be an object' });
      continue;
    }

    const variant = v as Record<string, unknown>;

    if (typeof variant.name !== 'string' || variant.name === '') {
      errors.push({
        path: `${vPrefix}.name`,
        message: 'Variant must have a non-empty "name" string',
      });
    }

    if (typeof variant.weight !== 'number' || variant.weight < 0) {
      errors.push({ path: `${vPrefix}.weight`, message: '"weight" must be a non-negative number' });
    } else if (variant.weight > 0) {
      allZero = false;
    }
  }

  if (variants.length > 0 && allZero) {
    errors.push({
      path: prefix,
      message: 'All variant weights are zero — at least one must be positive',
    });
  }
}

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
    const knownRootFields = new Set(['version', 'flags', 'personas', 'segments', 'tenants']);
    for (const key of Object.keys(obj)) {
      if (!knownRootFields.has(key)) {
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
      const knownFields = new Set([
        'enabled',
        'description',
        'tags',
        'rollout',
        'rules',
        'variants',
        'schedule',
        'requires',
        'lifecycle',
        'config',
      ]);
      for (const key of Object.keys(d)) {
        if (!knownFields.has(key)) {
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
