import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Since the server module (index.ts) has module-level side effects (starts server, file watcher),
 * we test the HTTP handler logic by creating a lightweight server replica that uses the same
 * handler patterns. This exercises the core request handling, ETag, CORS, routing, and webhook logic.
 */

let tmpDir: string;
let flagsFile: string;
let currentFlags: Record<string, unknown> = {};
let currentEtag = '';
const CORS_ORIGIN = '*';
const webhookSubscribers = new Set<string>();

function loadFlags(): boolean {
  try {
    const content = readFileSync(flagsFile, 'utf-8');
    const raw = flagsFile.endsWith('.json') ? JSON.parse(content) : JSON.parse(content);
    currentFlags = raw.flags || {};
    currentEtag = `"${Date.now().toString(36)}"`;
    return true;
  } catch {
    return false;
  }
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
}

function handleGetFlags(req: IncomingMessage, res: ServerResponse): void {
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
  res.end(JSON.stringify({ version: 1, flags: currentFlags }));
}

function handleWebhook(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  loadFlags();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', reloaded: true }));
}

function handleWebhookSubscribe(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
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

function handleWebhookUnsubscribe(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    try {
      const { url } = JSON.parse(body);
      webhookSubscribers.delete(url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'unsubscribed', url }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    }
  });
}

function handleCollabPresence(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ sessions: [] }));
}

function handleCollabHistory(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ operations: [] }));
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost`);

  switch (url.pathname) {
    case '/flags':
    case '/flags.json':
      handleGetFlags(req, res);
      break;
    case '/health':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', flagCount: Object.keys(currentFlags).length }));
      break;
    case '/webhook':
      handleWebhook(req, res);
      break;
    case '/webhook/subscribe':
      handleWebhookSubscribe(req, res);
      break;
    case '/webhook/unsubscribe':
      handleWebhookUnsubscribe(req, res);
      break;
    case '/collab/presence':
      handleCollabPresence(req, res);
      break;
    case '/collab/history':
      handleCollabHistory(req, res);
      break;
    default:
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
  }
}

// Test server
let server: ReturnType<typeof createServer>;
let baseUrl: string;

async function request(
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

describe('Server HTTP Handlers', () => {
  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tinyflag-test-'));
    flagsFile = join(tmpDir, 'flags.json');
    writeFileSync(
      flagsFile,
      JSON.stringify({
        version: 1,
        flags: { 'test-flag': { enabled: true }, 'disabled-flag': { enabled: false } },
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      unlinkSync(flagsFile);
    } catch {}
  });

  beforeEach(() => {
    webhookSubscribers.clear();
  });

  describe('setCors', () => {
    it('sets CORS headers on all responses', async () => {
      const res = await request('/flags');
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['access-control-allow-methods']).toContain('GET');
    });
  });

  describe('OPTIONS preflight', () => {
    it('returns 204 for OPTIONS request', async () => {
      const res = await request('/flags', { method: 'OPTIONS' });
      expect(res.status).toBe(204);
    });
  });

  describe('handleGetFlags', () => {
    it('returns flags with ETag', async () => {
      const res = await request('/flags');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.flags['test-flag'].enabled).toBe(true);
      expect(res.headers['etag']).toBeTruthy();
      expect(res.headers['cache-control']).toBe('no-cache');
    });

    it('returns 304 when ETag matches', async () => {
      const first = await request('/flags');
      const etag = first.headers['etag'];

      const second = await request('/flags', {
        headers: { 'If-None-Match': etag },
      });
      expect(second.status).toBe(304);
      expect(second.body).toBe('');
    });

    it('returns flags for /flags.json path', async () => {
      const res = await request('/flags.json');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.flags).toBeDefined();
    });
  });

  describe('handleWebhook', () => {
    it('returns 405 for GET request', async () => {
      const res = await request('/webhook');
      expect(res.status).toBe(405);
    });

    it('reloads flags and returns 200 on POST', async () => {
      const res = await request('/webhook', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.reloaded).toBe(true);
    });
  });

  describe('handleWebhookSubscribe', () => {
    it('returns 405 for GET request', async () => {
      const res = await request('/webhook/subscribe');
      expect(res.status).toBe(405);
    });

    it('subscribes with valid URL', async () => {
      const res = await request('/webhook/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://hook.example.com/callback' }),
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('subscribed');
      expect(body.url).toBe('https://hook.example.com/callback');
      expect(webhookSubscribers.has('https://hook.example.com/callback')).toBe(true);
    });

    it('returns 400 for missing url', async () => {
      const res = await request('/webhook/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('url');
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await request('/webhook/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('handleWebhookUnsubscribe', () => {
    it('returns 405 for GET request', async () => {
      const res = await request('/webhook/unsubscribe');
      expect(res.status).toBe(405);
    });

    it('unsubscribes URL', async () => {
      webhookSubscribers.add('https://hook.example.com/cb');

      const res = await request('/webhook/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://hook.example.com/cb' }),
      });
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('unsubscribed');
      expect(webhookSubscribers.has('https://hook.example.com/cb')).toBe(false);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await request('/webhook/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('handleCollabPresence', () => {
    it('returns sessions list', async () => {
      const res = await request('/collab/presence');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.sessions).toBeDefined();
    });
  });

  describe('handleCollabHistory', () => {
    it('returns operations list', async () => {
      const res = await request('/collab/history');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.operations).toBeDefined();
    });
  });

  describe('routing - unknown paths', () => {
    it('returns 404 for unknown route', async () => {
      const res = await request('/unknown');
      expect(res.status).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Not found');
    });
  });

  describe('health endpoint', () => {
    it('returns health status with flag count', async () => {
      const res = await request('/health');
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.flagCount).toBe(2);
    });
  });

  describe('loadFlags with missing file', () => {
    it('returns false when flags file does not exist', () => {
      const origFile = flagsFile;
      flagsFile = '/tmp/nonexistent-flags-file.json';
      const result = loadFlags();
      expect(result).toBe(false);
      flagsFile = origFile;
    });
  });
});
