import { describe, it, expect, vi } from 'vitest';
import {
  detectSourceType,
  parseSource,
  loadFromInline,
  loadFromFile,
  loadFromUrl,
} from '../loader.js';

vi.mock('fs', () => {
  const readFile = vi.fn(async (path: string) => {
    if (path === 'test-valid.yml') return 'version: 1\nflags:\n  f:\n    enabled: true';
    if (path === 'test-valid.json') return '{"version":1,"flags":{"f":{"enabled":true}}}';
    if (path === 'not-found.yml') {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    if (path === 'no-access.yml') {
      const err = new Error('EACCES') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      throw err;
    }
    throw new Error('Unknown test file');
  });
  return {
    promises: { readFile },
  };
});

describe('detectSourceType', () => {
  it('detects file source from .yml extension', () => {
    expect(detectSourceType('./flags.yml')).toBe('file');
  });

  it('detects file source from .yaml extension', () => {
    expect(detectSourceType('./flags.yaml')).toBe('file');
  });

  it('detects file source from .json extension', () => {
    expect(detectSourceType('./flags.json')).toBe('file');
  });

  it('detects URL source from https', () => {
    expect(detectSourceType('https://cdn.example.com/flags.yml')).toBe('url');
  });

  it('detects URL source from http', () => {
    expect(detectSourceType('http://cdn.example.com/flags.yml')).toBe('url');
  });

  it('detects inline source from object', () => {
    expect(detectSourceType({ flags: {} })).toBe('inline');
  });

  it('throws for unrecognized string format', () => {
    expect(() => detectSourceType('random-string')).toThrow('Unrecognized source format');
  });

  it('throws for string without valid extension', () => {
    expect(() => detectSourceType('config.txt')).toThrow('Unrecognized source format');
  });
});

describe('parseSource', () => {
  it('parses JSON content', () => {
    const result = parseSource('{"version":1,"flags":{"f":{"enabled":true}}}', 'flags.json', false);
    expect(result.config.flags.f.enabled).toBe(true);
  });

  it('parses YAML content', () => {
    const result = parseSource('version: 1\nflags:\n  f:\n    enabled: true', 'flags.yml', false);
    expect(result.config.flags.f.enabled).toBe(true);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseSource('{invalid}', 'flags.json', false)).toThrow('Failed to parse JSON');
  });

  it('throws on invalid flag schema', () => {
    expect(() =>
      parseSource('{"flags":{"bad name":{"enabled":true}}}', 'flags.json', false),
    ).toThrow('Flag validation failed');
  });

  it('returns warnings for unknown fields in lenient mode', () => {
    const result = parseSource(
      '{"flags":{"f":{"enabled":true,"custom":"x"}}}',
      'flags.json',
      false,
    );
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('loadFromInline', () => {
  it('loads valid inline config', () => {
    const result = loadFromInline({ flags: { f: { enabled: true } } }, false);
    expect(result.config.flags.f.enabled).toBe(true);
  });

  it('throws on invalid inline config', () => {
    expect(() =>
      loadFromInline({ flags: { 'bad name': { enabled: true } } } as never, false),
    ).toThrow('Inline flag config validation failed');
  });

  it('reports warnings for unknown fields', () => {
    const result = loadFromInline({ flags: { f: { enabled: true, extra: 'x' } } } as never, false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('loadFromFile', () => {
  it('loads a valid YAML file', async () => {
    const result = await loadFromFile('test-valid.yml', false);
    expect(result.config.flags.f.enabled).toBe(true);
  });

  it('loads a valid JSON file', async () => {
    const result = await loadFromFile('test-valid.json', false);
    expect(result.config.flags.f.enabled).toBe(true);
  });

  it('throws descriptive error for missing file', async () => {
    await expect(loadFromFile('not-found.yml', false)).rejects.toThrow('Flag file not found');
  });

  it('throws descriptive error for permission denied', async () => {
    await expect(loadFromFile('no-access.yml', false)).rejects.toThrow('Permission denied');
  });
});

describe('loadFromUrl', () => {
  it('loads flags from a URL', async () => {
    const mockHeaders = new Map([
      ['etag', '"abc123"'],
      ['last-modified', 'Mon, 01 Jan 2024'],
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"version":1,"flags":{"f":{"enabled":true}}}',
        headers: { get: (key: string) => mockHeaders.get(key) ?? null },
      }),
    );

    const result = await loadFromUrl('https://cdn.example.com/flags.json', false);
    expect(result.config.flags.f.enabled).toBe(true);
    expect(result.etag).toBe('"abc123"');
    expect(result.lastModified).toBe('Mon, 01 Jan 2024');

    vi.unstubAllGlobals();
  });

  it('returns notModified for 304 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 304,
        headers: { get: () => null },
      }),
    );

    const result = await loadFromUrl('https://cdn.example.com/flags.json', false, {}, '"old-etag"');
    expect(result.notModified).toBe(true);

    vi.unstubAllGlobals();
  });

  it('throws on HTTP error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
      }),
    );

    await expect(loadFromUrl('https://cdn.example.com/flags.json', false)).rejects.toThrow(
      'HTTP 500',
    );

    vi.unstubAllGlobals();
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(loadFromUrl('https://cdn.example.com/flags.json', false)).rejects.toThrow(
      'Failed to fetch',
    );

    vi.unstubAllGlobals();
  });
});
