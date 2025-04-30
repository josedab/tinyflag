import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock @pulumi/pulumi before importing the module
vi.mock('@pulumi/pulumi', () => {
  function createOutput<T>(val: T) {
    return {
      __value: val,
      apply(fn: (v: T) => unknown) { return createOutput(fn(val)); },
    };
  }

  function outputFn<T>(val: T) {
    return createOutput(val);
  }

  const allFn = (inputs: unknown[]) => ({
    apply(fn: (resolved: unknown[]) => unknown) {
      const resolved = inputs.map((i: any) => i?.__value !== undefined ? i.__value : i);
      return fn(resolved);
    },
  });

  class ComponentResource {
    constructor(_type: string, _name: string, _args: unknown, _opts?: unknown) {}
    registerOutputs(_outputs: Record<string, unknown>) {}
  }

  return {
    ComponentResource,
    output: outputFn,
    all: allFn,
    default: { ComponentResource, output: outputFn, all: allFn },
  };
});

describe('@tinyflag/pulumi', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `tinyflag-pulumi-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'flags.json');
  });

  afterEach(() => {
    try {
      if (existsSync(testFile)) unlinkSync(testFile);
    } catch { /* cleanup */ }
  });

  describe('TinyFlag resource creation', () => {
    it('creates a new flag in a new file', async () => {
      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('test-flag', {
        name: 'test-flag',
        enabled: true,
        description: 'A test flag',
        flagsFile: testFile,
      });

      expect(existsSync(testFile)).toBe(true);
      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content.version).toBe(1);
      expect(content.flags['test-flag']).toBeDefined();
      expect(content.flags['test-flag'].enabled).toBe(true);
      expect(content.flags['test-flag'].description).toBe('A test flag');
    });

    it('creates a flag with rollout percentage', async () => {
      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('rollout-flag', {
        name: 'rollout-flag',
        enabled: true,
        rollout: 50,
        flagsFile: testFile,
      });

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content.flags['rollout-flag'].rollout).toBe(50);
    });

    it('creates a flag with tags', async () => {
      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('tagged-flag', {
        name: 'tagged-flag',
        enabled: false,
        tags: ['experiment', 'checkout'],
        flagsFile: testFile,
      });

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content.flags['tagged-flag'].tags).toEqual(['experiment', 'checkout']);
      expect(content.flags['tagged-flag'].enabled).toBe(false);
    });

    it('creates a disabled flag with minimal fields', async () => {
      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('minimal-flag', {
        name: 'minimal-flag',
        enabled: false,
        flagsFile: testFile,
      });

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content.flags['minimal-flag']).toEqual({ enabled: false });
    });
  });

  describe('CRUD operations', () => {
    it('adds a flag to an existing file', async () => {
      const existing = { version: 1, flags: { 'old-flag': { enabled: true } } };
      writeFileSync(testFile, JSON.stringify(existing), 'utf-8');

      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('new-flag', {
        name: 'new-flag',
        enabled: true,
        flagsFile: testFile,
      });

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content.flags['old-flag']).toBeDefined();
      expect(content.flags['new-flag']).toBeDefined();
    });

    it('overwrites an existing flag definition', async () => {
      const existing = {
        version: 1,
        flags: { 'my-flag': { enabled: false, description: 'old' } },
      };
      writeFileSync(testFile, JSON.stringify(existing), 'utf-8');

      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('my-flag', {
        name: 'my-flag',
        enabled: true,
        description: 'updated',
        flagsFile: testFile,
      });

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content.flags['my-flag'].enabled).toBe(true);
      expect(content.flags['my-flag'].description).toBe('updated');
    });
  });

  describe('JSON serialization', () => {
    it('writes valid JSON with indentation', async () => {
      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('formatted-flag', {
        name: 'formatted-flag',
        enabled: true,
        flagsFile: testFile,
      });

      const raw = readFileSync(testFile, 'utf-8');
      expect(() => JSON.parse(raw)).not.toThrow();
      // Should be indented (pretty-printed)
      expect(raw).toContain('\n');
    });

    it('preserves version field', async () => {
      const existing = { version: 1, flags: {} };
      writeFileSync(testFile, JSON.stringify(existing), 'utf-8');

      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('versioned-flag', {
        name: 'versioned-flag',
        enabled: true,
        flagsFile: testFile,
      });

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content.version).toBe(1);
    });
  });

  describe('error handling', () => {
    it('handles corrupted flags file gracefully', async () => {
      writeFileSync(testFile, 'not valid json{{{', 'utf-8');

      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('recovery-flag', {
        name: 'recovery-flag',
        enabled: true,
        flagsFile: testFile,
      });

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(content.version).toBe(1);
      expect(content.flags['recovery-flag'].enabled).toBe(true);
    });

    it('creates file when it does not exist', async () => {
      const nonExistentFile = join(testDir, 'new-flags.json');

      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('fresh-flag', {
        name: 'fresh-flag',
        enabled: true,
        flagsFile: nonExistentFile,
      });

      expect(existsSync(nonExistentFile)).toBe(true);
      const content = JSON.parse(readFileSync(nonExistentFile, 'utf-8'));
      expect(content.flags['fresh-flag'].enabled).toBe(true);

      // cleanup
      try { unlinkSync(nonExistentFile); } catch { /* */ }
    });

    it('handles multiple flags in sequence', async () => {
      const { TinyFlag } = await import('../src/index.js');

      new TinyFlag('flag-1', {
        name: 'flag-1',
        enabled: true,
        flagsFile: testFile,
      });

      new TinyFlag('flag-2', {
        name: 'flag-2',
        enabled: false,
        description: 'second flag',
        flagsFile: testFile,
      });

      const content = JSON.parse(readFileSync(testFile, 'utf-8'));
      expect(Object.keys(content.flags)).toHaveLength(2);
      expect(content.flags['flag-1'].enabled).toBe(true);
      expect(content.flags['flag-2'].enabled).toBe(false);
    });
  });
});
