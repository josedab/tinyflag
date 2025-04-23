import { TinyFlag } from './tinyflag.js';
import type { FlagConfig, FlagDefinition, UserContext } from './types.js';

/**
 * Options for creating a mock TinyFlag instance for testing.
 */
export interface MockTinyFlagOptions {
  /** Flag definitions. Keys are flag names, values are definitions or booleans for simple on/off. */
  flags: Record<string, FlagDefinition | boolean>;
  /** Strict mode for schema validation. Default: false. */
  strict?: boolean;
}

/**
 * Create a pre-initialized TinyFlag instance for testing.
 * Avoids boilerplate: no file paths, no async init, no cleanup needed.
 *
 * @param options - Mock configuration with flag definitions (boolean shorthand or full `FlagDefinition`).
 * @returns A promise resolving to an initialized `TinyFlag` instance ready for evaluation.
 *
 * @example
 * ```ts
 * import { createMockTinyFlag } from 'tinyflag/testing';
 *
 * const ff = await createMockTinyFlag({
 *   flags: {
 *     'new-checkout': true,
 *     'dark-mode': false,
 *     'experiment': {
 *       enabled: true,
 *       variants: [
 *         { name: 'control', weight: 50 },
 *         { name: 'new-flow', weight: 50 },
 *       ],
 *     },
 *   },
 * });
 *
 * expect(ff.isEnabled('new-checkout')).toBe(true);
 * expect(ff.isEnabled('dark-mode')).toBe(false);
 * ```
 */
export async function createMockTinyFlag(options: MockTinyFlagOptions): Promise<TinyFlag> {
  const flags: Record<string, FlagDefinition> = {};
  for (const [name, value] of Object.entries(options.flags)) {
    if (typeof value === 'boolean') {
      flags[name] = { enabled: value };
    } else {
      flags[name] = value;
    }
  }

  const config: FlagConfig = { version: 1, flags };
  const ff = new TinyFlag({ source: config, strict: options.strict ?? false });
  await ff.init();
  return ff;
}

/**
 * Create a simple flag definition with common defaults.
 *
 * @param overrides - Partial flag definition. Must include `enabled`. Other fields are optional.
 * @returns A complete `FlagDefinition` object.
 *
 * @example
 * ```ts
 * import { createFlag } from 'tinyflag/testing';
 *
 * const flag = createFlag({ enabled: true, rollout: 50 });
 * ```
 */
export function createFlag(
  overrides: Partial<FlagDefinition> & { enabled: boolean },
): FlagDefinition {
  return { ...overrides };
}
