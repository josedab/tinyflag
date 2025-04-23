import type { FlagConfig, FlagDefinition, UserContext, TinyFlagEvents } from './types.js';
import { evaluateFlag, evaluateVariant, setEvaluationContext } from './evaluator.js';
import { EventEmitter } from './events.js';
import { parseFlagConfig } from './schema.js';
import { debug } from './debug.js';

export interface CachedTinyFlagOptions {
  /** TinyFlag server URL (e.g., http://localhost:3939). */
  serverUrl: string;
  /** Connection mode: 'push' uses WebSocket, 'poll' uses HTTP polling. */
  mode?: 'push' | 'poll';
  /** Polling interval in ms (only for poll mode). Default: 30000. */
  pollInterval?: number;
  /** Auto-reconnect on WebSocket disconnect. Default: true. */
  autoReconnect?: boolean;
  /** Fallback to polling when WebSocket disconnects. Default: true. */
  pollingFallback?: boolean;
  /** Custom HTTP headers for requests. */
  headers?: Record<string, string>;
  /** Timeout in ms for HTTP flag fetches. Default: 5000. */
  fetchTimeout?: number;
  /** Delay in ms before WebSocket reconnection attempt. Default: 5000. */
  reconnectDelay?: number;
}

/**
 * CachedTinyFlag — client that maintains a local evaluation cache
 * with real-time updates via WebSocket push or HTTP polling.
 */
export class CachedTinyFlag {
  private config: FlagConfig = { flags: {} };
  private readonly options: Required<
    Pick<CachedTinyFlagOptions, 'mode' | 'pollInterval' | 'autoReconnect' | 'pollingFallback'>
  > &
    CachedTinyFlagOptions;
  private readonly emitter = new EventEmitter();
  private ws?: {
    close(): void;
    send(data: string): void;
    readyState: number;
    onmessage: ((event: { data: string }) => void) | null;
    onclose: (() => void) | null;
    onerror: ((event: unknown) => void) | null;
  };
  private pollTimer?: ReturnType<typeof setInterval>;
  private etag?: string;
  private connected = false;
  private cache = new Map<
    string,
    { enabled: boolean; variant: string | null; timestamp: number }
  >();
  private cacheMaxAge = 60_000;

  constructor(options: CachedTinyFlagOptions) {
    if (!options.serverUrl) {
      throw new Error('CachedTinyFlag: "serverUrl" option is required');
    }
    this.options = {
      ...options,
      mode: options.mode ?? 'push',
      pollInterval: options.pollInterval ?? 30_000,
      autoReconnect: options.autoReconnect ?? true,
      pollingFallback: options.pollingFallback ?? true,
    };
  }

  /** Initialize the connection and load initial flags. */
  async init(): Promise<void> {
    await this.fetchFlags();

    if (this.options.mode === 'push') {
      this.connectWebSocket();
    } else {
      this.startPolling();
    }
  }

  /** Check if a flag is enabled, using the local cache. */
  isEnabled(flagName: string, context?: UserContext): boolean {
    const flag = this.config.flags[flagName];
    if (!flag) return false;
    return evaluateFlag(flagName, flag, context);
  }

  /** Get the variant for a flag. */
  getVariant(flagName: string, context?: UserContext): string | null {
    const flag = this.config.flags[flagName];
    if (!flag) return null;
    const { variant } = evaluateVariant(flagName, flag, context);
    return variant;
  }

  /** Get a snapshot of all cached flags. */
  getFlags(): Readonly<Record<string, FlagDefinition>> {
    return this.config.flags;
  }

  /** Whether the client is connected to the server. */
  isConnected(): boolean {
    return this.connected;
  }

  /** Register an event listener. */
  on<K extends keyof TinyFlagEvents>(event: K, handler: TinyFlagEvents[K]): void {
    this.emitter.on(event, handler);
  }

  /** Remove an event listener. */
  off<K extends keyof TinyFlagEvents>(event: K, handler: TinyFlagEvents[K]): void {
    this.emitter.off(event, handler);
  }

  /** Clean up resources. */
  destroy(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = undefined;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.emitter.removeAllListeners();
    this.cache.clear();
    this.connected = false;
  }

  private async fetchFlags(): Promise<void> {
    const url = `${this.options.serverUrl}/flags`;
    const headers: Record<string, string> = {
      ...this.options.headers,
      Accept: 'application/json',
    };
    if (this.etag) {
      headers['If-None-Match'] = this.etag;
    }

    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(this.options.fetchTimeout ?? 5000),
      });

      if (res.status === 304) return;

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      this.etag = res.headers.get('etag') ?? undefined;
      const data = (await res.json()) as { version?: number; flags: Record<string, unknown> };
      const { config, errors } = parseFlagConfig(data);

      if (errors.length > 0) {
        this.emitter.emit('error', {
          code: 'PARSE_ERROR',
          message: `Flag parse errors: ${errors.map((e) => e.message).join(', ')}`,
        });
        return;
      }

      this.updateConfig(config);
      this.connected = true;
      debug('CachedTinyFlag: flags fetched');
    } catch (error) {
      this.emitter.emit('error', { code: 'FETCH_ERROR', message: (error as Error).message });
    }
  }

  private updateConfig(config: FlagConfig): void {
    const prev = this.config;
    this.config = config;
    this.cache.clear();
    setEvaluationContext(config.flags, config.segments);

    // Emit change events
    const allKeys = new Set([...Object.keys(prev.flags), ...Object.keys(config.flags)]);
    const now = Date.now();
    for (const key of allKeys) {
      if (JSON.stringify(prev.flags[key]) !== JSON.stringify(config.flags[key])) {
        this.emitter.emit('change', {
          flag: key,
          previous: prev.flags[key],
          current: config.flags[key],
          timestamp: now,
        });
      }
    }
  }

  private connectWebSocket(): void {
    try {
      const wsUrl = this.options.serverUrl.replace(/^http/, 'ws');
      // WebSocket is globally available in modern Node.js and browsers
      const ws = new (globalThis as any).WebSocket(wsUrl);

      ws.onmessage = (event: { data: string }) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'flags-updated' && msg.flags) {
            const { config, errors } = parseFlagConfig({ version: 1, flags: msg.flags });
            if (errors.length === 0) {
              this.updateConfig(config);
              debug('CachedTinyFlag: flags updated via WebSocket');
            }
          }
        } catch (parseError) {
          debug(
            'CachedTinyFlag: WebSocket message parse error: ' +
              (parseError instanceof Error ? parseError.message : String(parseError)),
          );
        }
      };

      ws.onclose = () => {
        this.connected = false;
        debug('CachedTinyFlag: WebSocket disconnected');

        if (this.options.pollingFallback) {
          debug('CachedTinyFlag: falling back to polling');
          this.startPolling();
        }

        if (this.options.autoReconnect) {
          setTimeout(() => this.connectWebSocket(), this.options.reconnectDelay ?? 5000);
        }
      };

      ws.onerror = () => {
        this.emitter.emit('error', { code: 'WS_ERROR', message: 'WebSocket connection error' });
      };

      this.ws = ws;
      this.connected = true;
    } catch (error) {
      debug('CachedTinyFlag: WebSocket not available, falling back to polling');
      if (this.options.pollingFallback) {
        this.startPolling();
      }
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.fetchFlags(), this.options.pollInterval);
    if (typeof this.pollTimer === 'object' && 'unref' in this.pollTimer) {
      this.pollTimer.unref();
    }
  }
}
