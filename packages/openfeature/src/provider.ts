import type {
  Provider,
  ResolutionDetails,
  EvaluationContext,
  JsonValue,
  ProviderMetadata,
  ProviderStatus,
  Hook,
  Logger,
} from '@openfeature/server-sdk';
import {
  OpenFeatureEventEmitter,
  ProviderEvents,
  ErrorCode,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import type { TinyFlag, UserContext, ChangeEvent, ErrorEvent, FlagDefinition } from 'tinyflag';

/**
 * OpenFeature provider backed by TinyFlag.
 *
 * Bridges TinyFlag's flag evaluation into the vendor-agnostic
 * OpenFeature SDK so consumers can swap providers without code changes.
 */
export class TinyFlagProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'tinyflag',
  };

  readonly rulesGlobally = false;
  hooks: Hook[] = [];
  events = new OpenFeatureEventEmitter();

  status: ProviderStatus = 'NOT_READY' as ProviderStatus;
  private instance: TinyFlag;

  constructor(instance: TinyFlag) {
    if (!instance) {
      throw new Error('TinyFlagProvider: TinyFlag instance is required');
    }
    this.instance = instance;
    this.wireEvents();
  }

  /**
   * Initialize the provider. Called by the OpenFeature SDK.
   * Emits PROVIDER_READY on success, PROVIDER_ERROR on failure.
   */
  async initialize(): Promise<void> {
    try {
      await this.instance.init();
      this.status = 'READY' as ProviderStatus;
      this.events.emit(ProviderEvents.Ready);
    } catch (error) {
      this.status = 'ERROR' as ProviderStatus;
      this.events.emit(ProviderEvents.Error, {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async onClose(): Promise<void> {
    this.instance.destroy();
    this.status = 'NOT_READY' as ProviderStatus;
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolve(flagKey, defaultValue, context, 'boolean');
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return this.resolve(flagKey, defaultValue, context, 'string');
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return this.resolve(flagKey, defaultValue, context, 'number');
  }

  async resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this.resolve(flagKey, defaultValue, context, 'object');
  }

  // --- private helpers ---

  private resolve<T>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    expectedType: string,
  ): ResolutionDetails<T> {
    try {
      const userContext = this.translateContext(context);
      const flags = this.instance.getFlags();
      const flag = flags[flagKey];

      if (!flag) {
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.ERROR,
          errorCode: ErrorCode.FLAG_NOT_FOUND,
          errorMessage: `Flag "${flagKey}" not found`,
        };
      }

      if (expectedType === 'boolean') {
        const enabled = this.instance.isEnabled(flagKey, userContext);
        return {
          value: enabled as unknown as T,
          reason: this.getReason(flag, userContext),
        };
      }

      if (expectedType === 'string') {
        const variant = this.instance.getVariant(flagKey, userContext);
        if (variant === null) {
          const enabled = this.instance.isEnabled(flagKey, userContext);
          return {
            value: (enabled ? 'true' : 'false') as unknown as T,
            reason: this.getReason(flag, userContext),
          };
        }
        return {
          value: variant as unknown as T,
          variant: variant,
          reason: this.getReason(flag, userContext),
        };
      }

      if (expectedType === 'number') {
        const variant = this.instance.getVariant(flagKey, userContext);
        if (variant !== null) {
          const num = Number(variant);
          if (!isNaN(num)) {
            return {
              value: num as unknown as T,
              variant: variant,
              reason: this.getReason(flag, userContext),
            };
          }
        }
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.DEFAULT,
        };
      }

      // object type
      if (expectedType === 'object') {
        const allFlags = this.instance.getAllFlags(userContext);
        const result = allFlags[flagKey];
        if (result) {
          const obj = { enabled: result.enabled, variant: result.variant } as unknown as T;
          return {
            value: obj,
            reason: this.getReason(flag, userContext),
          };
        }
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.DEFAULT,
        };
      }

      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
      };
    } catch (error) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private translateContext(context: EvaluationContext): UserContext {
    const userContext: UserContext = {};

    if (context.targetingKey) {
      userContext.userId = context.targetingKey;
    }

    for (const [key, value] of Object.entries(context)) {
      if (key === 'targetingKey') continue;
      userContext[key] = value;
    }

    return userContext;
  }

  private getReason(
    flag: Pick<FlagDefinition, 'rules' | 'rollout'>,
    context?: UserContext,
  ): string {
    if (flag.rules && flag.rules.length > 0 && context) {
      return StandardResolutionReasons.TARGETING_MATCH;
    }
    if (flag.rollout !== undefined && context?.userId) {
      return StandardResolutionReasons.SPLIT;
    }
    return StandardResolutionReasons.STATIC;
  }

  private wireEvents(): void {
    this.instance.on('change', (_event: ChangeEvent) => {
      this.events.emit(ProviderEvents.ConfigurationChanged, {
        flagsChanged: [_event.flag],
      });
    });

    this.instance.on('error', (_event: ErrorEvent) => {
      if (_event.code === 'LOAD_ERROR') {
        this.status = 'ERROR' as ProviderStatus;
        this.events.emit(ProviderEvents.Error, {
          message: _event.message,
        });
      }
    });
  }
}
