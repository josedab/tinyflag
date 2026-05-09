import { afterEach, describe, expect, it } from 'vitest';
import {
  createTinyFlagServer,
  type TinyFlagServer,
  type TinyFlagServerDependencies,
  type TinyFlagServerOptions,
} from '../runtime.js';

interface Harness {
  app: TinyFlagServer;
  baseUrl: string;
  setFlags(enabled: boolean): void;
  outboundRequests: Array<{ input: string; init?: RequestInit }>;
  execCalls: string[];
}

const activeApps: TinyFlagServer[] = [];

afterEach(async () => {
  await Promise.all(activeApps.splice(0).map((app) => app.close()));
});

describe('server runtime', () => {
  it('serves flags, readiness, CORS, and conditional requests', async () => {
    const harness = await startHarness();

    const preflight = await fetch(`${harness.baseUrl}/flags`, { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');

    const ready = await fetch(`${harness.baseUrl}/ready`);
    expect(ready.status).toBe(200);

    const flags = await fetch(`${harness.baseUrl}/flags`);
    expect(flags.status).toBe(200);
    expect(await flags.json()).toEqual({
      version: 1,
      flags: { 'runtime-flag': { enabled: true } },
    });

    const etag = flags.headers.get('etag');
    const cached = await fetch(`${harness.baseUrl}/flags`, {
      headers: { 'If-None-Match': etag ?? '' },
    });
    expect(cached.status).toBe(304);
  });

  it('enforces bearer authentication while leaving health public', async () => {
    const harness = await startHarness({ token: 'secret' });

    expect((await fetch(`${harness.baseUrl}/health`)).status).toBe(200);
    expect((await fetch(`${harness.baseUrl}/flags`)).status).toBe(401);
    expect(
      (
        await fetch(`${harness.baseUrl}/flags`, {
          headers: { Authorization: 'Bearer secret' },
        })
      ).status,
    ).toBe(200);
  });

  it('applies rate limiting outside health endpoints', async () => {
    const harness = await startHarness({ rateLimit: 1 });

    expect((await fetch(`${harness.baseUrl}/flags`)).status).toBe(200);
    const limited = await fetch(`${harness.baseUrl}/flags`);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect((await fetch(`${harness.baseUrl}/health`)).status).toBe(200);
  });

  it('reloads flags and runs git pull through the injected executor', async () => {
    const harness = await startHarness({ gitAutoPull: true });
    harness.setFlags(false);

    const response = await fetch(`${harness.baseUrl}/webhook`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(harness.execCalls).toContain('git pull --ff-only');

    const flags = await fetch(`${harness.baseUrl}/flags`);
    expect(await flags.json()).toEqual({
      version: 1,
      flags: { 'runtime-flag': { enabled: false } },
    });
  });

  it('subscribes, notifies, and unsubscribes webhook endpoints', async () => {
    const harness = await startHarness();

    const subscribe = await fetch(`${harness.baseUrl}/webhook/subscribe`, {
      method: 'POST',
      body: JSON.stringify({ url: 'https://hooks.example.test/tinyflag' }),
    });
    expect(subscribe.status).toBe(200);

    await fetch(`${harness.baseUrl}/webhook`, { method: 'POST' });
    await waitFor(() => harness.outboundRequests.length === 1);
    expect(harness.outboundRequests[0].input).toBe('https://hooks.example.test/tinyflag');

    const unsubscribe = await fetch(`${harness.baseUrl}/webhook/unsubscribe`, {
      method: 'POST',
      body: JSON.stringify({ url: 'https://hooks.example.test/tinyflag' }),
    });
    expect(unsubscribe.status).toBe(200);

    await fetch(`${harness.baseUrl}/webhook`, { method: 'POST' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(harness.outboundRequests).toHaveLength(1);
  });

  it('rejects invalid subscription bodies and oversized requests', async () => {
    const harness = await startHarness({ maxBodySize: 16 });

    const invalid = await fetch(`${harness.baseUrl}/webhook/subscribe`, {
      method: 'POST',
      body: '{',
    });
    expect(invalid.status).toBe(400);

    const oversized = await fetch(`${harness.baseUrl}/webhook/subscribe`, {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.test/' + 'x'.repeat(100) }),
    });
    expect(oversized.status).toBe(413);
  });

  it('preserves tenant route fallback behavior', async () => {
    const harness = await startHarness({ multiTenant: true });

    const response = await fetch(`${harness.baseUrl}/t/acme/flags`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: 1,
      flags: { 'runtime-flag': { enabled: true } },
    });
  });

  it('returns collaboration presence and history from production state', async () => {
    const harness = await startHarness();

    const presence = await fetch(`${harness.baseUrl}/collab/presence`);
    expect(await presence.json()).toEqual({ sessions: [] });

    const history = await fetch(`${harness.baseUrl}/collab/history?limit=3`);
    expect(await history.json()).toEqual({ operations: [] });
  });
});

async function startHarness(options: TinyFlagServerOptions = {}): Promise<Harness> {
  let clock = 1_000;
  let flagContent = createFlagContent(true);
  const outboundRequests: Harness['outboundRequests'] = [];
  const execCalls: string[] = [];

  const dependencies: Partial<TinyFlagServerDependencies> = {
    now: () => ++clock,
    exists: () => true,
    readFile: () => flagContent,
    watchFile: () => ({ close() {} }),
    exec: (command) => {
      execCalls.push(command);
      return 'deadbeef';
    },
    fetch: async (input, init) => {
      outboundRequests.push({ input: String(input), init });
      return new Response(null, { status: 204 });
    },
  };

  const app = createTinyFlagServer({ port: 0, flagsFile: 'flags.json', ...options }, dependencies);
  activeApps.push(app);
  const port = await app.listen();

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
    setFlags(enabled) {
      flagContent = createFlagContent(enabled);
    },
    outboundRequests,
    execCalls,
  };
}

function createFlagContent(enabled: boolean): string {
  return JSON.stringify({
    version: 1,
    flags: {
      'runtime-flag': { enabled },
    },
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for asynchronous server work');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
