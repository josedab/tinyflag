import { describe, it, expect, vi } from 'vitest';
import type { TinyFlag, ChangeEvent, FlagDefinition } from '../types.js';
import {
  connectAudit,
  createConsoleSink,
  createFileSink,
  createWebhookSink,
  createOtelSink,
} from '../audit.js';
import type { AuditEvent, AuditSink } from '../audit.js';

function createMockInstance() {
  const handlers: Record<string, Function[]> = {};
  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    off: vi.fn((event: string, handler: Function) => {
      handlers[event] = (handlers[event] || []).filter((h) => h !== handler);
    }),
    _emit(event: string, data: unknown) {
      for (const h of handlers[event] || []) h(data);
    },
  } as unknown as TinyFlag & { _emit: (e: string, d: unknown) => void };
}

function makeAuditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    flag: 'test-flag',
    action: 'updated',
    before: { enabled: true } as FlagDefinition,
    after: { enabled: false } as FlagDefinition,
    source: 'test',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('audit', () => {
  it('emits audit events to sinks on change', () => {
    const instance = createMockInstance();
    const events: AuditEvent[] = [];
    const sink: AuditSink = { name: 'test', write: (e) => events.push(e) };

    connectAudit(instance, { sinks: [sink], source: 'test-source', actor: 'test-actor' });

    const change: ChangeEvent = {
      flag: 'my-flag',
      previous: undefined,
      current: { enabled: true } as FlagDefinition,
      timestamp: 1000,
    };
    instance._emit('change', change);

    expect(events).toHaveLength(1);
    expect(events[0].flag).toBe('my-flag');
    expect(events[0].action).toBe('created');
    expect(events[0].source).toBe('test-source');
    expect(events[0].actor).toBe('test-actor');
  });

  it('detects updated and deleted actions', () => {
    const instance = createMockInstance();
    const events: AuditEvent[] = [];
    const sink: AuditSink = { name: 'test', write: (e) => events.push(e) };

    connectAudit(instance, { sinks: [sink] });

    instance._emit('change', {
      flag: 'a',
      previous: { enabled: true },
      current: { enabled: false },
      timestamp: 1,
    });
    instance._emit('change', {
      flag: 'b',
      previous: { enabled: true },
      current: undefined,
      timestamp: 2,
    });

    expect(events[0].action).toBe('updated');
    expect(events[1].action).toBe('deleted');
  });

  it('disconnect stops listening', () => {
    const instance = createMockInstance();
    const events: AuditEvent[] = [];
    const closeSpy = vi.fn();
    const sink: AuditSink = { name: 'test', write: (e) => events.push(e), close: closeSpy };

    const disconnect = connectAudit(instance, { sinks: [sink] });
    disconnect();

    instance._emit('change', { flag: 'x', previous: undefined, current: undefined, timestamp: 0 });
    expect(events).toHaveLength(0);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('sink errors do not propagate', () => {
    const instance = createMockInstance();
    const badSink: AuditSink = {
      name: 'bad',
      write() { throw new Error('sink error'); },
    };

    connectAudit(instance, { sinks: [badSink] });
    // Should not throw
    instance._emit('change', { flag: 'x', previous: undefined, current: undefined, timestamp: 0 });
  });

  it('multiple sinks receive same event', () => {
    const instance = createMockInstance();
    const events1: AuditEvent[] = [];
    const events2: AuditEvent[] = [];
    const sink1: AuditSink = { name: 's1', write: (e) => events1.push(e) };
    const sink2: AuditSink = { name: 's2', write: (e) => events2.push(e) };

    connectAudit(instance, { sinks: [sink1, sink2] });

    instance._emit('change', {
      flag: 'f',
      previous: undefined,
      current: { enabled: true },
      timestamp: 1,
    });

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
    expect(events1[0].flag).toBe('f');
    expect(events2[0].flag).toBe('f');
  });

  it('one sink failing does not prevent others from receiving events', () => {
    const instance = createMockInstance();
    const events: AuditEvent[] = [];
    const badSink: AuditSink = {
      name: 'bad',
      write() { throw new Error('boom'); },
    };
    const goodSink: AuditSink = { name: 'good', write: (e) => events.push(e) };

    connectAudit(instance, { sinks: [badSink, goodSink] });

    instance._emit('change', {
      flag: 'f',
      previous: undefined,
      current: { enabled: true },
      timestamp: 1,
    });

    expect(events).toHaveLength(1);
  });

  it('uses default source when not specified', () => {
    const instance = createMockInstance();
    const events: AuditEvent[] = [];
    const sink: AuditSink = { name: 'test', write: (e) => events.push(e) };

    connectAudit(instance, { sinks: [sink] });
    instance._emit('change', {
      flag: 'f',
      previous: undefined,
      current: { enabled: true },
      timestamp: 1,
    });

    expect(events[0].source).toBe('tinyflag');
  });

  it('disconnect calls close on sinks with close method', () => {
    const instance = createMockInstance();
    const closeSpies = [vi.fn(), vi.fn()];
    const sinks: AuditSink[] = [
      { name: 's1', write: () => {}, close: closeSpies[0] },
      { name: 's2', write: () => {}, close: closeSpies[1] },
    ];

    const disconnect = connectAudit(instance, { sinks });
    disconnect();

    expect(closeSpies[0]).toHaveBeenCalled();
    expect(closeSpies[1]).toHaveBeenCalled();
  });

  it('disconnect handles close errors gracefully', () => {
    const instance = createMockInstance();
    const sink: AuditSink = {
      name: 'test',
      write: () => {},
      close: () => { throw new Error('close error'); },
    };

    const disconnect = connectAudit(instance, { sinks: [sink] });
    // Should not throw
    expect(() => disconnect()).not.toThrow();
  });

  describe('console sink', () => {
    it('logs without error', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const sink = createConsoleSink();
      sink.write({
        flag: 'test',
        action: 'created',
        before: undefined,
        after: { enabled: true } as FlagDefinition,
        source: 'test',
        timestamp: Date.now(),
      });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('uses different icons for different actions', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const sink = createConsoleSink();

      sink.write(makeAuditEvent({ action: 'created' }));
      expect(consoleSpy.mock.calls[0][0]).toContain('🆕');

      sink.write(makeAuditEvent({ action: 'deleted' }));
      expect(consoleSpy.mock.calls[1][0]).toContain('🗑️');

      sink.write(makeAuditEvent({ action: 'updated' }));
      expect(consoleSpy.mock.calls[2][0]).toContain('✏️');

      consoleSpy.mockRestore();
    });
  });

  describe('file sink', () => {
    it('buffers writes and flushes', async () => {
      vi.useFakeTimers();
      const sink = createFileSink('/tmp/audit.jsonl');
      sink.write(makeAuditEvent({ flag: 'f1' }));
      sink.write(makeAuditEvent({ flag: 'f2' }));

      // Flush happens after 100ms
      await vi.advanceTimersByTimeAsync(200);

      vi.useRealTimers();
    });

    it('close flushes pending events', () => {
      vi.useFakeTimers();
      const sink = createFileSink('/tmp/audit.jsonl');
      sink.write(makeAuditEvent());
      sink.close?.();
      vi.useRealTimers();
    });
  });

  describe('webhook sink', () => {
    it('POSTs audit event to endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const sink = createWebhookSink('https://example.com/audit');
      await sink.write(makeAuditEvent());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://example.com/audit');
      expect(call[1].method).toBe('POST');
      expect(call[1].headers['Content-Type']).toBe('application/json');

      vi.unstubAllGlobals();
    });

    it('handles fetch failure silently', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const sink = createWebhookSink('https://example.com/audit');
      // Should not throw
      await sink.write(makeAuditEvent());

      vi.unstubAllGlobals();
    });

    it('sends custom headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const sink = createWebhookSink('https://example.com/audit', {
        Authorization: 'Bearer token',
      });
      await sink.write(makeAuditEvent());

      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');

      vi.unstubAllGlobals();
    });
  });

  describe('otel sink', () => {
    it('emits to OTel logger when available', () => {
      const emitSpy = vi.fn();
      (globalThis as any).__OTEL_LOGGER__ = { emit: emitSpy };

      const sink = createOtelSink();
      sink.write(makeAuditEvent({ flag: 'my-flag', action: 'created' }));

      expect(emitSpy).toHaveBeenCalledTimes(1);
      expect(emitSpy.mock.calls[0][0].body).toContain('my-flag');
      expect(emitSpy.mock.calls[0][0].attributes['tinyflag.flag']).toBe('my-flag');

      delete (globalThis as any).__OTEL_LOGGER__;
    });

    it('does nothing when OTel logger not available', () => {
      delete (globalThis as any).__OTEL_LOGGER__;
      const sink = createOtelSink();
      // Should not throw
      expect(() => sink.write(makeAuditEvent())).not.toThrow();
    });

    it('handles OTel emit error gracefully', () => {
      (globalThis as any).__OTEL_LOGGER__ = {
        emit: () => { throw new Error('otel error'); },
      };
      const sink = createOtelSink();
      expect(() => sink.write(makeAuditEvent())).not.toThrow();
      delete (globalThis as any).__OTEL_LOGGER__;
    });
  });
});
