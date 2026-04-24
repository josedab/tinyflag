---
sidebar_position: 12
title: Webhooks & Event Bus
description: Push flag change events to external systems with retries and HMAC signing.
---

# Webhooks & Event Bus

TinyFlag ships a webhook engine that pushes flag change events to external systems. It supports generic HTTP webhooks, Kafka, AWS SNS, and Google PubSub — with retry logic, HMAC signing, and event filtering.

## Webhook Engine

```typescript
import { WebhookEngine, connectEventBus } from 'tinyflag';

const engine = new WebhookEngine({
  maxRetries: 5,
  baseDelay: 1000, // Exponential backoff: 1s, 2s, 4s, 8s, 16s
  maxDelay: 60000,
  timeout: 10000,
});

// Register endpoints
engine.addEndpoint({
  id: 'slack-alerts',
  url: 'https://hooks.slack.com/services/xxx',
  active: true,
  filter: {
    types: ['flag.created', 'flag.deleted'], // Only creation/deletion events
  },
});

engine.addEndpoint({
  id: 'analytics',
  url: 'https://analytics.example.com/webhooks/flags',
  secret: 'whsec_your-secret-key', // Enables HMAC signing
  active: true,
  headers: { Authorization: 'Bearer <token>' },
});
```

## Connecting to TinyFlag

```typescript
import { TinyFlag, connectEventBus } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

// Automatically forward flag changes to the webhook engine
const disconnect = connectEventBus(ff, engine, {
  source: 'production-api',
});

// Later: clean up
disconnect();
```

## HMAC Signature Verification

When a webhook endpoint has a `secret`, each delivery includes an `X-TinyFlag-Signature` header:

```
X-TinyFlag-Signature: sha256=<hex-encoded-hmac>
```

Verify signatures on the receiving end:

```typescript
import { verifySignature } from 'tinyflag';

function handleWebhook(req) {
  const signature = req.headers['x-tinyflag-signature']?.replace('sha256=', '');
  const isValid = verifySignature(req.body, 'whsec_your-secret-key', signature);

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  // Process the event...
}
```

## Event Bus Adapters

### Kafka

```typescript
import { createKafkaAdapter } from 'tinyflag';

const kafka = createKafkaAdapter({
  brokers: ['localhost:9092'],
  topic: 'tinyflag-events',
  clientId: 'tinyflag-producer',
});

const disconnect = connectEventBus(ff, engine, { adapter: kafka });
```

### AWS SNS

```typescript
import { createSnsAdapter } from 'tinyflag';

const sns = createSnsAdapter({
  topicArn: 'arn:aws:sns:us-east-1:123456789:tinyflag-events',
  region: 'us-east-1',
});
```

### Google PubSub

```typescript
import { createPubSubAdapter } from 'tinyflag';

const pubsub = createPubSubAdapter({
  projectId: 'my-project',
  topicName: 'tinyflag-events',
});
```

### Custom Adapter

Implement the `EventBusAdapter` interface:

```typescript
import type { EventBusAdapter, WebhookEvent } from 'tinyflag';

const myAdapter: EventBusAdapter = {
  name: 'my-queue',
  async publish(event: WebhookEvent) {
    await myQueue.send(JSON.stringify(event));
  },
  async close() {
    await myQueue.disconnect();
  },
};
```

## Event Shape

```typescript
interface WebhookEvent {
  id: string; // Unique delivery ID
  type: 'flag.created' | 'flag.updated' | 'flag.deleted';
  flag: string; // Flag name
  timestamp: number; // Unix ms
  before?: unknown; // Previous definition
  after?: unknown; // Current definition
  source: string; // Source identifier
}
```

## Event Filtering

Control which events reach each endpoint:

```typescript
engine.addEndpoint({
  id: 'security-team',
  url: 'https://sec.example.com/hooks',
  active: true,
  filter: {
    flags: ['auth-*', 'security-*'], // Glob patterns
    types: ['flag.updated', 'flag.deleted'],
    tags: ['security'],
  },
});
```

## Testing Endpoints

```typescript
const result = await engine.testEndpoint('slack-alerts');
console.log(result.success); // true/false
console.log(result.statusCode); // HTTP status code
```

## Delivery Log

```typescript
const log = engine.getDeliveryLog(20); // Last 20 delivery attempts
for (const entry of log) {
  console.log(`${entry.webhookId}: ${entry.status} (attempt ${entry.attempt})`);
}
```
