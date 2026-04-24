import type { TinyFlag, UserContext } from 'tinyflag';

/** Minimal OTel tracer interface matching @opentelemetry/api. */
interface OtelTracer {
  startSpan(
    name: string,
    opts?: { attributes?: Record<string, string> },
  ): { end(): void } | undefined;
}

/** Minimal OTel trace API surface. */
interface OtelTraceApi {
  getTracer(name: string, version?: string): OtelTracer;
}

export interface TinyFlagMiddlewareOptions {
  /** TinyFlag instance. */
  instance: TinyFlag;
  /** Extract user context from the request. */
  contextFromRequest?: (req: unknown) => UserContext | undefined;
  /** Enable OpenTelemetry tracing spans. Default: false. */
  tracing?: boolean;
  /** Optional @opentelemetry/api trace object. If not provided, attempts dynamic import. */
  otelTrace?: OtelTraceApi;
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
  otelTrace?: OtelTraceApi,
): EvaluatedFlags {
  return {
    isEnabled(flagName: string): boolean {
      const start = tracing ? Date.now() : 0;
      const result = instance.isEnabled(flagName, context);
      if (tracing) {
        traceSpan('tinyflag.isEnabled', flagName, otelTrace);
      }
      return result;
    },
    getVariant(flagName: string): string | null {
      const start = tracing ? Date.now() : 0;
      const result = instance.getVariant(flagName, context);
      if (tracing) {
        traceSpan('tinyflag.getVariant', flagName, otelTrace);
      }
      return result;
    },
    all(): Record<string, { enabled: boolean; variant: string | null }> {
      return instance.getAllFlags(context);
    },
  };
}

let cachedTracer: OtelTracer | null | undefined;

function getTracer(otelTrace?: OtelTraceApi): OtelTracer | null {
  if (otelTrace) {
    return otelTrace.getTracer('tinyflag', '0.1.0');
  }
  if (cachedTracer !== undefined) return cachedTracer;
  try {
    // Attempt to resolve @opentelemetry/api at runtime
    const api = require('@opentelemetry/api') as { trace: OtelTraceApi } | undefined;
    cachedTracer = api?.trace?.getTracer('tinyflag', '0.1.0') ?? null;
  } catch {
    cachedTracer = null;
  }
  return cachedTracer;
}

function traceSpan(name: string, flagName: string, otelTrace?: OtelTraceApi): void {
  try {
    const tracer = getTracer(otelTrace);
    if (tracer?.startSpan) {
      const span = tracer.startSpan(name, { attributes: { 'tinyflag.flag': flagName } });
      span?.end();
    }
  } catch {
    // Tracing is optional
  }
}

export type { TinyFlag, UserContext };
