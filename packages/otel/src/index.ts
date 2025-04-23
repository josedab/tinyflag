/**
 * tinyflag-otel — OpenTelemetry instrumentation for TinyFlag.
 *
 * Wraps TinyFlag's isEnabled/getVariant with OpenTelemetry span creation
 * for observability and downstream correlation.
 * Designed as an opt-in package with @opentelemetry/api as an optional peer dependency.
 */

import type { ExposureEvent } from 'tinyflag';

/** Minimal TinyFlag interface needed for instrumentation. */
export interface InstrumentableTinyFlag {
  on(event: 'exposure', handler: (e: ExposureEvent) => void): void;
  off(event: 'exposure', handler: (e: ExposureEvent) => void): void;
}

/** Minimal OTel span interface. */
export interface OtelSpan {
  setAttribute(key: string, value: string | number | boolean): OtelSpan;
  setStatus(status: { code: number; message?: string }): OtelSpan;
  end(): void;
}

/** Minimal OTel tracer interface. */
export interface OtelTracer {
  startSpan(name: string): OtelSpan;
}

/** Minimal OTel API surface needed by this package. */
export interface OtelApi {
  trace: {
    getTracer(name: string, version?: string): OtelTracer;
  };
  SpanStatusCode: { OK: number; ERROR: number };
}

/** Configuration options for TinyFlag OTel instrumentation. */
export interface TinyFlagOtelOptions {
  /** The @opentelemetry/api module. Pass `require('@opentelemetry/api')` or the import. */
  otelApi: OtelApi;
  /** Custom tracer name. Default: 'tinyflag' */
  tracerName?: string;
  /** Tracer version. Default: '0.1.0' */
  tracerVersion?: string;
  /** Custom span name prefix. Default: 'tinyflag.evaluate' */
  spanNamePrefix?: string;
  /** Filter which flags generate spans. Default: all flags. */
  filter?: (flagName: string) => boolean;
}

/** Handle returned by instrumentTinyFlag for cleanup. */
export interface DisposableInstrumentation {
  dispose(): void;
}

/**
 * Wrap a TinyFlag instance with OpenTelemetry instrumentation.
 * Creates spans for each flag evaluation.
 */
export function instrumentTinyFlag(
  tf: InstrumentableTinyFlag,
  options: TinyFlagOtelOptions,
): DisposableInstrumentation {
  const {
    otelApi,
    tracerName = 'tinyflag',
    tracerVersion = '0.1.0',
    spanNamePrefix = 'tinyflag.evaluate',
    filter,
  } = options;

  const tracer = otelApi.trace.getTracer(tracerName, tracerVersion);

  const handler = (event: ExposureEvent) => {
    if (filter && !filter(event.flag)) return;

    const span = tracer.startSpan(`${spanNamePrefix}.${event.flag}`);
    span.setAttribute('feature_flag.key', event.flag);
    span.setAttribute('feature_flag.provider_name', 'tinyflag');
    span.setAttribute('feature_flag.enabled', event.enabled);

    if (event.variant) {
      span.setAttribute('feature_flag.variant', event.variant);
    }

    if (event.userId) {
      span.setAttribute('feature_flag.user_id', event.userId);
    }

    span.setStatus({ code: otelApi.SpanStatusCode.OK });
    span.end();
  };

  tf.on('exposure', handler);

  return {
    dispose: () => {
      tf.off('exposure', handler);
    },
  };
}

/**
 * Create a standalone span for a manual flag evaluation (without TinyFlag SDK).
 */
export function createFlagSpan(
  otelApi: OtelApi,
  flagName: string,
  enabled: boolean,
  variant?: string | null,
  userId?: string,
): void {
  const tracer = otelApi.trace.getTracer('tinyflag', '0.1.0');
  const span = tracer.startSpan(`tinyflag.evaluate.${flagName}`);
  span.setAttribute('feature_flag.key', flagName);
  span.setAttribute('feature_flag.provider_name', 'tinyflag');
  span.setAttribute('feature_flag.enabled', enabled);
  if (variant) span.setAttribute('feature_flag.variant', variant);
  if (userId) span.setAttribute('feature_flag.user_id', userId);
  span.setStatus({ code: otelApi.SpanStatusCode.OK });
  span.end();
}
