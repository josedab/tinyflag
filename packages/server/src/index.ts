import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, watch, existsSync } from 'fs';
import { execSync } from 'child_process';
import { WebSocketServer, WebSocket } from './ws.js';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import { CollabState, processCollabMessage } from './collab.js';
import type { CollabResponse } from './collab.js';

/** Options for configuring the TinyFlag server. */
export interface TinyFlagServerOptions {
  /** HTTP port. Default: 3939. */
  port?: number;
  /** Maximum request body size in bytes. Default: 10240 (10KB). */
  maxBodySize?: number;
  /** Maximum number of history entries returned. Default: 50. */
  defaultHistoryLimit?: number;
  /** Upper bound for history limit parameter. Default: 500. */
  maxHistoryLimit?: number;
  /** Maximum number of WebSocket connections. Default: 1000. */
  maxConnections?: number;
  /** Rate limit: max requests per window per IP. Default: 100. */
  rateLimit?: number;
  /** Rate limit window in ms. Default: 60000 (1 minute). */
  rateLimitWindow?: number;
  /** Git repo path to watch for flag changes. */
  gitRepoPath?: string;
  /** Git branch to watch. Default: 'main'. */
  gitBranch?: string;
  /** Polling interval for git changes in ms. Default: 30000. */
  gitPollInterval?: number;
}

const serverOptions: Required<TinyFlagServerOptions> = {
  port: parseInt(process.env.PORT || '3939', 10),
  maxBodySize: 10 * 1024,
  defaultHistoryLimit: 50,
  maxHistoryLimit: 500,
  maxConnections: parseInt(process.env.MAX_CONNECTIONS || '1000', 10),
  rateLimit: parseInt(process.env.RATE_LIMIT || '100', 10),
  rateLimitWindow: 60_000,
  gitRepoPath: process.env.GIT_REPO_PATH || '',
  gitBranch: process.env.GIT_BRANCH || 'main',
  gitPollInterval: parseInt(process.env.GIT_POLL_INTERVAL || '30000', 10),
};

const PORT = serverOptions.port;
const FLAGS_FILE = process.env.FLAGS_FILE || 'flags.yml';
const GIT_AUTO_PULL = process.env.GIT_AUTO_PULL === 'true';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const TINYFLAG_TOKEN = process.env.TINYFLAG_TOKEN || '';
const MULTI_TENANT = process.env.MULTI_TENANT === 'true';

// Structured logging
function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>): void {
  const entry = { timestamp: new Date().toISOString(), level, message, ...meta };
  if (process.env.LOG_FORMAT === 'json') {
    console.log(JSON.stringify(entry));
  } else {
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔍' : '✅';
    console.log(`${prefix} ${message}`);
  }
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

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

// Periodic cleanup of rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > serverOptions.rateLimitWindow) {
      rateLimitMap.delete(ip);
    }
  }
}, serverOptions.rateLimitWindow);

// Multi-tenant flag storage
const tenantFlags = new Map<string, Record<string, unknown>>();
const tenantTokens = new Map<string, string>(); // tenant -> auth token

let currentFlags: Record<string, unknown> = {};
let currentEtag = '';
let startTime = Date.now();

function loadFlags(tenant?: string): void {
  const flagsFile = tenant ? `flags.${tenant}.yml` : FLAGS_FILE;
  try {
    if (!existsSync(flagsFile)) {
      if (tenant) {
        log('warn', `Tenant flags file not found: ${flagsFile}`);
        return;
      }
      throw new Error(`Flags file not found: ${flagsFile}`);
    }
    const content = readFileSync(flagsFile, 'utf-8');
    const raw = flagsFile.endsWith('.json') ? JSON.parse(content) : parseYaml(content);
    const { config, errors } = parseFlagConfig(raw);

    if (errors.length > 0) {
      log('error', 'Flag validation errors', { file: flagsFile, errors: errors.map(e => `${e.path}: ${e.message}`) });
      return;
    }

    if (tenant) {
      tenantFlags.set(tenant, config.flags);
      log('info', `Loaded ${Object.keys(config.flags).length} flags for tenant ${tenant}`, { tenant, count: Object.keys(config.flags).length });
    } else {
      currentFlags = config.flags;
      currentEtag = `"${Date.now().toString(36)}"`;
      log('info', `Loaded ${Object.keys(config.flags).length} flags from ${flagsFile}`, { count: Object.keys(config.flags).length });
      broadcastUpdate();
    }
  } catch (error) {
    log('error', `Failed to load flags: ${(error as Error).message}`, { file: flagsFile });
  }
}

// SSE clients
const sseClients = new Set<ServerResponse>();

// WebSocket clients
const wsClients = new Set<WebSocket>();

// Collaboration state
const collabState = new CollabState();
const collabSessions = new Map<WebSocket, string>(); // ws → sessionId

function broadcastUpdate(): void {
  const message = JSON.stringify({ type: 'flags-updated', flags: currentFlags, etag: currentEtag });

  // WebSocket broadcast
  for (const client of wsClients) {
    try {
      if (client.readyState === 1) {
        client.send(message);
      }
    } catch {
      wsClients.delete(client);
    }
  }

  // SSE broadcast
  for (const res of sseClients) {
    try {
      res.write(`data: ${message}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, Authorization');
}

// Webhook subscribers for HTTP push notifications
const webhookSubscribers = new Set<string>();

/** Verify Bearer token when TINYFLAG_TOKEN is set. Returns true if authorized. */
function checkAuth(req: IncomingMessage, res: ServerResponse, tenant?: string): boolean {
  if (tenant && tenantTokens.has(tenant)) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token === tenantTokens.get(tenant)) return true;
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }

  if (!TINYFLAG_TOKEN) return true;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token === TINYFLAG_TOKEN) return true;

  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}

function getClientIp(req: IncomingMessage): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress || 'unknown';
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // Rate limiting (skip health endpoint)
  if (url.pathname !== '/health' && url.pathname !== '/ready') {
    const ip = getClientIp(req);
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
  }

  // Multi-tenant URL path extraction: /t/:tenant/...
  let tenant: string | undefined;
  let routePath = url.pathname;
  if (MULTI_TENANT) {
    const tenantMatch = url.pathname.match(/^\/t\/([a-zA-Z0-9_-]+)(\/.*)?$/);
    if (tenantMatch) {
      tenant = tenantMatch[1];
      routePath = tenantMatch[2] || '/flags';
    }
  }

  // Skip auth for health/ready endpoints
  if (routePath !== '/health' && routePath !== '/ready' && !checkAuth(req, res, tenant)) return;

  switch (routePath) {
    case '/flags':
    case '/flags.json':
      handleGetFlags(req, res, tenant);
      break;
    case '/health':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        flagCount: Object.keys(currentFlags).length,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        connections: { websocket: wsClients.size, sse: sseClients.size },
      }));
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

function handleGetFlags(req: IncomingMessage, res: ServerResponse, tenant?: string): void {
  const flags = tenant ? (tenantFlags.get(tenant) || currentFlags) : currentFlags;

  // ETag support for conditional requests
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
  res.write(`data: ${JSON.stringify({ type: 'flags-updated', flags: currentFlags, etag: currentEtag })}\n\n`);
  sseClients.add(res);

  res.on('close', () => {
    sseClients.delete(res);
  });
}

function handleWebhook(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (GIT_AUTO_PULL) {
    try {
      execSync('git pull --ff-only', { stdio: 'pipe', timeout: 10_000 });
      log('info', 'Git pull completed');
    } catch (error) {
      log('error', `Git pull failed: ${(error as Error).message}`);
    }
  }

  loadFlags();
  notifyWebhookSubscribers();
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
      log('info', `Webhook subscriber added: ${url}`, { total: webhookSubscribers.size });
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
      webhookSubscribers.delete(url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'unsubscribed', url }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    }
  });
}

function notifyWebhookSubscribers(): void {
  const payload = JSON.stringify({
    type: 'flags-updated',
    etag: currentEtag,
    timestamp: Date.now(),
  });
  for (const url of webhookSubscribers) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      log('error', `Webhook delivery failed for ${url}: ${err.message}`);
    });
  }
}

function handleCollabPresence(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ sessions: collabState.getPresence() }));
}

function handleCollabHistory(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const flagName = url.searchParams.get('flag') || undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || String(serverOptions.defaultHistoryLimit), 10), serverOptions.maxHistoryLimit);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ operations: collabState.getHistory(flagName, limit) }));
}

function broadcastCollab(msg: CollabResponse, excludeWs?: WebSocket): void {
  const data = JSON.stringify(msg);
  for (const client of wsClients) {
    if (client === excludeWs) continue;
    try {
      if (client.readyState === 1) client.send(data);
    } catch {
      /* ignore dead connections */
    }
  }
}

// Git repo watching
let gitPollTimer: ReturnType<typeof setInterval> | undefined;
let lastGitHash = '';

function startGitWatcher(): void {
  if (!serverOptions.gitRepoPath) return;

  function checkGitChanges(): void {
    try {
      const hash = execSync(`git -C "${serverOptions.gitRepoPath}" rev-parse HEAD`, {
        stdio: 'pipe',
        timeout: 5000,
      }).toString().trim();

      if (lastGitHash && hash !== lastGitHash) {
        log('info', 'Git change detected, reloading flags', { oldHash: lastGitHash.slice(0, 8), newHash: hash.slice(0, 8) });
        if (GIT_AUTO_PULL) {
          try {
            execSync(`git -C "${serverOptions.gitRepoPath}" pull --ff-only`, { stdio: 'pipe', timeout: 10_000 });
          } catch (e) {
            log('error', `Git pull failed: ${(e as Error).message}`);
          }
        }
        loadFlags();
      }
      lastGitHash = hash;
    } catch {
      // Git not available or not a repo — skip
    }
  }

  checkGitChanges();
  gitPollTimer = setInterval(checkGitChanges, serverOptions.gitPollInterval);
}

// Main
loadFlags();

// Watch for file changes
let debounce: ReturnType<typeof setTimeout> | undefined;
try {
  watch(FLAGS_FILE, { persistent: false }, (eventType) => {
    if (eventType === 'change' || eventType === 'rename') {
      clearTimeout(debounce);
      debounce = setTimeout(() => loadFlags(), 100);
    }
  });
} catch {
  log('warn', `Cannot watch ${FLAGS_FILE}, file watching disabled`);
}

// Start git watcher if configured
startGitWatcher();

// HTTP server
const server = createServer(handleRequest);

// WebSocket server
const wss = new WebSocketServer(server);
wss.on('connection', (ws: WebSocket) => {
  // Enforce connection limit
  if (wsClients.size >= serverOptions.maxConnections) {
    ws.close();
    log('warn', 'WebSocket connection rejected: max connections reached', { max: serverOptions.maxConnections });
    return;
  }

  wsClients.add(ws);
  // Send current flags on connect
  ws.send(JSON.stringify({ type: 'flags-updated', flags: currentFlags, etag: currentEtag }));

  ws.on('message', (data: string) => {
    try {
      const msg = JSON.parse(data);
      if (!msg.type) return;

      // Handle collaboration messages
      const sessionId = collabSessions.get(ws) || '';
      const { responses, broadcast, additionalBroadcasts } = processCollabMessage(
        collabState,
        sessionId,
        msg,
      );

      // If this is a join, store session mapping
      if (msg.type === 'join') {
        for (const r of responses) {
          if (r.type === 'joined') {
            collabSessions.set(ws, r.sessionId);
          }
        }
      }

      // Send direct responses to this client
      for (const r of responses) {
        ws.send(JSON.stringify(r));
      }

      // Broadcast to all other clients
      if (broadcast) {
        broadcastCollab(broadcast, ws);
      }
      if (additionalBroadcasts) {
        for (const ab of additionalBroadcasts) {
          broadcastCollab(ab, ws);
        }
      }
    } catch {
      /* ignore invalid messages */
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    const sessionId = collabSessions.get(ws);
    if (sessionId) {
      const releasedLocks = collabState.leave(sessionId);
      collabSessions.delete(ws);
      broadcastCollab({ type: 'session-left', sessionId });
      for (const flagName of releasedLocks) {
        broadcastCollab({ type: 'unlocked', flagName });
      }
    }
  });
});

// Graceful shutdown
function shutdown(signal: string): void {
  log('info', `Received ${signal}, shutting down gracefully`);

  // Stop accepting new connections
  server.close(() => {
    log('info', 'HTTP server closed');
  });

  // Stop git watcher
  if (gitPollTimer) clearInterval(gitPollTimer);

  // Close all WebSocket connections
  for (const client of wsClients) {
    try {
      client.close();
    } catch { /* ignore */ }
  }

  // Close all SSE connections
  for (const res of sseClients) {
    try {
      res.end();
    } catch { /* ignore */ }
  }

  // Force exit after 10 seconds
  setTimeout(() => {
    log('warn', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, () => {
  startTime = Date.now();
  log('info', `TinyFlag server running on http://localhost:${PORT}`);
  console.log(`   GET  /flags              → JSON flag config`);
  console.log(`   GET  /health             → Health check`);
  console.log(`   GET  /ready              → Readiness check`);
  console.log(`   GET  /events             → SSE stream`);
  console.log(`   POST /webhook            → Trigger reload (+ git pull if GIT_AUTO_PULL=true)`);
  console.log(`   POST /webhook/subscribe  → Subscribe to flag change webhooks`);
  console.log(`   POST /webhook/unsubscribe → Unsubscribe from webhooks`);
  console.log(`   GET  /collab/presence    → Active collaboration sessions`);
  console.log(`   GET  /collab/history     → Edit history (?flag=name&limit=50)`);
  console.log(`   WS   ws://localhost:${PORT}  → Real-time flag updates + collaboration`);
  if (MULTI_TENANT) {
    console.log(`   Multi-tenant: GET /t/:tenant/flags`);
  }
});
