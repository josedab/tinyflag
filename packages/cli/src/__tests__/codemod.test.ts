import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  findFlagReferences,
  transformFile,
  runCodemod,
  checkArchivedFlagRefs,
  formatCodemodDiff,
} from '../codemod.js';
import type { FlagConfig, CodemodResult } from '../codemod.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'codemod-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(name: string, content: string): string {
  const filePath = join(tmpDir, name);
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

describe('findFlagReferences', () => {
  it('finds isEnabled() references', () => {
    writeFile('app.ts', `const on = ff.isEnabled('my-flag');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].flag).toBe('my-flag');
    expect(refs[0].type).toBe('isEnabled');
    expect(refs[0].line).toBe(1);
  });

  it('finds getVariant() references', () => {
    writeFile('app.ts', `const v = flags.getVariant('checkout-v2');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].flag).toBe('checkout-v2');
    expect(refs[0].type).toBe('getVariant');
  });

  it('finds useFlag() references', () => {
    writeFile('comp.tsx', `const flag = useFlag('dark-mode');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe('useFlag');
  });

  it('finds getConfig() references', () => {
    writeFile('app.ts', `const cfg = tinyflag.getConfig('banner-config');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].type).toBe('getConfig');
  });

  it('finds multiple references across files', () => {
    writeFile('a.ts', `ff.isEnabled('flag-a');\nff.isEnabled('flag-b');`);
    writeFile('b.tsx', `useFlag('flag-c');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(3);
  });

  it('excludes node_modules directory', () => {
    writeFile('node_modules/lib.ts', `ff.isEnabled('hidden-flag');`);
    writeFile('app.ts', `ff.isEnabled('visible-flag');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].flag).toBe('visible-flag');
  });

  it('skips non-scannable file extensions', () => {
    writeFile('data.json', `{"isEnabled": "my-flag"}`);
    writeFile('app.ts', `ff.isEnabled('real-flag');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(1);
  });

  it('returns empty array for empty directory', () => {
    const refs = findFlagReferences(tmpDir);
    expect(refs).toEqual([]);
  });

  it('handles unreadable directory gracefully', () => {
    const refs = findFlagReferences('/nonexistent-path-xyz');
    expect(refs).toEqual([]);
  });

  it('finds references with featureFlags prefix', () => {
    writeFile('app.ts', `featureFlags.isEnabled('new-feature');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].flag).toBe('new-feature');
  });

  it('supports .mjs and .cjs extensions', () => {
    writeFile('lib.mjs', `ff.isEnabled('mjs-flag');`);
    writeFile('lib.cjs', `ff.isEnabled('cjs-flag');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs).toHaveLength(2);
  });

  it('reports correct column position', () => {
    writeFile('app.ts', `    ff.isEnabled('my-flag');`);
    const refs = findFlagReferences(tmpDir);
    expect(refs[0].column).toBe(5);
  });

  it('handles custom exclude dirs', () => {
    writeFile('custom-excluded/file.ts', `ff.isEnabled('hidden');`);
    writeFile('app.ts', `ff.isEnabled('visible');`);
    const refs = findFlagReferences(tmpDir, new Set(['custom-excluded']));
    expect(refs).toHaveLength(1);
    expect(refs[0].flag).toBe('visible');
  });
});

describe('transformFile', () => {
  it('replaces archived flag isEnabled with false', () => {
    const filePath = writeFile('app.ts', `if (ff.isEnabled('old-flag')) { doStuff(); }`);
    const config: FlagConfig = {
      flags: {
        'old-flag': { enabled: false, lifecycle: { state: 'archived' } },
      },
    } as FlagConfig;

    const result = transformFile(filePath, config);
    expect(result).not.toBeNull();
    expect(result!.changes).toHaveLength(1);
    expect(result!.changes[0].type).toBe('remove-branch');
    expect(result!.changes[0].after).toContain('false');
    // File should be written
    expect(readFileSync(filePath, 'utf-8')).toContain('false');
  });

  it('replaces fully rolled-out flag isEnabled with true', () => {
    const filePath = writeFile('app.ts', `if (flags.isEnabled('active-flag')) {}`);
    const config: FlagConfig = {
      flags: {
        'active-flag': { enabled: true, rollout: 100 },
      },
    } as FlagConfig;

    const result = transformFile(filePath, config);
    expect(result).not.toBeNull();
    expect(result!.changes[0].after).toContain('true');
  });

  it('replaces getVariant with winner variant string', () => {
    const filePath = writeFile('app.ts', `const v = ff.getVariant('ab-test');`);
    const config: FlagConfig = { flags: {} } as FlagConfig;
    const winners = new Map([['ab-test', 'variant-b']]);

    const result = transformFile(filePath, config, { winnerVariants: winners });
    expect(result).not.toBeNull();
    expect(result!.changes[0].type).toBe('replace-variant');
    expect(result!.changes[0].after).toContain("'variant-b'");
  });

  it('does not modify file in dry run mode', () => {
    const original = `if (ff.isEnabled('old-flag')) {}`;
    const filePath = writeFile('app.ts', original);
    const config: FlagConfig = {
      flags: { 'old-flag': { enabled: false, lifecycle: { state: 'archived' } } },
    } as FlagConfig;

    const result = transformFile(filePath, config, { dryRun: true });
    expect(result).not.toBeNull();
    expect(readFileSync(filePath, 'utf-8')).toBe(original);
  });

  it('returns null when no changes needed', () => {
    const filePath = writeFile('app.ts', `console.log('no flags here');`);
    const config: FlagConfig = {
      flags: { 'other-flag': { enabled: false, lifecycle: { state: 'archived' } } },
    } as FlagConfig;

    const result = transformFile(filePath, config);
    expect(result).toBeNull();
  });

  it('returns null for unreadable file', () => {
    const config: FlagConfig = { flags: {} } as FlagConfig;
    const result = transformFile('/nonexistent-file.ts', config);
    expect(result).toBeNull();
  });

  it('handles flag names with regex special characters', () => {
    const filePath = writeFile('app.ts', `ff.isEnabled('my-flag');`);
    const config: FlagConfig = {
      flags: { 'my-flag': { enabled: false, lifecycle: { state: 'archived' } } },
    } as FlagConfig;

    const result = transformFile(filePath, config);
    expect(result).not.toBeNull();
  });

  it('handles fully rolled out flag without explicit rollout field', () => {
    const filePath = writeFile('app.ts', `if (ff.isEnabled('simple-flag')) {}`);
    const config: FlagConfig = {
      flags: { 'simple-flag': { enabled: true } },
    } as FlagConfig;

    const result = transformFile(filePath, config);
    expect(result).not.toBeNull();
    expect(result!.changes[0].after).toContain('true');
  });

  it('does not treat flag with rules as fully rolled out', () => {
    const filePath = writeFile('app.ts', `if (ff.isEnabled('ruled-flag')) {}`);
    const config: FlagConfig = {
      flags: { 'ruled-flag': { enabled: true, rules: [{ conditions: { plan: 'pro' } }] } },
    } as FlagConfig;

    const result = transformFile(filePath, config);
    expect(result).toBeNull();
  });

  it('handles multiple changes on different lines', () => {
    const filePath = writeFile(
      'app.ts',
      `ff.isEnabled('flag-a');\nff.isEnabled('flag-b');`,
    );
    const config: FlagConfig = {
      flags: {
        'flag-a': { enabled: false, lifecycle: { state: 'archived' } },
        'flag-b': { enabled: true },
      },
    } as FlagConfig;

    const result = transformFile(filePath, config);
    expect(result).not.toBeNull();
    expect(result!.changes.length).toBe(2);
  });

  it('handles isEnabled with extra context argument', () => {
    const filePath = writeFile('app.ts', `ff.isEnabled('old-flag', { userId: '123' })`);
    const config: FlagConfig = {
      flags: { 'old-flag': { enabled: false, lifecycle: { state: 'archived' } } },
    } as FlagConfig;

    const result = transformFile(filePath, config);
    expect(result).not.toBeNull();
    expect(result!.changes[0].after).toContain('false');
  });
});

describe('runCodemod', () => {
  it('transforms files across a directory', () => {
    writeFile('a.ts', `ff.isEnabled('archived-flag');`);
    writeFile('sub/b.ts', `flags.isEnabled('archived-flag');`);
    const config: FlagConfig = {
      flags: { 'archived-flag': { enabled: false, lifecycle: { state: 'archived' } } },
    } as FlagConfig;

    const results = runCodemod(tmpDir, config);
    expect(results).toHaveLength(2);
  });

  it('respects archivedOnly option', () => {
    writeFile('app.ts', `ff.isEnabled('active-flag');\nff.isEnabled('old-flag');`);
    const config: FlagConfig = {
      flags: {
        'active-flag': { enabled: true },
        'old-flag': { enabled: false, lifecycle: { state: 'archived' } },
      },
    } as FlagConfig;

    const results = runCodemod(tmpDir, config, { archivedOnly: true });
    expect(results).toHaveLength(1);
    expect(results[0].changes).toHaveLength(1);
    expect(results[0].changes[0].description).toContain('old-flag');
  });

  it('supports dry run mode', () => {
    const filePath = writeFile('app.ts', `ff.isEnabled('archived-flag');`);
    const original = readFileSync(filePath, 'utf-8');
    const config: FlagConfig = {
      flags: { 'archived-flag': { enabled: false, lifecycle: { state: 'archived' } } },
    } as FlagConfig;

    const results = runCodemod(tmpDir, config, { dryRun: true });
    expect(results).toHaveLength(1);
    expect(readFileSync(filePath, 'utf-8')).toBe(original);
  });

  it('returns empty array for empty directory', () => {
    const config: FlagConfig = { flags: {} } as FlagConfig;
    const results = runCodemod(tmpDir, config);
    expect(results).toEqual([]);
  });

  it('handles nonexistent directory gracefully', () => {
    const config: FlagConfig = { flags: {} } as FlagConfig;
    const results = runCodemod('/nonexistent-dir-xyz', config);
    expect(results).toEqual([]);
  });

  it('passes winner variants through', () => {
    writeFile('app.ts', `const v = ff.getVariant('experiment');`);
    const config: FlagConfig = { flags: {} } as FlagConfig;
    const winners = new Map([['experiment', 'winner']]);

    const results = runCodemod(tmpDir, config, { winnerVariants: winners });
    expect(results).toHaveLength(1);
    expect(results[0].changes[0].type).toBe('replace-variant');
  });
});

describe('checkArchivedFlagRefs', () => {
  it('returns clean when no archived flags exist', () => {
    writeFile('app.ts', `ff.isEnabled('active-flag');`);
    const config: FlagConfig = {
      flags: { 'active-flag': { enabled: true } },
    } as FlagConfig;

    const result = checkArchivedFlagRefs(tmpDir, config);
    expect(result.clean).toBe(true);
    expect(result.staleRefs).toEqual([]);
  });

  it('detects stale references to archived flags', () => {
    writeFile('app.ts', `ff.isEnabled('dead-flag');`);
    const config: FlagConfig = {
      flags: { 'dead-flag': { enabled: false, lifecycle: { state: 'archived' } } },
    } as FlagConfig;

    const result = checkArchivedFlagRefs(tmpDir, config);
    expect(result.clean).toBe(false);
    expect(result.staleRefs).toHaveLength(1);
    expect(result.staleRefs[0].flag).toBe('dead-flag');
  });

  it('returns clean when archived flags have no code refs', () => {
    writeFile('app.ts', `ff.isEnabled('active-flag');`);
    const config: FlagConfig = {
      flags: {
        'active-flag': { enabled: true },
        'dead-flag': { enabled: false, lifecycle: { state: 'archived' } },
      },
    } as FlagConfig;

    const result = checkArchivedFlagRefs(tmpDir, config);
    expect(result.clean).toBe(true);
  });
});

describe('formatCodemodDiff', () => {
  it('returns no-changes message for empty results', () => {
    const output = formatCodemodDiff([], tmpDir);
    expect(output).toContain('No changes needed');
  });

  it('formats single file with one change', () => {
    const results: CodemodResult[] = [
      {
        file: join(tmpDir, 'app.ts'),
        original: '',
        transformed: '',
        changes: [
          { line: 5, type: 'remove-branch', description: 'Replace archived flag', before: 'old', after: 'new' },
        ],
      },
    ];

    const output = formatCodemodDiff(results, tmpDir);
    expect(output).toContain('1 change(s)');
    expect(output).toContain('1 file(s)');
    expect(output).toContain('app.ts');
    expect(output).toContain('L5');
  });

  it('formats multiple files with multiple changes', () => {
    const results: CodemodResult[] = [
      {
        file: join(tmpDir, 'a.ts'),
        original: '',
        transformed: '',
        changes: [
          { line: 1, type: 'remove-branch', description: 'd1', before: 'b1', after: 'a1' },
          { line: 2, type: 'replace-variant', description: 'd2', before: 'b2', after: 'a2' },
        ],
      },
      {
        file: join(tmpDir, 'b.ts'),
        original: '',
        transformed: '',
        changes: [
          { line: 10, type: 'remove-call', description: 'd3', before: 'b3', after: 'a3' },
        ],
      },
    ];

    const output = formatCodemodDiff(results, tmpDir);
    expect(output).toContain('3 change(s)');
    expect(output).toContain('2 file(s)');
  });

  it('shows plural changes label correctly', () => {
    const results: CodemodResult[] = [
      {
        file: join(tmpDir, 'a.ts'),
        original: '',
        transformed: '',
        changes: [
          { line: 1, type: 'remove-branch', description: 'd', before: 'b', after: 'a' },
          { line: 2, type: 'remove-branch', description: 'd', before: 'b', after: 'a' },
        ],
      },
    ];

    const output = formatCodemodDiff(results, tmpDir);
    expect(output).toContain('2 changes');
  });
});
