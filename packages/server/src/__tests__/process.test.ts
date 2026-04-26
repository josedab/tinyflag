import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessByStdio } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import type { Readable } from 'stream';

const serverEntry = resolve(process.cwd(), 'dist/index.js');
type ServerProcess = ChildProcessByStdio<null, Readable, Readable>;

describe('server process', () => {
  let child: ServerProcess;
  let tempDir: string;
  let flagsFile: string;
  let baseUrl: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'tinyflag-server-process-'));
    flagsFile = join(tempDir, 'flags.json');
    writeFlags(true);

    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [serverEntry], {
      cwd: tempDir,
      env: {
        ...process.env,
        FLAGS_FILE: flagsFile,
        PORT: String(port),
        TINYFLAG_TOKEN: 'test-token',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitUntilReady();
  }, 15_000);

  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([waitForExit(child), delay(1_000)]);
      if (child.exitCode === null) {
        child.kill('SIGKILL');
        await waitForExit(child);
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves health without authentication', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        status: 'ok',
        flagCount: 1,
      }),
    );
  });

  it('protects flag reads and supports ETags', async () => {
    const unauthorized = await fetch(`${baseUrl}/flags`);
    expect(unauthorized.status).toBe(401);

    const first = await fetch(`${baseUrl}/flags`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      version: 1,
      flags: { 'process-flag': { enabled: true } },
    });

    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const cached = await fetch(`${baseUrl}/flags`, {
      headers: {
        Authorization: 'Bearer test-token',
        'If-None-Match': etag ?? '',
      },
    });
    expect(cached.status).toBe(304);
  });

  it('reloads the configured file through the webhook endpoint', async () => {
    writeFlags(false);

    const reload = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(reload.status).toBe(200);

    const flags = await fetch(`${baseUrl}/flags`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(await flags.json()).toEqual({
      version: 1,
      flags: { 'process-flag': { enabled: false } },
    });
  });

  function writeFlags(enabled: boolean): void {
    writeFileSync(
      flagsFile,
      JSON.stringify({
        version: 1,
        flags: {
          'process-flag': { enabled },
        },
      }),
    );
  }

  async function waitUntilReady(): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(
          `Server exited before becoming ready\nstdout: ${child.stdout.read() ?? ''}\nstderr: ${child.stderr.read() ?? ''}`,
        );
      }
      try {
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok) return;
      } catch {
        // Retry until the process starts listening.
      }
      await delay(50);
    }
    throw new Error('Server did not become ready');
  }
});

async function getFreePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to allocate a server port');
  }
  await new Promise<void>((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function waitForExit(child: ServerProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
