import { describe, it, expect, vi } from 'vitest';
import { instrumentTinyFlag, createFlagSpan } from '../index.js';
import type { OtelApi, InstrumentableTinyFlag } from '../index.js';
import type { ExposureEvent } from 'tinyflag';

function createMockOtel() {
  const mockSpan = {
    setAttribute: vi.fn().mockReturnThis(),
    setStatus: vi.fn().mockReturnThis(),
    end: vi.fn(),
  };
  const mockTracer = {
    startSpan: vi.fn().mockReturnValue(mockSpan),
  };
  const otelApi: OtelApi = {
    trace: {
      getTracer: vi.fn().mockReturnValue(mockTracer),
    },
    SpanStatusCode: { OK: 0, ERROR: 1 },
  };
  return { otelApi, mockTracer, mockSpan };
}

function createMockTf() {
  const handlers: Record<string, Function[]> = {};
  const tf: InstrumentableTinyFlag = {
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }) as any,
    off: vi.fn() as any,
  };
  return { tf, handlers };
}

describe('tinyflag-otel', () => {
  it('instrumentTinyFlag creates spans on exposure events', () => {
    const { otelApi, mockTracer, mockSpan } = createMockOtel();
    const { tf, handlers } = createMockTf();

    const instrumentation = instrumentTinyFlag(tf, { otelApi });
    expect(tf.on).toHaveBeenCalledWith('exposure', expect.any(Function));

    // Simulate an exposure event
    for (const handler of handlers['exposure'] || []) {
      handler({
        flag: 'dark-mode',
        enabled: true,
        variant: null,
        userId: 'user-123',
        timestamp: Date.now(),
      });
    }

    expect(mockTracer.startSpan).toHaveBeenCalledWith('tinyflag.evaluate.dark-mode');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.key', 'dark-mode');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.enabled', true);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.user_id', 'user-123');
    expect(mockSpan.end).toHaveBeenCalled();

    instrumentation.dispose();
    expect(tf.off).toHaveBeenCalledWith('exposure', expect.any(Function));
  });

  it('respects filter option', () => {
    const { otelApi, mockTracer } = createMockOtel();
    const { tf, handlers } = createMockTf();

    instrumentTinyFlag(tf, {
      otelApi,
      filter: (flag: string) => flag.startsWith('tracked-'),
    });

    for (const handler of handlers['exposure'] || []) {
      handler({
        flag: 'untracked-flag',
        enabled: true,
        variant: null,
        userId: 'u1',
        timestamp: Date.now(),
      });
    }

    expect(mockTracer.startSpan).not.toHaveBeenCalled();

    for (const handler of handlers['exposure'] || []) {
      handler({
        flag: 'tracked-feature',
        enabled: true,
        variant: 'a',
        userId: 'u1',
        timestamp: Date.now(),
      });
    }

    expect(mockTracer.startSpan).toHaveBeenCalledWith('tinyflag.evaluate.tracked-feature');
  });

  it('createFlagSpan creates a standalone span', () => {
    const { otelApi, mockTracer, mockSpan } = createMockOtel();

    createFlagSpan(otelApi, 'my-flag', true, 'variant-a', 'user-1');

    expect(mockTracer.startSpan).toHaveBeenCalledWith('tinyflag.evaluate.my-flag');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.variant', 'variant-a');
  });

  it('includes variant attribute when present', () => {
    const { otelApi, mockSpan } = createMockOtel();
    const { tf, handlers } = createMockTf();

    instrumentTinyFlag(tf, { otelApi });

    for (const handler of handlers['exposure'] || []) {
      handler({
        flag: 'ab-test',
        enabled: true,
        variant: 'treatment',
        userId: 'u1',
        timestamp: Date.now(),
      });
    }

    expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.variant', 'treatment');
  });
});
