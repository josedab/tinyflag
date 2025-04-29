import type { TinyFlag, UserContext } from 'tinyflag';

export interface TinyFlagMiddlewareOptions {
  /** TinyFlag instance. */
  instance: TinyFlag;
  /** Extract user context from the request. */
  contextFromRequest?: (req: unknown) => UserContext | undefined;
  /** Enable OpenTelemetry tracing spans. Default: false. */
  tracing?: boolean;
}

export interface EvaluatedFlags {
  /** Check if a flag is enabled. */
  isEnabled(flagName: string): boolean;
  /** Get the variant for a flag. */
  getVariant(flagName: string): string | null;
  /** Get all flags evaluated for this request. */
  all(): Record<string, { enabled: boolean; variant: string | null }>;
}

/**
 * Create an evaluated flags object for a request context.
 */
export function evaluateForContext(
  instance: TinyFlag,
  context?: UserContext,
  tracing?: boolean,
): EvaluatedFlags {
  return {
    isEnabled(flagName: string): boolean {
      const start = tracing ? Date.now() : 0;
      const result = instance.isEnabled(flagName, context);
      if (tracing) {
        traceSpan('tinyflag.isEnabled', flagName, Date.now() - start);
      }
      return result;
    },
    getVariant(flagName: string): string | null {
      const start = tracing ? Date.now() : 0;
      const result = instance.getVariant(flagName, context);
      if (tracing) {
        traceSpan('tinyflag.getVariant', flagName, Date.now() - start);
      }
      return result;
    },
    all(): Record<string, { enabled: boolean; variant: string | null }> {
      return instance.getAllFlags(context);
    },
  };
}

function traceSpan(name: string, flagName: string, _durationMs: number): void {
  try {
    // OpenTelemetry trace API (if available)
    const g = globalThis as Record<string, unknown>;
    const otel = g.__OTEL_TRACER__ as { startSpan?: (name: string, opts: Record<string, unknown>) => { end(): void } | undefined } | undefined;
    if (otel?.startSpan) {
      const span = otel.startSpan(name, { attributes: { 'tinyflag.flag': flagName } });
      span?.end();
    }
  } catch {
    // Tracing is optional
  }
}

export type { TinyFlag, UserContext };
