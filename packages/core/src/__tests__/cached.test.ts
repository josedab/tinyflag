import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CachedTinyFlag } from '../cached.js';
import type { FlagDefinition } from '../types.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function validFlagsPayload(flags: Record<string, unknown> = { 'test-flag': { enabled: true } }) {
  return { version: 1, flags };
}

describe('CachedTinyFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    // Remove any global WebSocket mock
    delete (globalThis as any).WebSocket;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('throws when serverUrl is missing', () => {
      expect(() => new CachedTinyFlag({ serverUrl: '' })).toThrow('"serverUrl" option is required');
    });

    it('creates instance with default options', () => {
      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939' });
      expect(client.isConnected()).toBe(false);
      client.destroy();
    });
  });

  describe('init() in poll mode', () => {
    it('fetches config, parses, and becomes connected', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      await client.init();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(client.isConnected()).toBe(true);
      expect(client.isEnabled('test-flag')).toBe(true);
      client.destroy();
    });

    it('starts polling after init', async () => {
      mockFetch.mockResolvedValue(jsonResponse(validFlagsPayload()));

      const client = new CachedTinyFlag({
        serverUrl: 'http://localhost:3939',
        mode: 'poll',
        pollInterval: 10_000,
      });
      await client.init();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance timer to trigger polling
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      client.destroy();
    });

    it('uses etag for conditional requests', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(validFlagsPayload(), 200, { etag: '"abc"' }))
        .mockResolvedValueOnce({
          ok: true,
          status: 304,
          statusText: 'Not Modified',
          headers: { get: () => null },
          json: async () => ({}),
        } as unknown as Response);

      const client = new CachedTinyFlag({
        serverUrl: 'http://localhost:3939',
        mode: 'poll',
        pollInterval: 5000,
      });
      await client.init();

      await vi.advanceTimersByTimeAsync(5000);
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall[1].headers['If-None-Match']).toBe('"abc"');

      client.destroy();
    });
  });

  describe('init() in push mode', () => {
    it('fetches flags and sets up WebSocket', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const mockWs = {
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
      (globalThis as any).WebSocket = vi.fn(() => mockWs);

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'push' });
      await client.init();

      expect(client.isConnected()).toBe(true);
      expect((globalThis as any).WebSocket).toHaveBeenCalledWith('ws://localhost:3939');

      client.destroy();
    });

    it('handles WebSocket message with flags-updated', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const mockWs = {
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
      (globalThis as any).WebSocket = vi.fn(() => mockWs);

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'push' });
      await client.init();

      // Simulate WebSocket message
      mockWs.onmessage?.({
        data: JSON.stringify({
          type: 'flags-updated',
          flags: { 'new-flag': { enabled: true } },
        }),
      });

      expect(client.isEnabled('new-flag')).toBe(true);
      client.destroy();
    });

    it('ignores non flags-updated messages', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const mockWs = {
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
      (globalThis as any).WebSocket = vi.fn(() => mockWs);

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'push' });
      await client.init();

      mockWs.onmessage?.({ data: JSON.stringify({ type: 'ping' }) });
      // Original flags should still be intact
      expect(client.isEnabled('test-flag')).toBe(true);
      client.destroy();
    });

    it('ignores malformed WebSocket messages', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const mockWs = {
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
      (globalThis as any).WebSocket = vi.fn(() => mockWs);

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'push' });
      await client.init();

      // Should not throw
      mockWs.onmessage?.({ data: 'not json' });
      expect(client.isEnabled('test-flag')).toBe(true);
      client.destroy();
    });
  });

  describe('WebSocket reconnect and fallback', () => {
    it('falls back to polling on WebSocket close when pollingFallback is true', async () => {
      mockFetch.mockResolvedValue(jsonResponse(validFlagsPayload()));

      const mockWs = {
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
      (globalThis as any).WebSocket = vi.fn(() => mockWs);

      const client = new CachedTinyFlag({
        serverUrl: 'http://localhost:3939',
        mode: 'push',
        pollingFallback: true,
        autoReconnect: false,
      });
      await client.init();

      // Trigger WebSocket close
      mockWs.onclose?.();
      expect(client.isConnected()).toBe(false);

      // Polling should start, advance timer
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);

      client.destroy();
    });

    it('attempts auto-reconnect on WebSocket close', async () => {
      mockFetch.mockResolvedValue(jsonResponse(validFlagsPayload()));

      let wsCount = 0;
      const mockWs = () => {
        wsCount++;
        return {
          onmessage: null as any,
          onclose: null as any,
          onerror: null as any,
          close: vi.fn(),
          send: vi.fn(),
          readyState: 1,
        };
      };
      (globalThis as any).WebSocket = vi.fn(mockWs);

      const client = new CachedTinyFlag({
        serverUrl: 'http://localhost:3939',
        mode: 'push',
        autoReconnect: true,
        pollingFallback: false,
      });
      await client.init();

      const firstWs = (globalThis as any).WebSocket.mock.results[0].value;
      firstWs.onclose?.();

      // Advance timer past reconnect delay
      await vi.advanceTimersByTimeAsync(5000);
      expect((globalThis as any).WebSocket).toHaveBeenCalledTimes(2);

      client.destroy();
    });

    it('emits error on WebSocket error', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const mockWs = {
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
      (globalThis as any).WebSocket = vi.fn(() => mockWs);

      const errors: any[] = [];
      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'push' });
      client.on('error', (e) => errors.push(e));
      await client.init();

      mockWs.onerror?.({});
      expect(errors.some((e) => e.code === 'WS_ERROR')).toBe(true);

      client.destroy();
    });

    it('falls back to polling when WebSocket constructor throws', async () => {
      mockFetch.mockResolvedValue(jsonResponse(validFlagsPayload()));

      (globalThis as any).WebSocket = vi.fn(() => {
        throw new Error('WebSocket not available');
      });

      const client = new CachedTinyFlag({
        serverUrl: 'http://localhost:3939',
        mode: 'push',
        pollingFallback: true,
      });
      await client.init();

      // Polling should have started
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockFetch.mock.calls.length).toBeGreaterThan(1);

      client.destroy();
    });
  });

  describe('isEnabled() and getVariant()', () => {
    it('returns false for unknown flag', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      await client.init();

      expect(client.isEnabled('nonexistent')).toBe(false);
      client.destroy();
    });

    it('returns null variant for unknown flag', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      await client.init();

      expect(client.getVariant('nonexistent')).toBeNull();
      client.destroy();
    });

    it('evaluates flag with context', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          validFlagsPayload({
            'rules-flag': {
              enabled: true,
              rules: [{ conditions: { plan: 'pro' }, enabled: true }],
            },
          }),
        ),
      );

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      await client.init();

      expect(client.isEnabled('rules-flag', { plan: 'pro' })).toBe(true);
      expect(client.isEnabled('rules-flag', { plan: 'free' })).toBe(true); // no rule match, falls through to enabled
      client.destroy();
    });

    it('returns variant for flag with variants', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(
          validFlagsPayload({
            'ab-flag': {
              enabled: true,
              variants: [
                { name: 'control', weight: 50 },
                { name: 'treatment', weight: 50 },
              ],
            },
          }),
        ),
      );

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      await client.init();

      const variant = client.getVariant('ab-flag', { userId: 'user-1' });
      expect(['control', 'treatment']).toContain(variant);
      client.destroy();
    });
  });

  describe('event handling', () => {
    it('emits change event when config updates via WebSocket', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload({ 'f': { enabled: true } })));

      const mockWs = {
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
      (globalThis as any).WebSocket = vi.fn(() => mockWs);

      const changes: any[] = [];
      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'push' });
      client.on('change', (e) => changes.push(e));
      await client.init();

      // Simulate WebSocket update that changes the flag
      mockWs.onmessage?.({
        data: JSON.stringify({
          type: 'flags-updated',
          flags: { 'f': { enabled: false } },
        }),
      });

      expect(changes.length).toBeGreaterThanOrEqual(1);
      expect(changes[0].flag).toBe('f');
      client.destroy();
    });

    it('can remove event listeners', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const handler = vi.fn();
      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      client.on('error', handler);
      client.off('error', handler);

      await client.init();
      // Error handler should not be called for successful init
      client.destroy();
    });
  });

  describe('error handling', () => {
    it('emits error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

      const errors: any[] = [];
      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      client.on('error', (e) => errors.push(e));
      await client.init();

      expect(errors.some((e) => e.code === 'FETCH_ERROR')).toBe(true);
      client.destroy();
    });

    it('emits error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const errors: any[] = [];
      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      client.on('error', (e) => errors.push(e));
      await client.init();

      expect(errors.some((e) => e.code === 'FETCH_ERROR')).toBe(true);
      client.destroy();
    });

    it('emits error on parse errors', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ version: 1, flags: { 'bad flag': { enabled: true } } }),
      );

      const errors: any[] = [];
      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      client.on('error', (e) => errors.push(e));
      await client.init();

      expect(errors.some((e) => e.code === 'PARSE_ERROR')).toBe(true);
      client.destroy();
    });
  });

  describe('destroy()', () => {
    it('cleans up WebSocket, polling, and cache', async () => {
      mockFetch.mockResolvedValue(jsonResponse(validFlagsPayload()));

      const mockWs = {
        onmessage: null as any,
        onclose: null as any,
        onerror: null as any,
        close: vi.fn(),
        send: vi.fn(),
        readyState: 1,
      };
      (globalThis as any).WebSocket = vi.fn(() => mockWs);

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'push' });
      await client.init();

      client.destroy();

      expect(mockWs.close).toHaveBeenCalled();
      expect(client.isConnected()).toBe(false);
    });

    it('cleans up poll timer', async () => {
      mockFetch.mockResolvedValue(jsonResponse(validFlagsPayload()));

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      await client.init();

      client.destroy();
      // No more polling should happen
      const callCount = mockFetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockFetch.mock.calls.length).toBe(callCount);
    });
  });

  describe('getFlags()', () => {
    it('returns snapshot of current flags', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const client = new CachedTinyFlag({ serverUrl: 'http://localhost:3939', mode: 'poll' });
      await client.init();

      const flags = client.getFlags();
      expect(flags['test-flag']).toBeDefined();
      expect(flags['test-flag'].enabled).toBe(true);
      client.destroy();
    });
  });

  describe('custom headers', () => {
    it('sends custom headers with requests', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(validFlagsPayload()));

      const client = new CachedTinyFlag({
        serverUrl: 'http://localhost:3939',
        mode: 'poll',
        headers: { Authorization: 'Bearer token123' },
      });
      await client.init();

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders.Authorization).toBe('Bearer token123');
      client.destroy();
    });
  });
});
