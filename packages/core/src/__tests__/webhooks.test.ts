import { describe, it, expect, vi } from 'vitest';
import {
  signPayload,
  verifySignature,
  WebhookEngine,
  createWebhookAdapter,
  createKafkaAdapter,
  createSnsAdapter,
  createPubSubAdapter,
  type WebhookEndpoint,
  type WebhookEvent,
  type EventBusAdapter,
  type EventFilter,
} from '../webhooks.js';

function makeEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: 'evt-1',
    type: 'flag.updated',
    flag: 'my-flag',
    timestamp: Date.now(),
    source: 'test',
    ...overrides,
  };
}

function makeEndpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    id: 'ep-1',
    url: 'https://example.com/webhook',
    active: true,
    ...overrides,
  };
}

describe('signPayload', () => {
  it('generates HMAC-SHA256 signature', () => {
    const sig = signPayload('{"test":true}', 'secret');
    expect(sig).toBeTruthy();
    expect(sig).toHaveLength(64); // hex-encoded SHA256
  });

  it('generates different signatures for different payloads', () => {
    const sig1 = signPayload('payload1', 'secret');
    const sig2 = signPayload('payload2', 'secret');
    expect(sig1).not.toBe(sig2);
  });

  it('generates different signatures for different secrets', () => {
    const sig1 = signPayload('payload', 'secret1');
    const sig2 = signPayload('payload', 'secret2');
    expect(sig1).not.toBe(sig2);
  });
});

describe('verifySignature', () => {
  it('returns true for valid signature', () => {
    const payload = '{"flag":"test"}';
    const secret = 'my-secret';
    const sig = signPayload(payload, secret);
    expect(verifySignature(payload, secret, sig)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(verifySignature('payload', 'secret', 'invalid-sig')).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const payload = 'test';
    const sig = signPayload(payload, 'correct-secret');
    expect(verifySignature(payload, 'wrong-secret', sig)).toBe(false);
  });
});

describe('WebhookEngine', () => {
  it('registers an endpoint', () => {
    const engine = new WebhookEngine();
    engine.addEndpoint(makeEndpoint());
    expect(engine.listEndpoints()).toHaveLength(1);
  });

  it('removes an endpoint', () => {
    const engine = new WebhookEngine();
    engine.addEndpoint(makeEndpoint({ id: 'ep-1' }));
    expect(engine.removeEndpoint('ep-1')).toBe(true);
    expect(engine.listEndpoints()).toHaveLength(0);
  });

  it('removes returns false for non-existent endpoint', () => {
    const engine = new WebhookEngine();
    expect(engine.removeEndpoint('nope')).toBe(false);
  });

  it('delivers event to active matching endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const engine = new WebhookEngine({ maxRetries: 0, baseDelay: 0 });
    engine.addEndpoint(makeEndpoint());

    await engine.deliver(makeEvent());
    expect(fetchSpy).toHaveBeenCalled();
    const log = engine.getDeliveryLog();
    expect(log.some((d) => d.status === 'success')).toBe(true);
    fetchSpy.mockRestore();
  });

  it('skips inactive endpoints', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const engine = new WebhookEngine({ maxRetries: 0 });
    engine.addEndpoint(makeEndpoint({ active: false }));

    await engine.deliver(makeEvent());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('filters events by type', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const engine = new WebhookEngine({ maxRetries: 0 });
    engine.addEndpoint(
      makeEndpoint({ filter: { types: ['flag.created'] } }),
    );

    await engine.deliver(makeEvent({ type: 'flag.updated' }));
    expect(fetchSpy).not.toHaveBeenCalled();

    await engine.deliver(makeEvent({ type: 'flag.created' }));
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('filters events by flag pattern', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const engine = new WebhookEngine({ maxRetries: 0 });
    engine.addEndpoint(
      makeEndpoint({ filter: { flags: ['prod-*'] } }),
    );

    await engine.deliver(makeEvent({ flag: 'dev-flag' }));
    expect(fetchSpy).not.toHaveBeenCalled();

    await engine.deliver(makeEvent({ flag: 'prod-feature' }));
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('empty filter matches all events', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const engine = new WebhookEngine({ maxRetries: 0 });
    engine.addEndpoint(makeEndpoint({ filter: {} }));

    await engine.deliver(makeEvent());
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('retries on server error', async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) return new Response('error', { status: 500 });
      return new Response('ok', { status: 200 });
    });

    const engine = new WebhookEngine({ maxRetries: 3, baseDelay: 1, maxDelay: 10, timeout: 5000 });
    engine.addEndpoint(makeEndpoint());
    await engine.deliver(makeEvent());

    expect(callCount).toBe(3); // 2 failures + 1 success
    const log = engine.getDeliveryLog();
    expect(log.some((d) => d.status === 'success')).toBe(true);
    fetchSpy.mockRestore();
  });

  it('does not retry on 4xx client errors', async () => {
    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      return new Response('bad request', { status: 400 });
    });

    const engine = new WebhookEngine({ maxRetries: 3, baseDelay: 1, maxDelay: 10, timeout: 5000 });
    engine.addEndpoint(makeEndpoint());
    await engine.deliver(makeEvent());

    expect(callCount).toBe(1);
    fetchSpy.mockRestore();
  });

  it('handles all endpoints failing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const engine = new WebhookEngine({ maxRetries: 0, baseDelay: 1, timeout: 5000 });
    engine.addEndpoint(makeEndpoint({ id: 'ep-1' }));
    engine.addEndpoint(makeEndpoint({ id: 'ep-2', url: 'https://other.com/hook' }));

    // Should not throw
    await engine.deliver(makeEvent());

    const log = engine.getDeliveryLog();
    expect(log.every((d) => d.status === 'failed')).toBe(true);
    vi.restoreAllMocks();
  });

  it('testEndpoint returns error for unknown endpoint', async () => {
    const engine = new WebhookEngine();
    const result = await engine.testEndpoint('nonexistent');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('testEndpoint succeeds for valid endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const engine = new WebhookEngine();
    engine.addEndpoint(makeEndpoint({ id: 'ep-test' }));

    const result = await engine.testEndpoint('ep-test');
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    fetchSpy.mockRestore();
  });

  it('includes HMAC signature when secret is set', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedHeaders = (init as any).headers;
      return new Response('ok', { status: 200 });
    });

    const engine = new WebhookEngine({ maxRetries: 0 });
    engine.addEndpoint(makeEndpoint({ secret: 'my-secret' }));
    await engine.deliver(makeEvent());

    expect(capturedHeaders['X-TinyFlag-Signature']).toBeDefined();
    expect(capturedHeaders['X-TinyFlag-Signature']).toMatch(/^sha256=/);
    vi.restoreAllMocks();
  });
});

describe('Event Bus Adapters', () => {
  it('createKafkaAdapter publishes and closes', async () => {
    const adapter = createKafkaAdapter(['localhost:9092'], 'test-topic');
    expect(adapter.name).toBe('kafka');
    await adapter.publish(makeEvent());
    await adapter.close?.();
  });

  it('createSnsAdapter publishes', async () => {
    const adapter = createSnsAdapter('arn:aws:sns:us-east-1:123:test', 'us-east-1');
    expect(adapter.name).toBe('sns');
    await adapter.publish(makeEvent());
  });

  it('createPubSubAdapter publishes', async () => {
    const adapter = createPubSubAdapter('my-project', 'test-topic');
    expect(adapter.name).toBe('pubsub');
    await adapter.publish(makeEvent());
  });

  it('createWebhookAdapter wraps WebhookEngine', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));
    const adapter = createWebhookAdapter([makeEndpoint()]);
    expect(adapter.name).toBe('webhook');
    await adapter.publish(makeEvent());
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
