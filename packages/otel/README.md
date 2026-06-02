# tinyflag-otel

OpenTelemetry instrumentation for TinyFlag — emit spans and trace baggage for feature flag evaluations.

## Installation

```bash
npm install tinyflag-otel @opentelemetry/api
```

`@opentelemetry/api` is an optional peer dependency. Without it, instrumentation is a no-op.

## Usage

```typescript
import { TinyFlag } from 'tinyflag';
import { instrumentTinyFlag } from 'tinyflag-otel';

const tf = new TinyFlag({ source: 'flags.yml' });
await tf.init();

const instrumentation = instrumentTinyFlag(tf, {
  injectBaggage: true,       // inject flag decisions into trace baggage
  filter: (flag) => true,    // filter which flags create spans
});

// All flag evaluations now emit OTel spans
const enabled = tf.isEnabled('dark-mode', { userId: 'user-1' });

// Cleanup
instrumentation.dispose();
```

## Span Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `feature_flag.key` | string | Flag name |
| `feature_flag.provider_name` | string | Always "tinyflag" |
| `feature_flag.enabled` | boolean | Evaluation result |
| `feature_flag.variant` | string | Selected variant (if any) |
| `feature_flag.user_id` | string | User ID from context |

## Configuration Examples

### Jaeger
```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new JaegerExporter()));
provider.register();
```

### Datadog
```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
const exporter = new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' });
```

### Honeycomb
```typescript
const exporter = new OTLPTraceExporter({
  url: 'https://api.honeycomb.io/v1/traces',
  headers: { 'x-honeycomb-team': process.env.HONEYCOMB_API_KEY },
});
```
