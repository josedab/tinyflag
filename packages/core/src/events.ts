import type { TinyFlagEvents } from './types.js';

type EventName = keyof TinyFlagEvents;
type EventHandler<K extends EventName> = TinyFlagEvents[K];

/**
 * Minimal typed event emitter. Handles listener registration,
 * removal, and safe emission (listener errors are caught).
 */
export class EventEmitter {
  private listeners = new Map<EventName, Set<EventHandler<EventName>>>();

  on<K extends EventName>(event: K, handler: EventHandler<K>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as EventHandler<EventName>);
  }

  off<K extends EventName>(event: K, handler: EventHandler<K>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<EventName>);
  }

  emit<K extends EventName>(event: K, ...args: Parameters<EventHandler<K>>): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        (handler as (...a: unknown[]) => void)(...args);
      } catch (error) {
        // Listener errors must not break evaluation.
        // If the failing event is not 'error', emit an error event.
        if (event !== 'error') {
          this.emit('error', {
            code: 'LISTENER_ERROR',
            message: `Listener for '${event}' threw: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }

  hasListeners(event: EventName): boolean {
    const handlers = this.listeners.get(event);
    return handlers !== undefined && handlers.size > 0;
  }
}
