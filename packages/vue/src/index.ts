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
import type { TinyFlagOptions, UserContext } from 'tinyflag';

interface TinyFlagInjection {
  instance: TinyFlag;
  version: Ref<number>;
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
  /** Pre-initialized TinyFlag instance (for SSR/Nuxt). */
  instance?: TinyFlag;
}

/**
 * Provide TinyFlag to child components via Vue's provide/inject.
 * Call in a parent component's setup function.
 */
export function provideTinyFlag(options: ProvideTinyFlagOptions): TinyFlag {
  const instance = options.instance ?? new TinyFlag({
    source: options.source,
    headers: options.headers,
    pollInterval: options.pollInterval,
    watch: options.watch,
    strict: options.strict,
  });

  const version = ref(0);
  const context = ref(options.context);

  const handleChange = () => { version.value++; };

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

  provide(TINYFLAG_KEY, { instance, version, context });
  return instance;
}

function useTinyFlagInjection(): TinyFlagInjection {
  const injection = inject(TINYFLAG_KEY);
  if (!injection) {
    throw new Error(
      'useFlag/useVariant requires provideTinyFlag() in a parent component.',
    );
  }
  return injection;
}

/**
 * Vue composable that returns a reactive Ref<boolean> for a feature flag.
 */
export function useFlag(flagName: string): Ref<boolean> {
  const { instance, version, context } = useTinyFlagInjection();
  return computed(() => {
    void version.value; // trigger reactivity on flag changes
    return instance.isEnabled(flagName, context.value);
  });
}

/**
 * Vue composable that returns a reactive Ref<string | null> for a variant.
 */
export function useVariant(flagName: string): Ref<string | null> {
  const { instance, version, context } = useTinyFlagInjection();
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
