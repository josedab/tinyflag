import { writable, derived, type Readable, type Writable } from 'svelte/store';
import { getContext as svelteGetContext, setContext as svelteSetContext } from 'svelte';
import { TinyFlag } from 'tinyflag';
import type { TinyFlagOptions, UserContext, ChangeEvent } from 'tinyflag';

const TINYFLAG_CONTEXT_KEY = Symbol('tinyflag');

interface TinyFlagContext {
  instance: TinyFlag;
  context: Writable<UserContext | undefined>;
  versions: Map<string, Writable<number>>;
}

// Module-level fallback for non-component contexts (e.g. tests)
let fallbackCtx: TinyFlagContext | null = null;

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
  /** Deduplicate exposure events per (flag, userId). Default: true. */
  deduplicate?: boolean;
  /** Timeout in ms for fetching flags from a URL. Default: 5000. */
  fetchTimeout?: number;
  /** Enable debug logging. Default: false. */
  debug?: boolean;
  /** Pre-initialized TinyFlag instance (for SSR/SvelteKit). */
  instance?: TinyFlag;
}

/**
 * Initialize TinyFlag for use with Svelte stores.
 * When called inside a Svelte component's script block, uses setContext
 * for proper isolation in multi-instance scenarios.
 *
 * @returns The TinyFlag instance and a cleanup function.
 */
export function createTinyFlag(options: CreateTinyFlagOptions): {
  instance: TinyFlag;
  destroy: () => void;
} {
  const instance =
    options.instance ??
    new TinyFlag({
      source: options.source,
      headers: options.headers,
      pollInterval: options.pollInterval,
      watch: options.watch,
      strict: options.strict,
      deduplicate: options.deduplicate,
      fetchTimeout: options.fetchTimeout,
      debug: options.debug,
    });

  const ctxStore = writable<UserContext | undefined>(options.context);
  const versions = new Map<string, Writable<number>>();

  const tfCtx: TinyFlagContext = {
    instance,
    context: ctxStore,
    versions,
  };

  // Store in Svelte component context when inside component init
  try {
    svelteSetContext(TINYFLAG_CONTEXT_KEY, tfCtx);
  } catch {
    // Outside component init — use module-level fallback
  }
  fallbackCtx = tfCtx;

  const handleChange = (event: ChangeEvent) => {
    versions.get(event.flag)?.update((value) => value + 1);
  };
  instance.on('change', handleChange);

  if (!options.instance) {
    instance.init().catch(() => {});
  }

  const destroy = () => {
    instance.off('change', handleChange);
    if (!options.instance) {
      instance.destroy();
    }
    if (fallbackCtx === tfCtx) {
      fallbackCtx = null;
    }
  };

  return { instance, destroy };
}

function getTinyFlagContext(): TinyFlagContext {
  // Prefer Svelte component context for proper isolation
  try {
    const ctx = svelteGetContext<TinyFlagContext | undefined>(TINYFLAG_CONTEXT_KEY);
    if (ctx) return ctx;
  } catch {
    // Outside component init — fall through to module-level fallback
  }

  if (fallbackCtx) return fallbackCtx;

  throw new Error('flag()/variant()/setContext() requires createTinyFlag() to be called first.');
}

/**
 * Create a Svelte readable store for a feature flag's enabled state.
 * Use with `$` syntax: `{#if $showFeature}...{/if}`
 */
export function flag(flagName: string): Readable<boolean> {
  const ctx = getTinyFlagContext();
  const { instance, context } = ctx;
  const version = getFlagVersion(ctx, flagName);
  return derived([version, context], ([$version, $context]) => {
    void $version;
    return instance.isEnabled(flagName, $context);
  });
}

/**
 * Create a Svelte readable store for a feature flag's variant.
 * Use with `$` syntax: `{#if $variant === 'new-flow'}...{/if}`
 */
export function variant(flagName: string): Readable<string | null> {
  const ctx = getTinyFlagContext();
  const { instance, context } = ctx;
  const version = getFlagVersion(ctx, flagName);
  return derived([version, context], ([$version, $context]) => {
    void $version;
    return instance.getVariant(flagName, $context);
  });
}

/**
 * Update the user context. Triggers re-evaluation of all flag/variant stores.
 */
export function setContext(context: UserContext | undefined): void {
  const ctx = getTinyFlagContext();
  ctx.context.set(context);
}

/**
 * Get the TinyFlag instance for advanced use cases.
 */
export function useTinyFlagInstance(): TinyFlag {
  return getTinyFlagContext().instance;
}

function getFlagVersion(ctx: TinyFlagContext, flagName: string): Writable<number> {
  let version = ctx.versions.get(flagName);
  if (!version) {
    version = writable(0);
    ctx.versions.set(flagName, version);
  }
  return version;
}
