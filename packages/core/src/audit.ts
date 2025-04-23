import type { ChangeEvent, FlagDefinition } from './types.js';
import type { TinyFlag } from './tinyflag.js';

/** Structured audit event for flag state changes. */
export interface AuditEvent {
  flag: string;
  action: 'created' | 'updated' | 'deleted';
  before: FlagDefinition | undefined;
  after: FlagDefinition | undefined;
  source: string;
  timestamp: number;
  actor?: string;
}

/** Pluggable sink interface for audit events. */
export interface AuditSink {
  name: string;
  write(event: AuditEvent): void | Promise<void>;
  close?(): void | Promise<void>;
}

/** Options for the audit system. */
export interface AuditOptions {
  sinks: AuditSink[];
  source?: string;
  actor?: string;
}

/**
 * Connect audit logging to a TinyFlag instance.
 * Emits structured audit events to all configured sinks.
 */
export function connectAudit(instance: TinyFlag, options: AuditOptions): () => void {
  const handler = (event: ChangeEvent) => {
    const action: AuditEvent['action'] =
      event.previous === undefined
        ? 'created'
        : event.current === undefined
          ? 'deleted'
          : 'updated';

    const auditEvent: AuditEvent = {
      flag: event.flag,
      action,
      before: event.previous,
      after: event.current,
      source: options.source ?? 'tinyflag',
      timestamp: event.timestamp,
      actor: options.actor,
    };

    for (const sink of options.sinks) {
      try {
        const result = sink.write(auditEvent);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(() => {
            // Async sink errors must not break flag evaluation
          });
        }
      } catch {
        // Sync sink errors must not break flag evaluation
      }
    }
  };

  instance.on('change', handler);

  return () => {
    instance.off('change', handler);
    for (const sink of options.sinks) {
      try {
        sink.close?.();
      } catch {}
    }
  };
}

// --- Built-in sinks ---

/** File sink: appends JSONL lines to a file. */
export function createFileSink(filePath: string): AuditSink {
  let buffer: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    if (buffer.length === 0) return;
    const lines = buffer.join('');
    buffer = [];
    try {
      const { appendFileSync } = await import('fs');
      appendFileSync(filePath, lines, 'utf-8');
    } catch {
      // Silently drop if file system not available
    }
  };

  return {
    name: 'file',
    write(event: AuditEvent) {
      buffer.push(JSON.stringify(event) + '\n');
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = undefined;
          flush();
        }, 100);
      }
    },
    close() {
      clearTimeout(flushTimer);
      flush();
    },
  };
}

/** Webhook sink: POSTs audit events to an HTTP endpoint. */
export function createWebhookSink(url: string, headers?: Record<string, string>): AuditSink {
  return {
    name: 'webhook',
    async write(event: AuditEvent) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Best-effort delivery
      }
    },
  };
}

/** Console sink: logs audit events to stdout (useful for development). */
export function createConsoleSink(): AuditSink {
  return {
    name: 'console',
    write(event: AuditEvent) {
      const icon = event.action === 'created' ? '🆕' : event.action === 'deleted' ? '🗑️' : '✏️';
      console.log(
        `${icon} [audit] ${event.action} "${event.flag}" at ${new Date(event.timestamp).toISOString()}`,
      );
    },
  };
}

/** OpenTelemetry sink: emits audit events as OTel log records if API available. */
export function createOtelSink(): AuditSink {
  return {
    name: 'otel',
    write(event: AuditEvent) {
      try {
        const otel = (globalThis as any).__OTEL_LOGGER__;
        if (otel?.emit) {
          otel.emit({
            severityText: 'INFO',
            body: `Flag ${event.action}: ${event.flag}`,
            attributes: {
              'tinyflag.flag': event.flag,
              'tinyflag.action': event.action,
              'tinyflag.source': event.source,
              'tinyflag.actor': event.actor,
              'tinyflag.timestamp': event.timestamp,
            },
          });
        }
      } catch {
        // OTel is optional
      }
    },
  };
}
