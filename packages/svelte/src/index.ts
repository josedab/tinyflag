import { writable, derived, type Readable } from 'svelte/store';
import { TinyFlag } from 'tinyflag';
import type { TinyFlagOptions, UserContext } from 'tinyflag';

let globalInstance: TinyFlag | null = null;
let globalContext = writable<UserContext | undefined>(undefined);
let globalVersion = writable(0);

export interface CreateTinyFlagOptions {
  /** TinyFlag source — file path, URL, or inline FlagConfig. */
  source: TinyFlagOptions['source'];
  /** User context for flag evaluation. */
  context?: UserContext;
  /** Custom headers for URL source. */
  headers?: Record<string, string>;
  /** Polling interval for URL source (ms). */
  pollInterval?: number;
  /** Enable file watching. */
  watch?: boolean;
  /** Strict validation mode. */
  strict?: boolean;
  /** Pre-initialized TinyFlag instance (for SSR/SvelteKit). */
  instance?: TinyFlag;
}

/**
 * Initialize TinyFlag for use with Svelte stores.
 * Call once at the root of your application.
 *
 * @returns The TinyFlag instance and a cleanup function.
 */
export function createTinyFlag(options: CreateTinyFlagOptions): {
  instance: TinyFlag;
  destroy: () => void;
} {
  const instance = options.instance ?? new TinyFlag({
    source: options.source,
    headers: options.headers,
    pollInterval: options.pollInterval,
    watch: options.watch,
    strict: options.strict,
  });

  globalInstance = instance;
  globalContext.set(options.context);

  const handleChange = () => globalVersion.update((v) => v + 1);
  instance.on('change', handleChange);

  if (!options.instance) {
    instance.init().catch(() => {});
  }

  const destroy = () => {
    instance.off('change', handleChange);
    if (!options.instance) {
      instance.destroy();
    }
    globalInstance = null;
  };

  return { instance, destroy };
}

function getInstanceOrThrow(): TinyFlag {
  if (!globalInstance) {
    throw new Error(
      'flag()/variant() requires createTinyFlag() to be called first.',
    );
  }
  return globalInstance;
}

/**
 * Create a Svelte readable store for a feature flag's enabled state.
 * Use with `$` syntax: `{#if $showFeature}...{/if}`
 */
export function flag(flagName: string): Readable<boolean> {
  return derived(
    [globalVersion, globalContext],
    ([$version, $context]) => {
      const instance = getInstanceOrThrow();
      return instance.isEnabled(flagName, $context);
    },
  );
}

/**
 * Create a Svelte readable store for a feature flag's variant.
 * Use with `$` syntax: `{#if $variant === 'new-flow'}...{/if}`
 */
export function variant(flagName: string): Readable<string | null> {
  return derived(
    [globalVersion, globalContext],
    ([$version, $context]) => {
      const instance = getInstanceOrThrow();
      return instance.getVariant(flagName, $context);
    },
  );
}

/**
 * Update the user context. Triggers re-evaluation of all flag/variant stores.
 */
export function setContext(context: UserContext | undefined): void {
  globalContext.set(context);
}
