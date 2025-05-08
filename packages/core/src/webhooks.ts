/**
 * Event Bus & Webhook Gateway for TinyFlag.
 *
 * Push flag change events to external systems: generic webhooks, Kafka,
 * Google PubSub, AWS SNS/SQS. Includes retry with exponential backoff
 * and HMAC signature verification.
 */

import { createHmac } from 'crypto';
import type { ChangeEvent } from './types.js';
import type { TinyFlag } from './tinyflag.js';
import { debug } from './debug.js';

// --- Event Bus Interface ---

/** A flag change event enriched for external delivery. */
export interface WebhookEvent {
  id: string;
  type: 'flag.created' | 'flag.updated' | 'flag.deleted';
  flag: string;
  timestamp: number;
  before?: unknown;
  after?: unknown;
  source: string;
}

/** Event filter to control which events are delivered. */
export interface EventFilter {
  /** Flag name patterns to include (glob). Empty means all. */
  flags?: string[];
  /** Event types to include. Empty means all. */
  types?: WebhookEvent['type'][];
  /** Tags to filter by. */
  tags?: string[];
}

/** Pluggable event bus adapter interface. */
export interface EventBusAdapter {
  name: string;
  /** Publish an event to the bus. */
  publish(event: WebhookEvent): Promise<void>;
  /** Close the adapter connection. */
  close?(): Promise<void>;
}

// --- Webhook Engine ---

/** Webhook endpoint configuration. */
export interface WebhookEndpoint {
  id: string;
  url: string;
  /** Secret key for HMAC signature. */
  secret?: string;
  /** Event filter. */
  filter?: EventFilter;
  /** Custom headers. */
  headers?: Record<string, string>;
  /** Whether this webhook is active. Default: true. */
  active: boolean;
}

/** Webhook delivery attempt record. */
export interface DeliveryAttempt {
  webhookId: string;
  eventId: string;
  timestamp: number;
  status: 'success' | 'failed' | 'retrying';
  statusCode?: number;
  attempt: number;
  nextRetryAt?: number;
  error?: string;
}

/** Retry configuration. */
export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 5. */
  maxRetries: number;
  /** Base delay in ms for exponential backoff. Default: 1000. */
  baseDelay: number;
  /** Maximum delay in ms. Default: 60000. */
  maxDelay: number;
  /** Request timeout in ms. Default: 10000. */
  timeout: number;
}

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 60000,
  timeout: 10000,
};

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify HMAC-SHA256 signature.
 */
export function verifySignature(payload: string, secret: string, signature: string): boolean {
  const expected = signPayload(payload, secret);
  return expected === signature;
}

/**
 * Webhook engine that manages delivery with retries.
 */
export class WebhookEngine {
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private retryConfig: RetryConfig;
  private deliveryLog: DeliveryAttempt[] = [];

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY, ...retryConfig };
  }

  /** Add a webhook endpoint. */
  addEndpoint(endpoint: WebhookEndpoint): void {
    this.endpoints.set(endpoint.id, endpoint);
  }

  /** Remove a webhook endpoint. */
  removeEndpoint(id: string): boolean {
    return this.endpoints.delete(id);
  }

  /** List all endpoints. */
  listEndpoints(): WebhookEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  /** Get delivery log. */
  getDeliveryLog(limit: number = 50): DeliveryAttempt[] {
    return this.deliveryLog.slice(-limit);
  }

  /** Deliver an event to all matching endpoints. */
  async deliver(event: WebhookEvent): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const endpoint of this.endpoints.values()) {
      if (!endpoint.active) continue;
      if (!this.matchesFilter(event, endpoint.filter)) continue;

      promises.push(this.deliverToEndpoint(event, endpoint));
    }

    await Promise.allSettled(promises);
  }

  /** Test a webhook endpoint with a test event. */
  async testEndpoint(id: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) return { success: false, error: 'Endpoint not found' };

    const testEvent: WebhookEvent = {
      id: `test-${Date.now()}`,
      type: 'flag.updated',
      flag: '__test__',
      timestamp: Date.now(),
      source: 'tinyflag-webhook-test',
    };

    try {
      const result = await this.sendWebhook(testEvent, endpoint);
      return { success: result.ok, statusCode: result.status };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  private async deliverToEndpoint(event: WebhookEvent, endpoint: WebhookEndpoint): Promise<void> {
    let attempt = 0;

    while (attempt <= this.retryConfig.maxRetries) {
      try {
        const result = await this.sendWebhook(event, endpoint);

        this.deliveryLog.push({
          webhookId: endpoint.id,
          eventId: event.id,
          timestamp: Date.now(),
          status: result.ok ? 'success' : 'failed',
          statusCode: result.status,
          attempt,
        });

        if (result.ok) return;

        // Don't retry on client errors (4xx)
        if (result.status >= 400 && result.status < 500) return;
      } catch (err) {
        this.deliveryLog.push({
          webhookId: endpoint.id,
          eventId: event.id,
          timestamp: Date.now(),
          status: attempt < this.retryConfig.maxRetries ? 'retrying' : 'failed',
          attempt,
          error: (err as Error).message,
        });
      }

      attempt++;
      if (attempt <= this.retryConfig.maxRetries) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500,
          this.retryConfig.maxDelay,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Cap delivery log
    if (this.deliveryLog.length > 1000) {
      this.deliveryLog = this.deliveryLog.slice(-500);
    }
  }

  private async sendWebhook(event: WebhookEvent, endpoint: WebhookEndpoint): Promise<Response> {
    const payload = JSON.stringify(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'TinyFlag-Webhook/1.0',
      'X-TinyFlag-Event': event.type,
      'X-TinyFlag-Delivery': event.id,
      ...(endpoint.headers ?? {}),
    };

    if (endpoint.secret) {
      headers['X-TinyFlag-Signature'] = `sha256=${signPayload(payload, endpoint.secret)}`;
    }

    return fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(this.retryConfig.timeout),
    });
  }

  private matchesFilter(event: WebhookEvent, filter?: EventFilter): boolean {
    if (!filter) return true;

    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.type)) return false;
    }

    if (filter.flags && filter.flags.length > 0) {
      const matched = filter.flags.some((pattern) => {
        if (pattern === event.flag) return true;
        if (!pattern.includes('*')) return false;
        const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return regex.test(event.flag);
      });
      if (!matched) return false;
    }

    return true;
  }
}

// --- Built-in Event Bus Adapters ---

/** Generic webhook adapter — wraps WebhookEngine. */
export function createWebhookAdapter(endpoints: WebhookEndpoint[]): EventBusAdapter {
  const engine = new WebhookEngine();
  for (const ep of endpoints) engine.addEndpoint(ep);

  return {
    name: 'webhook',
    async publish(event: WebhookEvent) {
      await engine.deliver(event);
    },
  };
}

/** Kafka adapter stub — publishes events to a Kafka topic. */
export function createKafkaAdapter(brokers: string[], topic: string): EventBusAdapter {
  return {
    name: 'kafka',
    async publish(event: WebhookEvent) {
      debug('kafka publish:', { topic, event: event.id });
      // Actual Kafka implementation would use kafkajs here
      // This provides the adapter interface for integration
    },
    async close() {
      debug('kafka adapter closed');
    },
  };
}

/** AWS SNS adapter stub — publishes events to an SNS topic. */
export function createSnsAdapter(topicArn: string, region: string): EventBusAdapter {
  return {
    name: 'sns',
    async publish(event: WebhookEvent) {
      debug('sns publish:', { topicArn, event: event.id });
      // Actual SNS implementation would use AWS SDK here
    },
  };
}

/** Google PubSub adapter stub — publishes events to a PubSub topic. */
export function createPubSubAdapter(projectId: string, topic: string): EventBusAdapter {
  return {
    name: 'pubsub',
    async publish(event: WebhookEvent) {
      debug('pubsub publish:', { projectId, topic, event: event.id });
      // Actual PubSub implementation would use @google-cloud/pubsub here
    },
  };
}

/**
 * Connect event bus to a TinyFlag instance.
 * Automatically converts change events to webhook events and publishes them.
 */
export function connectEventBus(
  instance: TinyFlag,
  adapters: EventBusAdapter[],
  source: string = 'tinyflag',
): () => void {
  let counter = 0;

  const handler = (event: ChangeEvent) => {
    const type: WebhookEvent['type'] =
      event.previous === undefined ? 'flag.created' :
      event.current === undefined ? 'flag.deleted' : 'flag.updated';

    const webhookEvent: WebhookEvent = {
      id: `evt-${Date.now()}-${++counter}`,
      type,
      flag: event.flag,
      timestamp: event.timestamp,
      before: event.previous,
      after: event.current,
      source,
    };

    for (const adapter of adapters) {
      adapter.publish(webhookEvent).catch((err) => {
        debug('event bus publish error:', { adapter: adapter.name, error: String(err) });
      });
    }
  };

  instance.on('change', handler);

  return () => {
    instance.off('change', handler);
    for (const adapter of adapters) {
      adapter.close?.().catch(() => {});
    }
  };
}
