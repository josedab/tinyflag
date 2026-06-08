import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanFlagUsage, generateStaleReport, formatStaleReport } from '../stale.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP_DIR = join(tmpdir(), `tinyflag-stale-test-${Date.now()}`);

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });

  // Create source files with flag references
  mkdirSync(join(TMP_DIR, 'src'), { recursive: true });
  writeFileSync(join(TMP_DIR, 'src', 'app.ts'), [
    'import { ff } from "./flags";',
    'if (ff.isEnabled("dark-mode")) {',
    '  console.log("dark");',
    '}',
    'const v = ff.getVariant("checkout-v2");',
  ].join('\n'));

  writeFileSync(join(TMP_DIR, 'src', 'other.tsx'), [
    'const enabled = ff.isEnabled("beta-features");',
    '// tinyflag-ignore',
    'ff.isEnabled("ignored-flag");',
    'ff.isEnabled("inline-ignored"); // tinyflag-ignore',
  ].join('\n'));

  // Create files in excluded directories
  mkdirSync(join(TMP_DIR, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(TMP_DIR, 'node_modules', 'pkg', 'index.js'),
    'ff.isEnabled("should-not-scan");',
  );

  mkdirSync(join(TMP_DIR, 'dist'), { recursive: true });
  writeFileSync(join(TMP_DIR, 'dist', 'app.js'),
    'ff.isEnabled("should-not-scan-dist");',
  );

  // Create a non-scannable file
  writeFileSync(join(TMP_DIR, 'src', 'data.json'), '{"key": "value"}');

  // Create an unreadable directory scenario by not having it (tested via walk's catch)
});

afterAll(() => {
  try {
    rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
});

describe('scanFlagUsage', () => {
  it('finds isEnabled and getVariant references in .ts/.tsx files', () => {
    const usages = scanFlagUsage(TMP_DIR);

    expect(usages.has('dark-mode')).toBe(true);
    expect(usages.has('checkout-v2')).toBe(true);
    expect(usages.has('beta-features')).toBe(true);
  });

  it('records file path and line number', () => {
    const usages = scanFlagUsage(TMP_DIR);
    const darkMode = usages.get('dark-mode')!;
    expect(darkMode.length).toBe(1);
    expect(darkMode[0].file).toContain('app.ts');
    expect(darkMode[0].line).toBe(2);
  });

  it('skips node_modules and dist by default', () => {
    const usages = scanFlagUsage(TMP_DIR);
    expect(usages.has('should-not-scan')).toBe(false);
    expect(usages.has('should-not-scan-dist')).toBe(false);
  });

  it('respects tinyflag-ignore on previous line', () => {
    const usages = scanFlagUsage(TMP_DIR);
    expect(usages.has('ignored-flag')).toBe(false);
  });

  it('respects tinyflag-ignore on same line', () => {
    const usages = scanFlagUsage(TMP_DIR);
    expect(usages.has('inline-ignored')).toBe(false);
  });

  it('does not scan non-scannable extensions', () => {
    const usages = scanFlagUsage(TMP_DIR);
    // .json files should not be scanned
    expect([...usages.keys()].some(k => k === 'key')).toBe(false);
  });

  it('handles unreadable directories gracefully', () => {
    const usages = scanFlagUsage('/nonexistent-dir-xyz');
    expect(usages.size).toBe(0);
  });

  it('allows custom excludeDirs', () => {
    // Exclude 'src' instead of 'node_modules'
    const usages = scanFlagUsage(TMP_DIR, new Set(['src']));
    expect(usages.has('dark-mode')).toBe(false);
  });
});

describe('generateStaleReport', () => {
  it('identifies unused flags', () => {
    const defined = {
      'dark-mode': { enabled: true },
      'checkout-v2': { enabled: true },
      'unused-flag': { enabled: true },
    };
    const usages = new Map([
      ['dark-mode', [{ file: 'a.ts', line: 1 }]],
      ['checkout-v2', [{ file: 'a.ts', line: 2 }]],
    ]);

    const report = generateStaleReport(defined, usages);
    expect(report.unusedFlags).toContain('unused-flag');
    expect(report.unusedFlags).not.toContain('dark-mode');
  });

  it('identifies undefined references', () => {
    const defined = { 'dark-mode': { enabled: true } };
    const usages = new Map([
      ['dark-mode', [{ file: 'a.ts', line: 1 }]],
      ['nonexistent', [{ file: 'b.ts', line: 5 }]],
    ]);

    const report = generateStaleReport(defined, usages);
    expect(report.undefinedRefs).toHaveLength(1);
    expect(report.undefinedRefs[0].flag).toBe('nonexistent');
    expect(report.undefinedRefs[0].file).toBe('b.ts');
    expect(report.undefinedRefs[0].line).toBe(5);
  });

  it('identifies zero-rollout enabled flags', () => {
    const defined = {
      'active': { enabled: true, rollout: 50 },
      'zero-roll': { enabled: true, rollout: 0 },
      'disabled-zero': { enabled: false, rollout: 0 },
    };
    const usages = new Map<string, Array<{ file: string; line: number }>>();

    const report = generateStaleReport(defined, usages);
    expect(report.zeroRolloutFlags).toContain('zero-roll');
    expect(report.zeroRolloutFlags).not.toContain('disabled-zero');
    expect(report.zeroRolloutFlags).not.toContain('active');
  });

  it('returns empty report when everything is clean', () => {
    const defined = { 'flag-a': { enabled: true } };
    const usages = new Map([['flag-a', [{ file: 'a.ts', line: 1 }]]]);

    const report = generateStaleReport(defined, usages);
    expect(report.unusedFlags).toHaveLength(0);
    expect(report.undefinedRefs).toHaveLength(0);
    expect(report.zeroRolloutFlags).toHaveLength(0);
  });
});

describe('formatStaleReport', () => {
  it('returns clean message for empty report', () => {
    const output = formatStaleReport({
      unusedFlags: [],
      undefinedRefs: [],
      zeroRolloutFlags: [],
    });
    expect(output).toContain('No stale flags detected');
  });

  it('formats unused flags section', () => {
    const output = formatStaleReport({
      unusedFlags: ['old-feature'],
      undefinedRefs: [],
      zeroRolloutFlags: [],
    });
    expect(output).toContain('Unused flags');
    expect(output).toContain('old-feature');
    expect(output).toContain('1 issue(s)');
  });

  it('formats undefined refs section', () => {
    const output = formatStaleReport({
      unusedFlags: [],
      undefinedRefs: [{ flag: 'ghost', file: 'app.ts', line: 10 }],
      zeroRolloutFlags: [],
    });
    expect(output).toContain('Undefined references');
    expect(output).toContain('"ghost"');
    expect(output).toContain('app.ts:10');
  });

  it('formats zero-rollout section', () => {
    const output = formatStaleReport({
      unusedFlags: [],
      undefinedRefs: [],
      zeroRolloutFlags: ['dead-flag'],
    });
    expect(output).toContain('Zero-rollout');
    expect(output).toContain('dead-flag');
  });

  it('counts total issues across categories', () => {
    const output = formatStaleReport({
      unusedFlags: ['a', 'b'],
      undefinedRefs: [{ flag: 'c', file: 'x.ts', line: 1 }],
      zeroRolloutFlags: ['d'],
    });
    expect(output).toContain('4 issue(s)');
  });
});
