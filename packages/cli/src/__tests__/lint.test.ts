import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { lintConfig, loadLintConfig, formatLintResults, formatLintSarif } from '../lint.js';
import type { FlagConfig } from 'tinyflag';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeConfig(flags: Record<string, any>): FlagConfig {
  return { version: 1, flags } as FlagConfig;
}

describe('lint rules', () => {
  describe('require-description', () => {
    it('warns when flag has no description', () => {
      const config = makeConfig({ 'my-flag': { enabled: true } });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'require-description' && r.flag === 'my-flag');
      expect(match).toBeTruthy();
      expect(match!.severity).toBe('warning');
    });

    it('passes when flag has description', () => {
      const config = makeConfig({ 'my-flag': { enabled: true, description: 'A flag' } });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'require-description' && r.flag === 'my-flag');
      expect(match).toBeUndefined();
    });

    it('warns for empty description', () => {
      const config = makeConfig({ 'my-flag': { enabled: true, description: '  ' } });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'require-description' && r.flag === 'my-flag');
      expect(match).toBeTruthy();
    });
  });

  describe('require-tags', () => {
    it('warns when flag has no tags', () => {
      const config = makeConfig({ 'my-flag': { enabled: true } });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'require-tags' && r.flag === 'my-flag');
      expect(match).toBeTruthy();
    });

    it('warns for empty tags array', () => {
      const config = makeConfig({ 'my-flag': { enabled: true, tags: [] } });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'require-tags' && r.flag === 'my-flag');
      expect(match).toBeTruthy();
    });

    it('passes when flag has tags', () => {
      const config = makeConfig({ 'my-flag': { enabled: true, tags: ['beta'] } });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'require-tags' && r.flag === 'my-flag');
      expect(match).toBeUndefined();
    });
  });

  describe('max-flags-per-file', () => {
    it('warns when flag count exceeds default max (50)', () => {
      const flags: Record<string, any> = {};
      for (let i = 0; i < 51; i++)
        flags[`flag-${i}`] = { enabled: true, description: 'd', tags: ['t'] };
      const config = makeConfig(flags);
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'max-flags-per-file');
      expect(match).toBeTruthy();
      expect(match!.message).toContain('51');
    });

    it('passes when under max', () => {
      const config = makeConfig({ f: { enabled: true, description: 'd', tags: ['t'] } });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'max-flags-per-file')).toBeUndefined();
    });

    it('respects custom max option', () => {
      const flags: Record<string, any> = {};
      for (let i = 0; i < 3; i++)
        flags[`flag-${i}`] = { enabled: true, description: 'd', tags: ['t'] };
      const config = makeConfig(flags);
      const results = lintConfig(config, {
        rules: { 'max-flags-per-file': { severity: 'error', options: { max: 2 } } },
      });
      const match = results.find((r) => r.rule === 'max-flags-per-file');
      expect(match).toBeTruthy();
      expect(match!.severity).toBe('error');
    });
  });

  describe('no-100-rollout-without-tag', () => {
    it('warns for 100% rollout without permanent tag', () => {
      const config = makeConfig({
        'full-rollout': { enabled: true, rollout: 100, description: 'd', tags: ['beta'] },
      });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'no-100-rollout-without-tag');
      expect(match).toBeTruthy();
    });

    it('passes with permanent tag', () => {
      const config = makeConfig({
        'full-rollout': { enabled: true, rollout: 100, description: 'd', tags: ['permanent'] },
      });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'no-100-rollout-without-tag')).toBeUndefined();
    });

    it('passes when disabled', () => {
      const config = makeConfig({
        'full-rollout': { enabled: false, rollout: 100, description: 'd', tags: ['beta'] },
      });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'no-100-rollout-without-tag')).toBeUndefined();
    });

    it('passes for non-100 rollout', () => {
      const config = makeConfig({
        partial: { enabled: true, rollout: 50, description: 'd', tags: ['beta'] },
      });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'no-100-rollout-without-tag')).toBeUndefined();
    });
  });

  describe('naming-convention', () => {
    it('errors for non-kebab-case names', () => {
      const config = makeConfig({ MyFlag: { enabled: true, description: 'd', tags: ['t'] } });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'naming-convention');
      expect(match).toBeTruthy();
      expect(match!.severity).toBe('error');
    });

    it('passes for valid kebab-case', () => {
      const config = makeConfig({ 'my-flag': { enabled: true, description: 'd', tags: ['t'] } });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'naming-convention')).toBeUndefined();
    });

    it('passes for single character', () => {
      const config = makeConfig({ f: { enabled: true, description: 'd', tags: ['t'] } });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'naming-convention')).toBeUndefined();
    });

    it('errors for names starting with hyphen', () => {
      const config = makeConfig({ '-flag': { enabled: true, description: 'd', tags: ['t'] } });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'naming-convention')).toBeTruthy();
    });
  });

  describe('no-empty-rules', () => {
    it('warns for rule with empty conditions and no segment', () => {
      const config = makeConfig({
        'my-flag': {
          enabled: true,
          description: 'd',
          tags: ['t'],
          rules: [{ conditions: {} }],
        },
      });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'no-empty-rules');
      expect(match).toBeTruthy();
      expect(match!.message).toContain('rule[0]');
    });

    it('passes for rule with segment', () => {
      const config = makeConfig({
        'my-flag': {
          enabled: true,
          description: 'd',
          tags: ['t'],
          rules: [{ conditions: {}, segment: 'beta-users' }],
        },
      });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'no-empty-rules')).toBeUndefined();
    });

    it('passes for rule with conditions', () => {
      const config = makeConfig({
        'my-flag': {
          enabled: true,
          description: 'd',
          tags: ['t'],
          rules: [{ conditions: { plan: 'pro' } }],
        },
      });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'no-empty-rules')).toBeUndefined();
    });
  });

  describe('no-disabled-with-rules', () => {
    it('informs when disabled flag has rules', () => {
      const config = makeConfig({
        'my-flag': {
          enabled: false,
          description: 'd',
          tags: ['t'],
          rules: [{ conditions: { plan: 'pro' } }],
        },
      });
      const results = lintConfig(config);
      const match = results.find((r) => r.rule === 'no-disabled-with-rules');
      expect(match).toBeTruthy();
      expect(match!.severity).toBe('info');
    });

    it('passes when enabled flag has rules', () => {
      const config = makeConfig({
        'my-flag': {
          enabled: true,
          description: 'd',
          tags: ['t'],
          rules: [{ conditions: { plan: 'pro' } }],
        },
      });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'no-disabled-with-rules')).toBeUndefined();
    });

    it('passes when disabled flag has no rules', () => {
      const config = makeConfig({
        'my-flag': { enabled: false, description: 'd', tags: ['t'] },
      });
      const results = lintConfig(config);
      expect(results.find((r) => r.rule === 'no-disabled-with-rules')).toBeUndefined();
    });
  });
});

describe('loadLintConfig', () => {
  const tmpFile = join(tmpdir(), `tinyflag-lint-test-${Date.now()}.json`);

  afterAll(() => {
    try {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    } catch {}
  });

  it('returns empty config when no file exists', () => {
    const config = loadLintConfig('/nonexistent-path-xyz/.tinyflagrc');
    expect(config).toEqual({});
  });

  it('loads config from specified path', () => {
    writeFileSync(tmpFile, JSON.stringify({ rules: { 'naming-convention': 'warning' } }));
    const config = loadLintConfig(tmpFile);
    expect(config.rules).toBeDefined();
    expect(config.rules!['naming-convention']).toBe('warning');
  });

  it('returns empty config for invalid JSON', () => {
    const badFile = join(tmpdir(), `tinyflag-bad-${Date.now()}.json`);
    writeFileSync(badFile, 'not-json');
    try {
      const config = loadLintConfig(badFile);
      expect(config).toEqual({});
    } finally {
      try {
        unlinkSync(badFile);
      } catch {}
    }
  });
});

describe('lintConfig with overrides', () => {
  it('respects severity override', () => {
    const config = makeConfig({ 'my-flag': { enabled: true } });
    const results = lintConfig(config, {
      rules: { 'require-description': 'error' },
    });
    const match = results.find((r) => r.rule === 'require-description');
    expect(match).toBeTruthy();
    expect(match!.severity).toBe('error');
  });

  it('disables rules set to false', () => {
    const config = makeConfig({ 'my-flag': { enabled: true } });
    const results = lintConfig(config, {
      rules: { 'require-description': false },
    });
    expect(results.find((r) => r.rule === 'require-description')).toBeUndefined();
  });

  it('supports object-style rule config', () => {
    const config = makeConfig({ 'my-flag': { enabled: true } });
    const results = lintConfig(config, {
      rules: { 'require-description': { severity: 'info' } },
    });
    const match = results.find((r) => r.rule === 'require-description');
    expect(match!.severity).toBe('info');
  });
});

describe('formatLintResults', () => {
  it('returns clean message when no issues', () => {
    const output = formatLintResults([]);
    expect(output).toContain('No lint issues found');
  });

  it('formats errors, warnings, and infos with icons', () => {
    const output = formatLintResults([
      { rule: 'naming-convention', severity: 'error', flag: 'Bad', message: 'bad name' },
      { rule: 'require-description', severity: 'warning', flag: 'f', message: 'no desc' },
      { rule: 'no-disabled-with-rules', severity: 'info', flag: 'g', message: 'disabled' },
    ]);
    expect(output).toContain('❌');
    expect(output).toContain('⚠️');
    expect(output).toContain('ℹ️');
    expect(output).toContain('1 error(s)');
    expect(output).toContain('1 warning(s)');
    expect(output).toContain('1 info(s)');
  });

  it('marks fixable results', () => {
    const output = formatLintResults([
      { rule: 'test', severity: 'warning', message: 'msg', fixable: true },
    ]);
    expect(output).toContain('(fixable)');
  });
});

describe('formatLintSarif', () => {
  it('produces valid SARIF structure', () => {
    const results = [
      { rule: 'naming-convention', severity: 'error' as const, flag: 'Bad', message: 'bad name' },
    ];
    const sarif = formatLintSarif(results, 'flags.yml') as any;

    expect(sarif.$schema).toContain('sarif');
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('tinyflag-lint');
    expect(sarif.runs[0].results).toHaveLength(1);
    expect(sarif.runs[0].results[0].ruleId).toBe('naming-convention');
    expect(sarif.runs[0].results[0].level).toBe('error');
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'flags.yml',
    );
  });

  it('maps severity levels correctly', () => {
    const results = [
      { rule: 'a', severity: 'error' as const, message: 'm' },
      { rule: 'b', severity: 'warning' as const, message: 'm' },
      { rule: 'c', severity: 'info' as const, message: 'm' },
    ];
    const sarif = formatLintSarif(results, 'f.yml') as any;
    expect(sarif.runs[0].results[0].level).toBe('error');
    expect(sarif.runs[0].results[1].level).toBe('warning');
    expect(sarif.runs[0].results[2].level).toBe('note');
  });

  it('includes all builtin rules in driver.rules', () => {
    const sarif = formatLintSarif([], 'f.yml') as any;
    const ruleNames = sarif.runs[0].tool.driver.rules.map((r: any) => r.id);
    expect(ruleNames).toContain('require-description');
    expect(ruleNames).toContain('naming-convention');
    expect(ruleNames).toContain('no-empty-rules');
    expect(ruleNames.length).toBe(7);
  });
});
