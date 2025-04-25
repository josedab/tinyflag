---
sidebar_position: 4
title: Audit Logging
description: Track flag changes with pluggable audit sinks.
---

# Audit Logging

Track all flag changes with structured audit events. TinyFlag ships built-in sinks for files, webhooks, console, and OpenTelemetry.

## Setup

```typescript
import { TinyFlag } from 'tinyflag';
import { connectAudit, createFileSink, createConsoleSink } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

const disconnect = connectAudit(ff, {
  sinks: [createFileSink('./audit.jsonl'), createConsoleSink()],
  source: 'production',
  actor: 'deploy-pipeline',
});

// Later: clean up
disconnect();
```

## Built-in Sinks

### File Sink

Appends JSONL (one JSON object per line) to a file. Buffered with 100ms flush interval.

```typescript
import { createFileSink } from 'tinyflag';
const sink = createFileSink('./audit.jsonl');
```

### Webhook Sink

POSTs each audit event to an HTTP endpoint. Best-effort delivery with 5s timeout.

```typescript
import { createWebhookSink } from 'tinyflag';
const sink = createWebhookSink('https://hooks.example.com/audit', {
  Authorization: 'Bearer <token>',
});
```

### Console Sink

Logs audit events to stdout with emoji icons. Useful for development.

```typescript
import { createConsoleSink } from 'tinyflag';
const sink = createConsoleSink();
// Output: 🆕 [audit] created "new-feature" at 2026-04-23T10:00:00.000Z
```

### OpenTelemetry Sink

Emits audit events as OTel log records if `globalThis.__OTEL_LOGGER__` is available.

```typescript
import { createOtelSink } from 'tinyflag';
const sink = createOtelSink();
```

## Custom Sinks

Implement the `AuditSink` interface:

```typescript
import type { AuditSink, AuditEvent } from 'tinyflag';

const mySink: AuditSink = {
  name: 'my-sink',
  write(event: AuditEvent) {
    // Send to your logging system
    myLogger.info('flag_change', event);
  },
  close() {
    // Optional cleanup
  },
};
```

## Audit Event Shape

```typescript
interface AuditEvent {
  flag: string;
  action: 'created' | 'updated' | 'deleted';
  before: FlagDefinition | undefined;
  after: FlagDefinition | undefined;
  source: string;
  timestamp: number;
  actor?: string;
}
```
