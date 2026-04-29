import type {
  FlagConfig,
  FlagDefinition,
  TinyFlagOptions,
  UserContext,
  TinyFlagEvents,
  ExposureEvent,
} from './types.js';
import { EventEmitter } from './events.js';
import { evaluateFlag, evaluateVariant } from './evaluator.js';
import {
  detectSourceType,
  loadFromFile,
  loadFromUrl,
  loadFromInline,
  type SourceType,
} from './loader.js';
import { debug, setDebug } from './debug.js';
import { murmurhash3 } from './hash.js';

const MIN_POLL_INTERVAL = 5_000;
const DEFAULT_POLL_INTERVAL = 60_000;

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
  private readonly options: Required<Pick<TinyFlagOptions, 'strict' | 'watch'>> & TinyFlagOptions;
  private readonly emitter = new EventEmitter();
  private sourceType: SourceType;
  private initialized = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private watcher?: { close(): void };
  private etag?: string;
  private lastModified?: string;
  private exposureCache = new Set<string>();
  private overrides = new Map<string, boolean | string>();

  constructor(options: TinyFlagOptions) {
    if (!options.source) {
      throw new Error('TinyFlag: "source" option is required');
    }

    this.options = {
      ...options,
      strict: options.strict ?? false,
      watch: options.watch ?? true,
    };
    this.sourceType = detectSourceType(options.source);

    if (options.debug) {
      setDebug(true);
    }

    debug('initialized', { sourceType: this.sourceType, strict: this.options.strict });

    // Warn about HTTP (not HTTPS) for URL sources
    if (
      this.sourceType === 'url' &&
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
    this.startAutoRefresh();
  }

  /**
   * Check if a feature flag is enabled for the given context.
   * Never throws — returns false for unknown flags or errors.
   */
  isEnabled(flagName: string, context?: UserContext): boolean {
    const normalizedName = flagName?.trim();
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

    const overrideValue = this.overrides.get(normalizedName);
    if (typeof overrideValue === 'boolean') return overrideValue;

    const normalizedContext = normalizeContext(context);
    const result = evaluateFlag(normalizedName, flag, normalizedContext);

    debug(`isEnabled("${normalizedName}") → ${result}`, context ? { context } : undefined);

    this.trackExposure(normalizedName, flag, result, normalizedContext);

    return result;
  }

  /**
   * Get the assigned variant for a feature flag.
   * Never throws — returns null for unknown flags, disabled flags, or errors.
   */
  getVariant(flagName: string, context?: UserContext): string | null {
    const normalizedName = flagName?.trim();
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

    const overrideValue = this.overrides.get(normalizedName);
    if (typeof overrideValue === 'string') return overrideValue;
    if (overrideValue === false) return null;

    const normalizedContext = normalizeContext(context);
    const variant = evaluateVariant(normalizedName, flag, normalizedContext);
    const enabled = evaluateFlag(normalizedName, flag, normalizedContext);

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
  async reload(newSource?: string | FlagConfig): Promise<void> {
    if (newSource !== undefined) {
      (this.options as TinyFlagOptions).source = newSource;
      this.sourceType = detectSourceType(newSource);
    }
    await this.load();
  }

  /** Get a snapshot of the current flag configuration. */
  getFlags(): Readonly<Record<string, FlagDefinition>> {
    return this.config.flags;
  }

  /**
   * Override a flag's value for testing/development.
   * Boolean values override isEnabled; string values override getVariant.
   */
  override(flagName: string, value: boolean | string): void {
    this.overrides.set(flagName, value);
  }

  /** Remove all flag overrides. */
  clearOverrides(): void {
    this.overrides.clear();
  }

  /** Clean up resources (file watchers, polling timers). */
  destroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
    this.emitter.removeAllListeners();
    this.exposureCache.clear();
    this.overrides.clear();
  }

  private async load(): Promise<void> {
    try {
      const { source, strict } = this.options;
      let config: FlagConfig;
      let warnings: { path: string; message: string }[] = [];

      switch (this.sourceType) {
        case 'file': {
          const result = await loadFromFile(source as string, strict);
          config = result.config;
          warnings = result.warnings;
          break;
        }
        case 'url': {
          const result = await loadFromUrl(
            source as string,
            strict,
            this.options.headers,
            this.etag,
            this.lastModified,
          );
          if (result.notModified) return;
          config = result.config;
          warnings = result.warnings;
          this.etag = result.etag;
          this.lastModified = result.lastModified;
          break;
        }
        case 'inline': {
          const result = loadFromInline(source as FlagConfig, strict);
          config = result.config;
          warnings = result.warnings;
          break;
        }
      }

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
      debug(`loaded ${Object.keys(config.flags).length} flags from ${this.sourceType}`);
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
      if (this.exposureCache.has(cacheKey)) return;
      if (this.exposureCache.size >= 10_000) this.exposureCache.clear();
      this.exposureCache.add(cacheKey);
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

  private startAutoRefresh(): void {
    if (this.sourceType === 'url') {
      let interval = this.options.pollInterval ?? DEFAULT_POLL_INTERVAL;
      if (interval < MIN_POLL_INTERVAL) {
        interval = MIN_POLL_INTERVAL;
        this.emitter.emit('error', {
          code: 'POLL_INTERVAL_CLAMPED',
          message: `pollInterval clamped to minimum of ${MIN_POLL_INTERVAL}ms`,
        });
      }
      this.pollTimer = setInterval(() => this.load(), interval);
    }

    if (this.sourceType === 'file' && this.options.watch) {
      this.startFileWatcher();
    }
  }

  private async startFileWatcher(): Promise<void> {
    try {
      const fs = await import('fs');
      const filePath = this.options.source as string;
      this.watcher = fs.watch(filePath, { persistent: false }, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          // Debounce slightly for editors that do delete+create
          setTimeout(() => this.load(), 100);
        }
      });
    } catch {
      // File watching not available in this runtime — that's OK
    }
  }
}

function normalizeContext(context?: UserContext): UserContext | undefined {
  if (context === null || context === undefined) return undefined;
  if (context.userId === '') {
    const { userId, ...rest } = context;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }
  return context;
}

function hashFlag(flag: FlagDefinition | undefined): number {
  if (flag === undefined) return 0;
  return murmurhash3(JSON.stringify(flag));
}
