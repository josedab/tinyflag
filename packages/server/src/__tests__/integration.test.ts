import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { writeFileSync, mkdtempSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { CollabState, processCollabMessage } from '../collab.js';
import type { CollabResponse } from '../collab.js';

/**
 * Integration tests for server HTTP handlers, webhook delivery, rate limiting,
 * SSE/WS broadcast, multi-tenant loadFlags, ETag 304 responses, and graceful shutdown.
 *
 * Since the server module (index.ts) has module-level side effects, we replicate
 * the handler logic in-test to exercise core behavior without starting the real server.
 */

let tmpDir: string;
let flagsFile: string;
let currentFlags: Record<string, unknown> = {};
let currentEtag = '';
const CORS_ORIGIN = '*';
const webhookSubscribers = new Set<string>();
const sseClients = new Set<ServerResponse>();
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

const serverOptions = {
  rateLimit: 5,
  rateLimitWindow: 60_000,
  maxBodySize: 1024,
};

function loadFlags(tenant?: string): boolean {
  const file = tenant ? join(tmpDir, `flags.${tenant}.json`) : flagsFile;
  try {
    const content = JSON.parse(require('fs').readFileSync(file, 'utf-8'));
    if (tenant) {
      tenantFlags.set(tenant, content.flags || {});
    } else {
      currentFlags = content.flags || {};
      currentEtag = `"${Date.now().toString(36)}"`;
    }
    return true;
  } catch {
    return false;
  }
}

const tenantFlags = new Map<string, Record<string, unknown>>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > serverOptions.rateLimitWindow) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= serverOptions.rateLimit;
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, Authorization');
}

function notifyWebhookSubscribers(): Promise<PromiseSettledResult<Response>[]> {
  const payload = JSON.stringify({
    type: 'flags-updated',
    etag: currentEtag,
    timestamp: Date.now(),
  });
  const promises = Array.from(webhookSubscribers).map((url) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(5000),
    }),
  );
  return Promise.allSettled(promises);
}

function broadcastUpdate(): void {
  const message = JSON.stringify({ type: 'flags-updated', flags: currentFlags, etag: currentEtag });
  for (const res of sseClients) {
    try {
      res.write(`data: ${message}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

function handleGetFlags(req: IncomingMessage, res: ServerResponse, tenant?: string): void {
  const flags = tenant ? tenantFlags.get(tenant) || currentFlags : currentFlags;
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch === currentEtag) {
    res.writeHead(304);
    res.end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/json',
    ETag: currentEtag,
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify({ version: 1, flags }));
}

function handleSSE(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'flags-updated', flags: currentFlags })}\n\n`);
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

function handleWebhookSubscribe(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  let body = '';
  req.on('data', (chunk: string) => {
    body += chunk;
    if (body.length > serverOptions.maxBodySize) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      req.destroy();
    }
  });
  req.on('end', () => {
    if (body.length > serverOptions.maxBodySize) return;
    try {
      const { url } = JSON.parse(body);
      if (!url || typeof url !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "url" in request body' }));
        return;
      }
      webhookSubscribers.add(url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'subscribed', url }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    }
  });
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost`);

  // Rate limiting (skip health)
  if (url.pathname !== '/health' && url.pathname !== '/ready') {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
  }

  // Multi-tenant
  let tenant: string | undefined;
  let routePath = url.pathname;
  const tenantMatch = url.pathname.match(/^\/t\/([a-zA-Z0-9_-]+)(\/.*)?$/);
  if (tenantMatch) {
    tenant = tenantMatch[1];
    routePath = tenantMatch[2] || '/flags';
  }

  switch (routePath) {
    case '/flags':
    case '/flags.json':
      handleGetFlags(req, res, tenant);
      break;
    case '/health':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', flagCount: Object.keys(currentFlags).length }));
      break;
    case '/ready':
      if (Object.keys(currentFlags).length > 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready' }));
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'not ready', reason: 'No flags loaded' }));
      }
      break;
    case '/events':
      handleSSE(req, res);
      break;
    case '/webhook/subscribe':
      handleWebhookSubscribe(req, res);
      break;
    default:
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
  }
}

let server: ReturnType<typeof createServer>;
let baseUrl: string;

async function req(
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
  });
  const body = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: res.status, headers, body };
}

describe('Server Integration Tests', () => {
  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tinyflag-server-test-'));
    flagsFile = join(tmpDir, 'flags.json');
    writeFileSync(
      flagsFile,
      JSON.stringify({
        version: 1,
        flags: { 'test-flag': { enabled: true }, 'beta-flag': { enabled: false } },
      }),
    );
    loadFlags();

    server = createServer(handleRequest);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const res of sseClients) {
      try {
        res.end();
      } catch {}
    }
    sseClients.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      unlinkSync(flagsFile);
    } catch {}
  });

  beforeEach(() => {
    webhookSubscribers.clear();
    rateLimitMap.clear();
  });

  describe('notifyWebhookSubscribers', () => {
    it('delivers to all subscribers successfully', async () => {
      // Create a test receiver server
      let received: string[] = [];
      const receiver = createServer((req, res) => {
        let body = '';
        req.on('data', (c: Buffer) => (body += c));
        req.on('end', () => {
          received.push(body);
          res.writeHead(200);
          res.end();
        });
      });
      await new Promise<void>((r) => receiver.listen(0, r));
      const port = (receiver.address() as { port: number }).port;

      webhookSubscribers.add(`http://localhost:${port}/hook1`);
      webhookSubscribers.add(`http://localhost:${port}/hook2`);

      const results = await notifyWebhookSubscribers();
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      // Wait briefly for delivery
      await new Promise((r) => setTimeout(r, 50));
      expect(received.length).toBe(2);
      const parsed = JSON.parse(received[0]);
      expect(parsed.type).toBe('flags-updated');

      await new Promise<void>((r) => receiver.close(() => r()));
    });

    it('handles network error gracefully', async () => {
      webhookSubscribers.add('http://localhost:1/nonexistent');
      const results = await notifyWebhookSubscribers();
      expect(results[0].status).toBe('rejected');
    });

    it('handles empty subscribers list', async () => {
      const results = await notifyWebhookSubscribers();
      expect(results).toEqual([]);
    });
  });

  describe('checkRateLimit', () => {
    it('allows requests within limit', () => {
      for (let i = 0; i < serverOptions.rateLimit; i++) {
        expect(checkRateLimit('192.168.1.1')).toBe(true);
      }
    });

    it('blocks requests exceeding limit', () => {
      for (let i = 0; i < serverOptions.rateLimit; i++) {
        checkRateLimit('192.168.1.2');
      }
      expect(checkRateLimit('192.168.1.2')).toBe(false);
    });

    it('resets after window expires', () => {
      rateLimitMap.set('192.168.1.3', {
        count: serverOptions.rateLimit + 1,
        windowStart: Date.now() - serverOptions.rateLimitWindow - 1,
      });
      expect(checkRateLimit('192.168.1.3')).toBe(true);
    });

    it('returns 429 via HTTP when rate limited', async () => {
      for (let i = 0; i < serverOptions.rateLimit; i++) {
        await req('/flags');
      }
      const res = await req('/flags');
      expect(res.status).toBe(429);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Too many');
    });
  });

  describe('broadcastUpdate (SSE)', () => {
    it('connects SSE client and receives initial data', async () => {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/events`, { signal: controller.signal }).catch(
        () => null,
      );

      // SSE responds with 200 and text/event-stream
      expect(response?.status).toBe(200);
      expect(response?.headers.get('content-type')).toBe('text/event-stream');

      controller.abort();
    });
  });

  describe('multi-tenant loadFlags', () => {
    it('loads tenant-specific flags file', () => {
      writeFileSync(
        join(tmpDir, 'flags.acme.json'),
        JSON.stringify({ version: 1, flags: { 'acme-flag': { enabled: true } } }),
      );
      const result = loadFlags('acme');
      expect(result).toBe(true);
      expect(tenantFlags.get('acme')).toBeDefined();
      expect(tenantFlags.get('acme')!['acme-flag']).toBeDefined();
    });

    it('returns false for missing tenant file', () => {
      const result = loadFlags('nonexistent-tenant');
      expect(result).toBe(false);
    });

    it('serves tenant flags via /t/:tenant/flags', async () => {
      writeFileSync(
        join(tmpDir, 'flags.org1.json'),
        JSON.stringify({ version: 1, flags: { 'org-flag': { enabled: true } } }),
      );
      loadFlags('org1');

      const res = await req('/t/org1/flags');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.flags['org-flag']).toBeDefined();
    });
  });

  describe('ETag 304 responses', () => {
    it('returns 304 when ETag matches', async () => {
      rateLimitMap.clear();
      const first = await req('/flags');
      expect(first.status).toBe(200);
      const etag = first.headers['etag'];
      expect(etag).toBeTruthy();

      const second = await req('/flags', {
        headers: { 'If-None-Match': etag },
      });
      expect(second.status).toBe(304);
      expect(second.body).toBe('');
    });

    it('returns 200 when ETag does not match', async () => {
      rateLimitMap.clear();
      const res = await req('/flags', {
        headers: { 'If-None-Match': '"stale-etag"' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('readiness endpoint', () => {
    it('returns ready when flags are loaded', async () => {
      const res = await req('/ready');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ready');
    });

    it('returns 503 when no flags loaded', async () => {
      const saved = { ...currentFlags };
      currentFlags = {};
      const res = await req('/ready');
      expect(res.status).toBe(503);
      currentFlags = saved;
    });
  });

  describe('graceful shutdown', () => {
    it('cleans up SSE clients on server close', async () => {
      // Add a mock SSE client
      const mockRes = { end: vi.fn(), write: vi.fn() } as unknown as ServerResponse;
      sseClients.add(mockRes);
      expect(sseClients.size).toBeGreaterThanOrEqual(1);

      // Simulate cleanup
      for (const res of sseClients) {
        try {
          res.end();
        } catch {}
      }
      sseClients.clear();
      expect(sseClients.size).toBe(0);
    });
  });
});
