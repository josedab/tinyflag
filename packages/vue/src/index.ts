import {
  inject,
  provide,
  ref,
  computed,
  onMounted,
  onUnmounted,
  type Ref,
  type InjectionKey,
} from 'vue';
import { TinyFlag } from 'tinyflag';
import type { TinyFlagOptions, UserContext, ChangeEvent } from 'tinyflag';

interface TinyFlagInjection {
  instance: TinyFlag;
  versions: Map<string, Ref<number>>;
  context: Ref<UserContext | undefined>;
}

const TINYFLAG_KEY: InjectionKey<TinyFlagInjection> = Symbol('tinyflag');

export interface ProvideTinyFlagOptions {
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
  /** Pre-initialized TinyFlag instance (for SSR/Nuxt). */
  instance?: TinyFlag;
}

/**
 * Provide TinyFlag to child components via Vue's provide/inject.
 * Call in a parent component's setup function.
 */
export function provideTinyFlag(options: ProvideTinyFlagOptions): TinyFlag {
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

  const versions = new Map<string, Ref<number>>();
  const context = ref(options.context);

  const handleChange = (event: ChangeEvent) => {
    const version = versions.get(event.flag);
    if (version) version.value++;
  };

  onMounted(() => {
    if (!options.instance) {
      instance.init().catch(() => {});
    }
    instance.on('change', handleChange);
  });

  onUnmounted(() => {
    instance.off('change', handleChange);
    if (!options.instance) {
      instance.destroy();
    }
  });

  provide(TINYFLAG_KEY, { instance, versions, context });
  return instance;
}

function useTinyFlagInjection(): TinyFlagInjection {
  const injection = inject(TINYFLAG_KEY);
  if (!injection) {
    throw new Error('useFlag/useVariant requires provideTinyFlag() in a parent component.');
  }
  return injection;
}

/**
 * Vue composable that returns a reactive Ref<boolean> for a feature flag.
 */
export function useFlag(flagName: string): Ref<boolean> {
  const injection = useTinyFlagInjection();
  const { instance, context } = injection;
  const version = getFlagVersion(injection, flagName);
  return computed(() => {
    void version.value; // trigger reactivity on flag changes
    return instance.isEnabled(flagName, context.value);
  });
}

/**
 * Vue composable that returns a reactive Ref<string | null> for a variant.
 */
export function useVariant(flagName: string): Ref<string | null> {
  const injection = useTinyFlagInjection();
  const { instance, context } = injection;
  const version = getFlagVersion(injection, flagName);
  return computed(() => {
    void version.value;
    return instance.getVariant(flagName, context.value);
  });
}

/**
 * Vue composable that returns the TinyFlag instance.
 */
export function useTinyFlagInstance(): TinyFlag {
  return useTinyFlagInjection().instance;
}

function getFlagVersion(injection: TinyFlagInjection, flagName: string): Ref<number> {
  let version = injection.versions.get(flagName);
  if (!version) {
    version = ref(0);
    injection.versions.set(flagName, version);
  }
  return version;
}
