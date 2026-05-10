import type {
  FlagConfig,
  FlagDefinition,
  TinyFlagOptions,
  UserContext,
  TinyFlagEvents,
  ExposureEvent,
} from './types.js';
import { EventEmitter } from './events.js';
import {
  evaluateFlag,
  evaluateVariant,
  setEvaluationContext,
  detectCircularDependencies,
  evaluateWithPersona as coreEvaluateWithPersona,
  getEvaluationWarnings,
} from './evaluator.js';
import type { EvaluationEnv, EvaluationWarning } from './evaluator.js';
import { debug, setDebug } from './debug.js';
import { murmurhash3 } from './hash.js';
import {
  normalizeContext,
  normalizeFlagName,
  resolveAllFlagsOverride,
  resolveEnabledOverride,
  resolveVariantOverride,
} from './facade-resolution.js';
import { FlagSourceController, type ResolvedTinyFlagOptions } from './source-controller.js';

/**
 * TinyFlag — serverless, file-driven, zero-dependency feature flag SDK.
 *
 * @example
 * ```ts
 * const ff = new TinyFlag({ source: './flags.yml' })
 * await ff.init()
 * if (ff.isEnabled('new-checkout', { userId: '123' })) { ... }
 * ```
 */
export class TinyFlag {
  private config: FlagConfig = { flags: {} };
  private readonly options: ResolvedTinyFlagOptions;
  private readonly emitter = new EventEmitter();
  private readonly sourceController: FlagSourceController;
  private initialized = false;
  private exposureCache = new Map<string, true>();
  private static readonly EXPOSURE_CACHE_MAX = 10_000;
  private static readonly EXPOSURE_CACHE_EVICT = 2_000; // evict oldest 20% at capacity
  private overrides = new Map<string, boolean | string>();
  private evalEnv: EvaluationEnv = { allFlags: {}, segments: {} };

  /**
   * Create a new TinyFlag instance.
   *
   * @param options - Configuration options for the SDK.
   * @param options.source - Flag source: file path (`.yml`/`.yaml`/`.json`), URL (`http`/`https`), or inline `FlagConfig` object. **Required.**
   * @param options.headers - Custom HTTP headers for URL sources.
   * @param options.pollInterval - URL polling interval in ms. Minimum `5000`; values below this are clamped with a warning. Defaults to `60000`.
   * @param options.watch - Watch file source for changes. Defaults to `true`.
   * @param options.strict - Reject unknown fields in flag definitions. Defaults to `false`.
   * @param options.deduplicate - Deduplicate exposure events per `(flag, userId)`. Defaults to `true`.
   * @param options.fetchTimeout - Timeout in ms for URL fetches. Defaults to `5000`.
   * @param options.debug - Enable debug logging. Defaults to `false`.
   * @throws {Error} If `source` is not provided.
   */
  constructor(options: TinyFlagOptions) {
    if (!options.source && !Array.isArray(options.source)) {
      throw new Error('TinyFlag: "source" option is required');
    }
    if (Array.isArray(options.source) && options.source.length === 0) {
      throw new Error('TinyFlag: "source" array must not be empty');
    }

    this.options = {
      ...options,
      strict: options.strict ?? false,
      watch: options.watch ?? true,
    };
    this.sourceController = new FlagSourceController(this.options);

    if (options.debug) {
      setDebug(true);
    }

    debug('initialized', {
      sourceType: this.sourceController.sourceType,
      strict: this.options.strict,
    });

    // Warn about HTTP (not HTTPS) for URL sources
    if (
      this.sourceController.sourceType === 'url' &&
      typeof options.source === 'string' &&
      options.source.startsWith('http://')
    ) {
      this.emitter.emit('error', {
        code: 'INSECURE_SOURCE',
        message: 'URL source uses HTTP instead of HTTPS. Flag data may be intercepted.',
      });
    }
  }

  /**
   * Initialize the SDK by loading flags from the configured source.
   * Must be called before evaluating flags. For inline sources, this is synchronous.
   */
  async init(): Promise<void> {
    await this.load();
    this.initialized = true;
    this.sourceController.startAutoRefresh(
      () => this.load(),
      (code, message) => this.emitter.emit('error', { code, message }),
    );
  }

  /**
   * Check if a feature flag is enabled for the given context.
   * Never throws — returns false for unknown flags or errors.
   */
  isEnabled(flagName: string, context?: UserContext): boolean {
    const normalizedName = normalizeFlagName(flagName);
    if (!normalizedName) {
      this.emitter.emit('error', {
        code: 'INVALID_FLAG_NAME',
        message: 'Flag name is empty',
      });
      return false;
    }

    const flag = this.config.flags[normalizedName];
    if (!flag) {
      this.emitter.emit('error', {
        code: 'FLAG_NOT_FOUND',
        message: `Flag "${normalizedName}" not found`,
        flagName: normalizedName,
      });
      return false;
    }

    // Priority: env var > override() > flag file
    const override = resolveEnabledOverride(normalizedName, this.overrides);
    if (override) {
      if (override.source === 'environment') {
        debug(`isEnabled("${normalizedName}") → ${override.value} (env var override)`);
      }
      return override.value;
    }

    const normalizedContext = normalizeContext(context);
    const warnings: EvaluationWarning[] = [];
    const result = evaluateFlag(normalizedName, flag, normalizedContext, this.evalEnv, warnings);

    // Emit lifecycle warnings (e.g., sunset)
    for (const w of warnings) {
      this.emitter.emit('error', { code: w.code, message: w.message, flagName: w.flagName });
    }

    debug(`isEnabled("${normalizedName}") → ${result}`, context ? { context } : undefined);

    this.trackExposure(normalizedName, flag, result, normalizedContext);

    return result;
  }

  /**
   * Get the assigned variant for a feature flag.
   * Never throws — returns null for unknown flags, disabled flags, or errors.
   */
  getVariant(flagName: string, context?: UserContext): string | null {
    const normalizedName = normalizeFlagName(flagName);
    if (!normalizedName) {
      this.emitter.emit('error', {
        code: 'INVALID_FLAG_NAME',
        message: 'Flag name is empty',
      });
      return null;
    }

    const flag = this.config.flags[normalizedName];
    if (!flag) {
      this.emitter.emit('error', {
        code: 'FLAG_NOT_FOUND',
        message: `Flag "${normalizedName}" not found`,
        flagName: normalizedName,
      });
      return null;
    }

    // Priority: env var > override() > flag file
    const override = resolveVariantOverride(normalizedName, this.overrides);
    if (override) {
      if (override.source === 'environment' && override.value !== null) {
        debug(`getVariant("${normalizedName}") → ${override.value} (env var override)`);
      }
      return override.value;
    }

    const normalizedContext = normalizeContext(context);
    const { variant, enabled } = evaluateVariant(
      normalizedName,
      flag,
      normalizedContext,
      this.evalEnv,
    );

    debug(`getVariant("${normalizedName}") → ${variant}`, context ? { context } : undefined);

    this.trackExposure(normalizedName, flag, enabled, normalizedContext, variant);

    return variant;
  }

  /** Register an event listener. */
  on<K extends keyof TinyFlagEvents>(event: K, handler: TinyFlagEvents[K]): void {
    this.emitter.on(event, handler);
  }

  /** Remove an event listener. */
  off<K extends keyof TinyFlagEvents>(event: K, handler: TinyFlagEvents[K]): void {
    this.emitter.off(event, handler);
  }

  /** Manually reload flags from the source. */
  async reload(newSource?: string | FlagConfig | Array<string | FlagConfig>): Promise<void> {
    if (newSource !== undefined) {
      this.sourceController.setSource(newSource);
    }
    await this.load();
  }

  /** Get a snapshot of the current flag configuration. */
  getFlags(): Readonly<Record<string, FlagDefinition>> {
    return this.config.flags;
  }

  /**
   * Evaluate all flags against a context and return a map of results.
   * Useful for SSR hydration and debugging.
   */
  getAllFlags(context?: UserContext): Record<string, { enabled: boolean; variant: string | null }> {
    const normalizedContext = normalizeContext(context);
    const result: Record<string, { enabled: boolean; variant: string | null }> = {};

    for (const [flagName, flag] of Object.entries(this.config.flags)) {
      const override = resolveAllFlagsOverride(flagName, this.overrides);
      if (override) {
        result[flagName] = override;
        continue;
      }

      const enabled = evaluateFlag(flagName, flag, normalizedContext, this.evalEnv);
      const { variant } = evaluateVariant(flagName, flag, normalizedContext, this.evalEnv);
      result[flagName] = { enabled, variant };
    }

    return result;
  }

  /**
   * Override a flag's value for testing/development.
   * Boolean values override isEnabled; string values override getVariant.
   */
  override(flagName: string, value: boolean | string): void {
    const normalizedName = normalizeFlagName(flagName);
    if (!normalizedName) {
      this.emitter.emit('error', {
        code: 'INVALID_FLAG_NAME',
        message: 'Flag name is empty',
      });
      return;
    }
    this.overrides.set(normalizedName, value);
  }

  /** Remove all flag overrides. */
  clearOverrides(): void {
    this.overrides.clear();
  }

  /**
   * Evaluate a flag using a named persona as the base context.
   * Returns false if the persona or flag is not found.
   */
  evaluateWithPersona(
    flagName: string,
    personaName: string,
    additionalContext?: UserContext,
  ): boolean {
    const normalizedName = normalizeFlagName(flagName);
    if (!normalizedName) {
      this.emitter.emit('error', { code: 'INVALID_FLAG_NAME', message: 'Flag name is empty' });
      return false;
    }

    const flag = this.config.flags[normalizedName];
    if (!flag) {
      this.emitter.emit('error', {
        code: 'FLAG_NOT_FOUND',
        message: `Flag "${normalizedName}" not found`,
        flagName: normalizedName,
      });
      return false;
    }

    const persona = this.config.personas?.[personaName];
    if (!persona) {
      this.emitter.emit('error', {
        code: 'PERSONA_NOT_FOUND',
        message: `Persona "${personaName}" not found`,
      });
      return false;
    }

    return coreEvaluateWithPersona(normalizedName, flag, persona, additionalContext);
  }

  /** Get all defined personas. */
  getPersonas(): Readonly<Record<string, Record<string, unknown>>> {
    return this.config.personas ?? {};
  }

  /**
   * Get typed configuration for a flag.
   * Returns null if the flag is not found, disabled, or has no config.
   */
  getConfig<T = Record<string, unknown>>(flagName: string, context?: UserContext): T | null {
    const normalizedName = normalizeFlagName(flagName);
    if (!normalizedName) {
      this.emitter.emit('error', {
        code: 'INVALID_FLAG_NAME',
        message: 'Flag name is empty',
      });
      return null;
    }

    const flag = this.config.flags[normalizedName];
    if (!flag) {
      this.emitter.emit('error', {
        code: 'FLAG_NOT_FOUND',
        message: `Flag "${normalizedName}" not found`,
        flagName: normalizedName,
      });
      return null;
    }
    if (!flag.config) return null;

    const normalizedContext = normalizeContext(context);
    if (!evaluateFlag(normalizedName, flag, normalizedContext, this.evalEnv)) return null;

    return flag.config as T;
  }

  /** Clean up resources (file watchers, polling timers). */
  destroy(): void {
    this.sourceController.destroy();
    this.emitter.removeAllListeners();
    this.exposureCache.clear();
    this.overrides.clear();
  }

  private async load(): Promise<void> {
    try {
      const pendingResult = this.sourceController.load();
      const result = pendingResult instanceof Promise ? await pendingResult : pendingResult;
      if (!result) return;
      const { config, warnings } = result;

      // Emit warnings for unknown fields
      for (const w of warnings) {
        this.emitter.emit('error', {
          code: 'UNKNOWN_FIELD',
          message: `${w.path}: ${w.message}`,
        });
      }

      // Emit change events for modified flags
      if (this.initialized) {
        this.emitChanges(this.config.flags, config.flags);
      }

      this.config = config;
      this.evalEnv = { allFlags: config.flags, segments: config.segments ?? {} };
      setEvaluationContext(config.flags, config.segments);

      // Detect circular dependencies
      const cycles = detectCircularDependencies(config.flags);
      for (const cycle of cycles) {
        this.emitter.emit('error', {
          code: 'CIRCULAR_DEPENDENCY',
          message: `Circular flag dependency detected: ${cycle.join(' → ')}`,
        });
      }

      debug(
        `loaded ${Object.keys(config.flags).length} flags from ${this.sourceController.sourceType}`,
      );
    } catch (error) {
      if (!this.initialized) {
        throw error; // Rethrow on initial load
      }
      // On subsequent loads, retain last valid config and emit error
      this.emitter.emit('error', {
        code: 'LOAD_ERROR',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private emitChanges(
    previous: Record<string, FlagDefinition>,
    current: Record<string, FlagDefinition>,
  ): void {
    const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);
    const now = Date.now();

    for (const key of allKeys) {
      const prev = previous[key];
      const curr = current[key];

      if (hashFlag(prev) !== hashFlag(curr)) {
        this.emitter.emit('change', {
          flag: key,
          previous: prev,
          current: curr,
          timestamp: now,
        });
      }
    }
  }

  private trackExposure(
    flagName: string,
    flag: FlagDefinition,
    enabled: boolean,
    context?: UserContext,
    variant?: string | null,
  ): void {
    if (!context?.userId) return;
    if (!this.emitter.hasListeners('exposure')) return;

    const deduplicate = this.options.deduplicate !== false;
    if (deduplicate) {
      const cacheKey = `${flagName}:${context.userId}`;
      if (this.exposureCache.has(cacheKey)) {
        // Move to end for LRU freshness
        this.exposureCache.delete(cacheKey);
        this.exposureCache.set(cacheKey, true);
        return;
      }
      if (this.exposureCache.size >= TinyFlag.EXPOSURE_CACHE_MAX) {
        // Evict oldest entries (first keys in Map insertion order)
        let evicted = 0;
        for (const key of this.exposureCache.keys()) {
          if (evicted >= TinyFlag.EXPOSURE_CACHE_EVICT) break;
          this.exposureCache.delete(key);
          evicted++;
        }
      }
      this.exposureCache.set(cacheKey, true);
    }

    const event: ExposureEvent = {
      flag: flagName,
      variant: variant ?? null,
      enabled,
      userId: context.userId,
      timestamp: Date.now(),
    };

    this.emitter.emit('exposure', event);
  }
}

function hashFlag(flag: FlagDefinition | undefined): number {
  if (flag === undefined) return 0;
  return murmurhash3(JSON.stringify(flag));
}
