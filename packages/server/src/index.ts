import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, watch } from 'fs';
import { execSync } from 'child_process';
import { WebSocketServer, WebSocket } from './ws.js';
import { parseYaml, parseFlagConfig } from 'tinyflag';

const PORT = parseInt(process.env.PORT || '3939', 10);
const FLAGS_FILE = process.env.FLAGS_FILE || 'flags.yml';
const GIT_AUTO_PULL = process.env.GIT_AUTO_PULL === 'true';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

let currentFlags: Record<string, unknown> = {};
let currentEtag = '';

function loadFlags(): void {
  try {
    const content = readFileSync(FLAGS_FILE, 'utf-8');
    const raw = FLAGS_FILE.endsWith('.json') ? JSON.parse(content) : parseYaml(content);
    const { config, errors } = parseFlagConfig(raw);

    if (errors.length > 0) {
      console.error('❌ Flag validation errors:');
      for (const e of errors) console.error(`  - ${e.path}: ${e.message}`);
      return;
    }

    currentFlags = config.flags;
    currentEtag = `"${Date.now().toString(36)}"`;
    console.log(`✅ Loaded ${Object.keys(config.flags).length} flags from ${FLAGS_FILE}`);

    // Notify WebSocket clients
    broadcastUpdate();
  } catch (error) {
    console.error(`❌ Failed to load flags: ${(error as Error).message}`);
  }
}

// WebSocket clients
const wsClients = new Set<WebSocket>();

function broadcastUpdate(): void {
  const message = JSON.stringify({ type: 'flags-updated', flags: currentFlags, etag: currentEtag });
  for (const client of wsClients) {
    try {
      if (client.readyState === 1) { // OPEN
        client.send(message);
      }
    } catch {
      wsClients.delete(client);
    }
  }
}

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
}

// Webhook subscribers for HTTP push notifications
const webhookSubscribers = new Set<string>();

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

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
    default:
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
  }
}

function handleGetFlags(req: IncomingMessage, res: ServerResponse): void {
  // ETag support for conditional requests
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch === currentEtag) {
    res.writeHead(304);
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'ETag': currentEtag,
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

  if (GIT_AUTO_PULL) {
    try {
      execSync('git pull --ff-only', { stdio: 'pipe', timeout: 10_000 });
      console.log('📥 Git pull completed');
    } catch (error) {
      console.error(`❌ Git pull failed: ${(error as Error).message}`);
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
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const { url } = JSON.parse(body);
      if (!url || typeof url !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "url" in request body' }));
        return;
      }
      webhookSubscribers.add(url);
      console.log(`📡 Webhook subscriber added: ${url} (total: ${webhookSubscribers.size})`);
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
  req.on('data', (chunk) => { body += chunk; });
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

function notifyWebhookSubscribers(): void {
  const payload = JSON.stringify({ type: 'flags-updated', etag: currentEtag, timestamp: Date.now() });
  for (const url of webhookSubscribers) {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(5000),
    }).catch((err) => {
      console.error(`❌ Webhook delivery failed for ${url}: ${err.message}`);
    });
  }
}

// Main
loadFlags();

// Watch for file changes
let debounce: ReturnType<typeof setTimeout> | undefined;
watch(FLAGS_FILE, { persistent: false }, (eventType) => {
  if (eventType === 'change' || eventType === 'rename') {
    clearTimeout(debounce);
    debounce = setTimeout(() => loadFlags(), 100);
  }
});

// HTTP server
const server = createServer(handleRequest);

// WebSocket server
const wss = new WebSocketServer(server);
wss.on('connection', (ws: WebSocket) => {
  wsClients.add(ws);
  // Send current flags on connect
  ws.send(JSON.stringify({ type: 'flags-updated', flags: currentFlags, etag: currentEtag }));
  ws.on('close', () => wsClients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`🚀 TinyFlag server running on http://localhost:${PORT}`);
  console.log(`   GET  /flags              → JSON flag config`);
  console.log(`   GET  /health             → Health check`);
  console.log(`   POST /webhook            → Trigger reload (+ git pull if GIT_AUTO_PULL=true)`);
  console.log(`   POST /webhook/subscribe  → Subscribe to flag change webhooks`);
  console.log(`   POST /webhook/unsubscribe → Unsubscribe from webhooks`);
  console.log(`   WS   ws://localhost:${PORT}  → Real-time flag updates`);
});
