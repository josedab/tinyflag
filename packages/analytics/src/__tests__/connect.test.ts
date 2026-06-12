import { describe, it, expect, vi } from 'vitest';
import { connectAnalytics } from '../index.js';
import type { TinyFlagAnalyticsAdapter } from '../index.js';
import type { TinyFlag, ExposureEvent } from 'tinyflag';

function createMockInstance(): TinyFlag & { _listeners: Map<string, Function[]> } {
  const listeners = new Map<string, Function[]>();
  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    off: vi.fn((event: string, handler: Function) => {
      const handlers = listeners.get(event);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    }),
    _listeners: listeners,
  } as unknown as TinyFlag & { _listeners: Map<string, Function[]> };
}

function emitExposure(instance: ReturnType<typeof createMockInstance>, event: ExposureEvent): void {
  const handlers = instance._listeners.get('exposure') || [];
  for (const h of handlers) h(event);
}

const mockEvent: ExposureEvent = {
  flag: 'test-flag',
  variant: 'control',
  enabled: true,
  userId: 'user-123',
  timestamp: Date.now(),
};

describe('connectAnalytics', () => {
  it('registers an exposure listener on the TinyFlag instance', () => {
    const instance = createMockInstance();
    const adapter: TinyFlagAnalyticsAdapter = { trackExposure: vi.fn() };
    connectAnalytics(instance, adapter);
    expect(instance.on).toHaveBeenCalledWith('exposure', expect.any(Function));
  });

  it('exposure event triggers adapter trackExposure with correct payload', () => {
    const instance = createMockInstance();
    const adapter: TinyFlagAnalyticsAdapter = { trackExposure: vi.fn() };
    connectAnalytics(instance, adapter);

    emitExposure(instance, mockEvent);

    expect(adapter.trackExposure).toHaveBeenCalledTimes(1);
    expect(adapter.trackExposure).toHaveBeenCalledWith(mockEvent);
  });

  it('multiple adapters all receive exposure events', () => {
    const instance = createMockInstance();
    const adapter1: TinyFlagAnalyticsAdapter = { trackExposure: vi.fn() };
    const adapter2: TinyFlagAnalyticsAdapter = { trackExposure: vi.fn() };
    connectAnalytics(instance, adapter1);
    connectAnalytics(instance, adapter2);

    emitExposure(instance, mockEvent);

    expect(adapter1.trackExposure).toHaveBeenCalledWith(mockEvent);
    expect(adapter2.trackExposure).toHaveBeenCalledWith(mockEvent);
  });

  it('adapter throwing in trackExposure is silently caught', () => {
    const instance = createMockInstance();
    const adapter: TinyFlagAnalyticsAdapter = {
      trackExposure: vi.fn(() => { throw new Error('adapter crash'); }),
    };
    connectAnalytics(instance, adapter);

    // Should not throw
    expect(() => emitExposure(instance, mockEvent)).not.toThrow();
    expect(adapter.trackExposure).toHaveBeenCalled();
  });

  it('exposure payload includes flag name, variant, userId, timestamp', () => {
    const instance = createMockInstance();
    const adapter: TinyFlagAnalyticsAdapter = { trackExposure: vi.fn() };
    connectAnalytics(instance, adapter);

    const event: ExposureEvent = {
      flag: 'checkout-v2',
      variant: 'treatment',
      enabled: true,
      userId: 'u-42',
      timestamp: 1700000000000,
    };
    emitExposure(instance, event);

    const captured = (adapter.trackExposure as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(captured.flag).toBe('checkout-v2');
    expect(captured.variant).toBe('treatment');
    expect(captured.userId).toBe('u-42');
    expect(captured.timestamp).toBe(1700000000000);
  });
});
