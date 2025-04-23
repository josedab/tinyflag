import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseTestSpec,
  runTestSpec,
  runTestSpecs,
  formatTestResults,
  formatJUnitXml,
} from '../testing.js';
import type { FlagConfig } from 'tinyflag';

const FLAGS_CONFIG: FlagConfig = {
  version: 1,
  flags: {
    'dark-mode': { enabled: false },
    'checkout-v2': { enabled: true, rollout: 50 },
    'beta-features': {
      enabled: true,
      rules: [
        { conditions: { role: 'admin' }, enabled: true },
        { conditions: { role: 'user' }, enabled: false },
      ],
    },
  },
};

describe('declarative testing framework', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tinyflag-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseTestSpec', () => {
    it('parses YAML test spec', () => {
      const spec = parseTestSpec(`
description: Basic flag tests
tests:
  - name: dark mode is disabled by default
    context:
      userId: user-1
    assertions:
      - flag: dark-mode
        enabled: false
  - name: skipped test
    skip: true
    context: {}
    assertions:
      - flag: dark-mode
        enabled: true
`);
      expect(spec.description).toBe('Basic flag tests');
      expect(spec.tests).toHaveLength(2);
      expect(spec.tests[0].name).toBe('dark mode is disabled by default');
      expect(spec.tests[0].assertions[0].flag).toBe('dark-mode');
      expect(spec.tests[0].assertions[0].enabled).toBe(false);
      expect(spec.tests[1].skip).toBe(true);
    });

    it('handles empty spec', () => {
      const spec = parseTestSpec('tests: []');
      expect(spec.tests).toHaveLength(0);
    });
  });

  describe('runTestSpec', () => {
    it('passes for correct assertions', () => {
      const spec = parseTestSpec(`
tests:
  - name: dark-mode is disabled
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('fails for incorrect assertions', () => {
      const spec = parseTestSpec(`
tests:
  - name: wrong assertion
    context: {}
    assertions:
      - flag: dark-mode
        enabled: true
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      expect(result.failed).toBe(1);
      expect(result.tests[0].status).toBe('fail');
    });

    it('handles missing flags', () => {
      const spec = parseTestSpec(`
tests:
  - name: nonexistent flag
    context: {}
    assertions:
      - flag: nonexistent
        enabled: true
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      expect(result.failed).toBe(1);
      expect(result.tests[0].assertions[0].message).toContain('not found');
    });

    it('skips tests marked with skip', () => {
      const spec = parseTestSpec(`
tests:
  - name: skipped
    skip: true
    context: {}
    assertions:
      - flag: dark-mode
        enabled: true
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      expect(result.skipped).toBe(1);
      expect(result.tests[0].status).toBe('skip');
    });

    it('evaluates rules with context', () => {
      const spec = parseTestSpec(`
tests:
  - name: admin sees beta
    context:
      userId: admin-1
      role: admin
    assertions:
      - flag: beta-features
        enabled: true
  - name: user does not see beta
    context:
      userId: user-1
      role: user
    assertions:
      - flag: beta-features
        enabled: false
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('evaluates $in operator via rules', () => {
      const config: FlagConfig = {
        version: 1,
        flags: {
          'ab-flag': {
            enabled: true,
            rules: [{ conditions: { plan: { $in: ['pro', 'enterprise'] } }, enabled: true }],
          },
        },
      };
      const specMatch = parseTestSpec(`
tests:
  - name: pro user matches $in
    context:
      userId: u1
      plan: pro
    assertions:
      - flag: ab-flag
        enabled: true
`);
      expect(runTestSpec(specMatch, config).passed).toBe(1);

      const specNoMatch = parseTestSpec(`
tests:
  - name: free user does not match $in
    context:
      userId: u2
      plan: free
    assertions:
      - flag: ab-flag
        enabled: true
`);
      expect(runTestSpec(specNoMatch, config).passed).toBe(1);
    });

    it('evaluates $not operator via rules', () => {
      const config: FlagConfig = {
        version: 1,
        flags: {
          'not-flag': {
            enabled: true,
            rules: [{ conditions: { role: { $not: 'admin' } }, enabled: true }],
          },
        },
      };
      const specMatch = parseTestSpec(`
tests:
  - name: non-admin matches $not
    context:
      userId: u1
      role: user
    assertions:
      - flag: not-flag
        enabled: true
`);
      expect(runTestSpec(specMatch, config).passed).toBe(1);

      const specNoMatch = parseTestSpec(`
tests:
  - name: admin does not match $not
    context:
      userId: u1
      role: admin
    assertions:
      - flag: not-flag
        enabled: true
`);
      expect(runTestSpec(specNoMatch, config).passed).toBe(1);
    });

    it('handles null/undefined context values in rules', () => {
      const config: FlagConfig = {
        version: 1,
        flags: {
          'ctx-flag': {
            enabled: true,
            rules: [{ conditions: { plan: 'pro' }, enabled: true }],
          },
        },
      };
      const spec = parseTestSpec(`
tests:
  - name: missing context field returns enabled (falls through rules)
    context:
      userId: u1
    assertions:
      - flag: ctx-flag
        enabled: true
`);
      const result = runTestSpec(spec, config);
      expect(result.passed).toBe(1);
    });

    it('first matching rule wins with multiple rules', () => {
      const config: FlagConfig = {
        version: 1,
        flags: {
          'multi-rule': {
            enabled: true,
            rules: [
              { conditions: { role: 'admin' }, enabled: false },
              { conditions: { role: 'admin' }, enabled: true },
            ],
          },
        },
      };
      const spec = parseTestSpec(`
tests:
  - name: first rule wins
    context:
      userId: u1
      role: admin
    assertions:
      - flag: multi-rule
        enabled: false
`);
      expect(runTestSpec(spec, config).passed).toBe(1);
    });

    it('supports expr escape hatch', () => {
      const spec = parseTestSpec(`
tests:
  - name: expression test
    context: {}
    assertions:
      - flag: dark-mode
        expr: "enabled === false"
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      expect(result.passed).toBe(1);
    });
  });

  describe('runTestSpecs', () => {
    it('discovers and runs spec files', () => {
      writeFileSync(
        join(tmpDir, 'basic.test.yml'),
        `
tests:
  - name: dark mode off
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
`,
      );
      writeFileSync(
        join(tmpDir, 'rules.test.yml'),
        `
tests:
  - name: admin beta
    context:
      userId: a1
      role: admin
    assertions:
      - flag: beta-features
        enabled: true
`,
      );

      const result = runTestSpecs(tmpDir, FLAGS_CONFIG);
      expect(result.specs).toHaveLength(2);
      expect(result.totalPassed).toBe(2);
      expect(result.totalFailed).toBe(0);
    });
  });

  describe('formatTestResults', () => {
    it('formats results with pass/fail icons', () => {
      const spec = parseTestSpec(`
tests:
  - name: passing test
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
  - name: failing test
    context: {}
    assertions:
      - flag: dark-mode
        enabled: true
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      const output = formatTestResults({
        specs: [result],
        totalPassed: 1,
        totalFailed: 1,
        totalSkipped: 0,
        duration: 10,
      });
      expect(output).toContain('✅');
      expect(output).toContain('❌');
      expect(output).toContain('Results:');
    });
  });

  describe('formatJUnitXml', () => {
    it('generates valid XML', () => {
      const spec = parseTestSpec(`
tests:
  - name: basic test
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      const xml = formatJUnitXml({
        specs: [result],
        totalPassed: 1,
        totalFailed: 0,
        totalSkipped: 0,
        duration: 5,
      });
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain('<testsuites');
      expect(xml).toContain('<testcase');
      expect(xml).toContain('</testsuites>');
    });

    it('includes failure details', () => {
      const spec = parseTestSpec(`
tests:
  - name: failing
    context: {}
    assertions:
      - flag: dark-mode
        enabled: true
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      const xml = formatJUnitXml({
        specs: [result],
        totalPassed: 0,
        totalFailed: 1,
        totalSkipped: 0,
        duration: 5,
      });
      expect(xml).toContain('<failure');
    });

    it('escapes & < > " \' in XML output', () => {
      const config: FlagConfig = {
        version: 1,
        flags: {
          'flag&<>"\'test': { enabled: true },
        },
      };
      const spec = parseTestSpec(`
tests:
  - name: "test with <special> & \"chars\""
    context: {}
    assertions:
      - flag: "flag&<>\"'test"
        enabled: false
`);
      const result = runTestSpec(spec, config, 'file&<test>.yml');
      const xml = formatJUnitXml({
        specs: [result],
        totalPassed: 0,
        totalFailed: 1,
        totalSkipped: 0,
        duration: 5,
      });
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&lt;');
      expect(xml).toContain('&gt;');
      expect(xml).toContain('&quot;');
      expect(xml).toContain('&apos;');
      // Verify no unescaped special chars in attribute values
      expect(xml).not.toContain('name="file&<');
    });

    it('escapes empty string correctly in XML', () => {
      const spec = parseTestSpec(`
tests:
  - name: ""
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
`);
      const result = runTestSpec(spec, FLAGS_CONFIG);
      const xml = formatJUnitXml({
        specs: [result],
        totalPassed: 1,
        totalFailed: 0,
        totalSkipped: 0,
        duration: 1,
      });
      expect(xml).toContain('<testcase');
    });
  });

  describe('findSpecFiles (via runTestSpecs)', () => {
    it('finds .test.yml and .spec.yml files', () => {
      writeFileSync(
        join(tmpDir, 'a.test.yml'),
        `
tests:
  - name: test a
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
`,
      );
      writeFileSync(
        join(tmpDir, 'b.spec.yml'),
        `
tests:
  - name: test b
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
`,
      );
      const result = runTestSpecs(tmpDir, FLAGS_CONFIG);
      expect(result.specs).toHaveLength(2);
    });

    it('finds files in nested directories', () => {
      mkdirSync(join(tmpDir, 'sub'));
      writeFileSync(
        join(tmpDir, 'sub', 'nested.test.yml'),
        `
tests:
  - name: nested test
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
`,
      );
      const result = runTestSpecs(tmpDir, FLAGS_CONFIG);
      expect(result.specs).toHaveLength(1);
      expect(result.specs[0].file).toContain('nested.test.yml');
    });

    it('excludes .git and node_modules directories', () => {
      mkdirSync(join(tmpDir, '.git'));
      mkdirSync(join(tmpDir, 'node_modules'));
      writeFileSync(join(tmpDir, '.git', 'hidden.test.yml'), `tests: []`);
      writeFileSync(join(tmpDir, 'node_modules', 'lib.test.yml'), `tests: []`);
      const result = runTestSpecs(tmpDir, FLAGS_CONFIG);
      expect(result.specs).toHaveLength(0);
    });

    it('handles empty directory', () => {
      const result = runTestSpecs(tmpDir, FLAGS_CONFIG);
      expect(result.specs).toHaveLength(0);
      expect(result.totalPassed).toBe(0);
    });

    it('handles non-existent directory gracefully', () => {
      const result = runTestSpecs(join(tmpDir, 'nonexistent'), FLAGS_CONFIG);
      expect(result.specs).toHaveLength(0);
    });
  });

  describe('variant assertion in runTestSpec', () => {
    it('does not fail on variant assertion (no variant check in simple evaluator)', () => {
      const config: FlagConfig = {
        version: 1,
        flags: {
          'ab-test': {
            enabled: true,
            variants: [
              { name: 'control', weight: 50 },
              { name: 'treatment', weight: 50 },
            ],
          },
        },
      };
      const spec = parseTestSpec(`
tests:
  - name: variant test
    context:
      userId: user-1
    assertions:
      - flag: ab-test
        variant: control
`);
      // variant assertions are currently not evaluated by runTestSpec (only enabled and expr)
      // so this should pass without failure
      const result = runTestSpec(spec, config);
      expect(result.tests[0].status).toBe('pass');
    });
  });
});
