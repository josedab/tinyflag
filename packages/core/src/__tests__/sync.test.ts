import { describe, it, expect, vi, beforeEach } from 'vitest';
import { threeWayMerge, pullFlags, pushFlags, readSyncMeta, writeSyncMeta } from '../sync.js';
import type { SyncMeta } from '../sync.js';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => {
  const store: Record<string, string> = {};
  return {
    readFileSync: vi.fn((path: string) => {
      if (store[path] !== undefined) return store[path];
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }),
    writeFileSync: vi.fn((path: string, content: string) => {
      store[path] = content;
    }),
    existsSync: vi.fn((path: string) => store[path] !== undefined),
    _getStore: () => store,
  };
});

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function getStore(): Record<string, string> {
  return (fs as any)._getStore();
}

describe('sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = getStore();
    for (const key of Object.keys(store)) delete store[key];
    mockFetch.mockReset();
  });

  describe('threeWayMerge', () => {
    it('merges when only local changed', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nchanged\nline3';
      const remote = 'line1\nline2\nline3';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('line1\nchanged\nline3');
    });

    it('merges when only remote changed', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nline2\nline3';
      const remote = 'line1\nremote-change\nline3';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('line1\nremote-change\nline3');
    });

    it('merges when both changed the same way', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nsame\nline3';
      const remote = 'line1\nsame\nline3';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('line1\nsame\nline3');
    });

    it('detects conflicts when both changed differently', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nlocal-val\nline3';
      const remote = 'line1\nremote-val\nline3';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(merged).toBeNull();
    });

    it('handles different-length files', () => {
      const base = 'a\nb';
      const local = 'a\nb\nc';
      const remote = 'a\nb';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('a\nb\nc');
    });

    it('detects conflict when all lines changed differently', () => {
      const base = 'a\nb\nc';
      const local = 'x\ny\nz';
      const remote = 'p\nq\nr';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(3);
      expect(merged).toBeNull();
    });

    it('handles empty base', () => {
      const { merged, conflicts } = threeWayMerge('', 'new-local', 'new-remote');
      // Both changed from empty — conflict
      expect(conflicts.length).toBeGreaterThan(0);
    });

    it('handles empty local and remote', () => {
      const { merged, conflicts } = threeWayMerge('original', '', '');
      // Both agree on empty
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('');
    });

    it('handles local insertion with remote unchanged', () => {
      const base = 'a\nb';
      const local = 'a\nb\nnew-line';
      const remote = 'a\nb';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('a\nb\nnew-line');
    });

    it('handles remote insertion with local unchanged', () => {
      const base = 'a\nb';
      const local = 'a\nb';
      const remote = 'a\nb\nremote-new';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('a\nb\nremote-new');
    });

    it('conflict message includes line number', () => {
      const base = 'a';
      const local = 'x';
      const remote = 'y';
      const { conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts[0]).toContain('Line 1');
    });
  });

  describe('pullFlags', () => {
    it('creates new file when it does not exist', async () => {
      const content = 'version: 1\nflags:\n  f:\n    enabled: true';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => content,
        headers: { get: (n: string) => (n === 'etag' ? '"v1"' : null) },
      });

      const result = await pullFlags('https://example.com/flags.yml', '/tmp/flags.yml');
      expect(result.status).toBe('created');
      expect(result.etag).toBe('"v1"');
    });

    it('returns not-modified on 304', async () => {
      const store = getStore();
      store['/tmp/flags.yml'] = 'existing';
      store['/tmp/flags.yml.tinyflag-sync'] = JSON.stringify({
        url: 'https://example.com/flags.yml',
        etag: '"v1"',
        pulledAt: '2025-01-01',
        contentHash: 'abc',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 304,
        statusText: 'Not Modified',
        headers: { get: () => null },
      });

      const result = await pullFlags('https://example.com/flags.yml', '/tmp/flags.yml');
      expect(result.status).toBe('not-modified');
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: { get: () => null },
      });

      await expect(pullFlags('https://example.com/flags.yml', '/tmp/flags.yml')).rejects.toThrow(
        'HTTP 500',
      );
    });

    it('returns updated when file already exists', async () => {
      const store = getStore();
      store['/tmp/flags.yml'] = 'old content';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => 'new content',
        headers: { get: () => null },
      });

      const result = await pullFlags('https://example.com/flags.yml', '/tmp/flags.yml');
      expect(result.status).toBe('updated');
    });

    it('sends If-None-Match header when etag exists and not force', async () => {
      const store = getStore();
      store['/tmp/flags.yml.tinyflag-sync'] = JSON.stringify({
        url: 'u',
        etag: '"old"',
        pulledAt: 'x',
        contentHash: 'x',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'content',
        headers: { get: () => null },
      });

      await pullFlags('https://example.com/flags.yml', '/tmp/flags.yml');
      expect(mockFetch.mock.calls[0][1].headers['If-None-Match']).toBe('"old"');
    });

    it('skips If-None-Match when force is true', async () => {
      const store = getStore();
      store['/tmp/flags.yml.tinyflag-sync'] = JSON.stringify({
        url: 'u',
        etag: '"old"',
        pulledAt: 'x',
        contentHash: 'x',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'content',
        headers: { get: () => null },
      });

      await pullFlags('https://example.com/flags.yml', '/tmp/flags.yml', { force: true });
      expect(mockFetch.mock.calls[0][1].headers['If-None-Match']).toBeUndefined();
    });
  });

  describe('pushFlags', () => {
    it('pushes file content to URL', async () => {
      const store = getStore();
      store['/tmp/flags.yml'] = 'flag-content';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: (n: string) => (n === 'etag' ? '"new"' : null) },
      });

      const result = await pushFlags('https://example.com/flags', '/tmp/flags.yml');
      expect(result.status).toBe('pushed');
      expect(result.etag).toBe('"new"');
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
      expect(mockFetch.mock.calls[0][1].body).toBe('flag-content');
    });

    it('returns conflict on 412', async () => {
      const store = getStore();
      store['/tmp/flags.yml'] = 'content';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 412,
        statusText: 'Precondition Failed',
        headers: { get: () => null },
      });

      const result = await pushFlags('https://example.com/flags', '/tmp/flags.yml');
      expect(result.status).toBe('conflict');
    });

    it('throws on non-412 error', async () => {
      const store = getStore();
      store['/tmp/flags.yml'] = 'content';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        headers: { get: () => null },
      });

      await expect(pushFlags('https://example.com/flags', '/tmp/flags.yml')).rejects.toThrow(
        'HTTP 500',
      );
    });

    it('sends If-Match header with etag', async () => {
      const store = getStore();
      store['/tmp/flags.yml'] = 'content';
      store['/tmp/flags.yml.tinyflag-sync'] = JSON.stringify({
        url: 'u',
        etag: '"v1"',
        pulledAt: 'x',
        contentHash: 'x',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
      });

      await pushFlags('https://example.com/flags', '/tmp/flags.yml');
      expect(mockFetch.mock.calls[0][1].headers['If-Match']).toBe('"v1"');
    });
  });

  describe('readSyncMeta / writeSyncMeta', () => {
    it('returns null when meta file does not exist', () => {
      expect(readSyncMeta('/tmp/no-file.yml')).toBeNull();
    });

    it('writes and reads meta', () => {
      const meta: SyncMeta = {
        url: 'https://example.com/flags',
        etag: '"v1"',
        pulledAt: '2025-01-01',
        contentHash: 'abc',
      };
      writeSyncMeta('/tmp/test.yml', meta);
      const read = readSyncMeta('/tmp/test.yml');
      expect(read).toEqual(meta);
    });

    it('returns null for corrupted JSON in meta file', () => {
      const store = getStore();
      store['/tmp/corrupt.yml.tinyflag-sync'] = '{not valid json!!!';
      expect(readSyncMeta('/tmp/corrupt.yml')).toBeNull();
    });

    it('returns null for empty meta file', () => {
      const store = getStore();
      store['/tmp/empty.yml.tinyflag-sync'] = '';
      expect(readSyncMeta('/tmp/empty.yml')).toBeNull();
    });

    it('returns parsed SyncMeta for valid JSON', () => {
      const meta: SyncMeta = {
        url: 'https://example.com/flags',
        etag: '"v2"',
        pulledAt: '2025-06-01',
        contentHash: 'def',
      };
      const store = getStore();
      store['/tmp/valid.yml.tinyflag-sync'] = JSON.stringify(meta);
      const read = readSyncMeta('/tmp/valid.yml');
      expect(read).toEqual(meta);
    });
  });
});
