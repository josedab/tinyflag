import { describe, it, expect, vi } from 'vitest';
import type { TinyFlag, ChangeEvent, FlagDefinition } from '../types.js';
import { connectAudit, createConsoleSink, createFileSink } from '../audit.js';
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

  it('console sink logs without error', () => {
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
});
