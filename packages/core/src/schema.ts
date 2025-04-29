import type {
  ValidationError,
} from './types.js';
import {
  SUPPORTED_VERSIONS,
  detectCircularSegments,
  validateFlagName,
  validateFlagDefinition,
} from './validators.js';
export { parseFlagConfig } from './parser.js';

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
