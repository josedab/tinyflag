import { describe, it, expect, vi, beforeEach } from 'vitest';
import { instrumentTinyFlag, createFlagSpan } from '../index.js';
import type { OtelApi, OtelSpan, OtelTracer, InstrumentableTinyFlag } from '../index.js';
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
    off: vi.fn((event: string, handler: Function) => {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter((h) => h !== handler);
      }
    }) as any,
  };
  return { tf, handlers };
}

function emitExposure(handlers: Record<string, Function[]>, event: ExposureEvent) {
  for (const handler of handlers['exposure'] || []) {
    handler(event);
  }
}

describe('tinyflag-otel', () => {
  describe('instrumentTinyFlag', () => {
    it('creates spans on exposure events', () => {
      const { otelApi, mockTracer, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      const instrumentation = instrumentTinyFlag(tf, { otelApi });
      expect(tf.on).toHaveBeenCalledWith('exposure', expect.any(Function));

      emitExposure(handlers, {
        flag: 'dark-mode',
        enabled: true,
        variant: null,
        userId: 'user-123',
        timestamp: Date.now(),
      });

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

      emitExposure(handlers, {
        flag: 'untracked-flag',
        enabled: true,
        variant: null,
        userId: 'u1',
        timestamp: Date.now(),
      });

      expect(mockTracer.startSpan).not.toHaveBeenCalled();

      emitExposure(handlers, {
        flag: 'tracked-feature',
        enabled: true,
        variant: 'a',
        userId: 'u1',
        timestamp: Date.now(),
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith('tinyflag.evaluate.tracked-feature');
    });

    it('includes variant attribute when present', () => {
      const { otelApi, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      emitExposure(handlers, {
        flag: 'ab-test',
        enabled: true,
        variant: 'treatment',
        userId: 'u1',
        timestamp: Date.now(),
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.variant', 'treatment');
    });

    it('omits variant attribute when null', () => {
      const { otelApi, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      emitExposure(handlers, {
        flag: 'simple-flag',
        enabled: true,
        variant: null,
        userId: 'u1',
        timestamp: Date.now(),
      });

      const variantCalls = mockSpan.setAttribute.mock.calls.filter(
        (c: unknown[]) => c[0] === 'feature_flag.variant',
      );
      expect(variantCalls).toHaveLength(0);
    });

    it('sets provider_name attribute to tinyflag', () => {
      const { otelApi, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      emitExposure(handlers, {
        flag: 'test-flag',
        enabled: false,
        variant: null,
        userId: 'u1',
        timestamp: Date.now(),
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.provider_name', 'tinyflag');
    });

    it('sets enabled attribute to false for disabled flags', () => {
      const { otelApi, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      emitExposure(handlers, {
        flag: 'disabled-flag',
        enabled: false,
        variant: null,
        userId: 'u1',
        timestamp: Date.now(),
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.enabled', false);
    });

    it('sets OK status on spans', () => {
      const { otelApi, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      emitExposure(handlers, {
        flag: 'ok-flag',
        enabled: true,
        variant: null,
        userId: 'u1',
        timestamp: Date.now(),
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
    });

    it('calls end() on every span', () => {
      const { otelApi, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      emitExposure(handlers, { flag: 'f1', enabled: true, variant: null, userId: 'u1', timestamp: Date.now() });
      emitExposure(handlers, { flag: 'f2', enabled: false, variant: null, userId: 'u2', timestamp: Date.now() });

      expect(mockSpan.end).toHaveBeenCalledTimes(2);
    });

    it('uses custom tracer name', () => {
      const { otelApi } = createMockOtel();
      const { tf } = createMockTf();

      instrumentTinyFlag(tf, { otelApi, tracerName: 'my-tracer' });

      expect(otelApi.trace.getTracer).toHaveBeenCalledWith('my-tracer', expect.any(String));
    });

    it('uses custom tracer version', () => {
      const { otelApi } = createMockOtel();
      const { tf } = createMockTf();

      instrumentTinyFlag(tf, { otelApi, tracerVersion: '2.0.0' });

      expect(otelApi.trace.getTracer).toHaveBeenCalledWith('tinyflag', '2.0.0');
    });

    it('uses custom span name prefix', () => {
      const { otelApi, mockTracer } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi, spanNamePrefix: 'custom.prefix' });

      emitExposure(handlers, { flag: 'my-flag', enabled: true, variant: null, userId: 'u1', timestamp: Date.now() });

      expect(mockTracer.startSpan).toHaveBeenCalledWith('custom.prefix.my-flag');
    });

    it('handles multiple exposure events in sequence', () => {
      const { otelApi, mockTracer, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      const flags = ['flag-a', 'flag-b', 'flag-c'];
      for (const flag of flags) {
        emitExposure(handlers, { flag, enabled: true, variant: null, userId: 'u1', timestamp: Date.now() });
      }

      expect(mockTracer.startSpan).toHaveBeenCalledTimes(3);
      expect(mockSpan.end).toHaveBeenCalledTimes(3);
    });

    it('dispose removes the exposure handler', () => {
      const { otelApi, mockTracer } = createMockOtel();
      const { tf, handlers } = createMockTf();

      const instrumentation = instrumentTinyFlag(tf, { otelApi });

      // Emit before dispose
      emitExposure(handlers, { flag: 'f1', enabled: true, variant: null, userId: 'u1', timestamp: Date.now() });
      expect(mockTracer.startSpan).toHaveBeenCalledTimes(1);

      instrumentation.dispose();

      // After dispose, handler should be removed
      emitExposure(handlers, { flag: 'f2', enabled: true, variant: null, userId: 'u1', timestamp: Date.now() });
      expect(mockTracer.startSpan).toHaveBeenCalledTimes(1); // No new calls
    });

    it('filter that returns false for all flags creates no spans', () => {
      const { otelApi, mockTracer } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi, filter: () => false });

      emitExposure(handlers, { flag: 'any-flag', enabled: true, variant: null, userId: 'u1', timestamp: Date.now() });

      expect(mockTracer.startSpan).not.toHaveBeenCalled();
    });

    it('filter that returns true for all flags creates spans for all', () => {
      const { otelApi, mockTracer } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi, filter: () => true });

      emitExposure(handlers, { flag: 'a', enabled: true, variant: null, userId: 'u1', timestamp: Date.now() });
      emitExposure(handlers, { flag: 'b', enabled: false, variant: null, userId: 'u2', timestamp: Date.now() });

      expect(mockTracer.startSpan).toHaveBeenCalledTimes(2);
    });

    it('includes userId attribute when present', () => {
      const { otelApi, mockSpan } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      emitExposure(handlers, {
        flag: 'test',
        enabled: true,
        variant: null,
        userId: 'specific-user-42',
        timestamp: Date.now(),
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.user_id', 'specific-user-42');
    });

    it('uses default options when none specified', () => {
      const { otelApi, mockTracer } = createMockOtel();
      const { tf, handlers } = createMockTf();

      instrumentTinyFlag(tf, { otelApi });

      expect(otelApi.trace.getTracer).toHaveBeenCalledWith('tinyflag', '0.1.0');

      emitExposure(handlers, { flag: 'def', enabled: true, variant: null, userId: 'u', timestamp: Date.now() });
      expect(mockTracer.startSpan).toHaveBeenCalledWith('tinyflag.evaluate.def');
    });
  });

  describe('createFlagSpan', () => {
    it('creates a standalone span', () => {
      const { otelApi, mockTracer, mockSpan } = createMockOtel();

      createFlagSpan(otelApi, 'my-flag', true, 'variant-a', 'user-1');

      expect(mockTracer.startSpan).toHaveBeenCalledWith('tinyflag.evaluate.my-flag');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.key', 'my-flag');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.provider_name', 'tinyflag');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.enabled', true);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.variant', 'variant-a');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.user_id', 'user-1');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('creates span without variant', () => {
      const { otelApi, mockSpan } = createMockOtel();

      createFlagSpan(otelApi, 'no-variant', false);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.key', 'no-variant');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('feature_flag.enabled', false);

      const variantCalls = mockSpan.setAttribute.mock.calls.filter(
        (c: unknown[]) => c[0] === 'feature_flag.variant',
      );
      expect(variantCalls).toHaveLength(0);
    });

    it('creates span without userId', () => {
      const { otelApi, mockSpan } = createMockOtel();

      createFlagSpan(otelApi, 'no-user', true, null);

      const userCalls = mockSpan.setAttribute.mock.calls.filter(
        (c: unknown[]) => c[0] === 'feature_flag.user_id',
      );
      expect(userCalls).toHaveLength(0);
    });

    it('creates span with null variant (no attribute set)', () => {
      const { otelApi, mockSpan } = createMockOtel();

      createFlagSpan(otelApi, 'null-variant', true, null, 'u1');

      const variantCalls = mockSpan.setAttribute.mock.calls.filter(
        (c: unknown[]) => c[0] === 'feature_flag.variant',
      );
      expect(variantCalls).toHaveLength(0);
    });

    it('uses tinyflag tracer with version 0.1.0', () => {
      const { otelApi } = createMockOtel();

      createFlagSpan(otelApi, 'test', true);

      expect(otelApi.trace.getTracer).toHaveBeenCalledWith('tinyflag', '0.1.0');
    });

    it('sets OK status code', () => {
      const { otelApi, mockSpan } = createMockOtel();

      createFlagSpan(otelApi, 'status-test', true);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
    });
  });
});
