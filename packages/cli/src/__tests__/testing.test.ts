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
      writeFileSync(join(tmpDir, 'basic.test.yml'), `
tests:
  - name: dark mode off
    context: {}
    assertions:
      - flag: dark-mode
        enabled: false
`);
      writeFileSync(join(tmpDir, 'rules.test.yml'), `
tests:
  - name: admin beta
    context:
      userId: a1
      role: admin
    assertions:
      - flag: beta-features
        enabled: true
`);

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
      const output = formatTestResults({ specs: [result], totalPassed: 1, totalFailed: 1, totalSkipped: 0, duration: 10 });
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
      const xml = formatJUnitXml({ specs: [result], totalPassed: 1, totalFailed: 0, totalSkipped: 0, duration: 5 });
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
      const xml = formatJUnitXml({ specs: [result], totalPassed: 0, totalFailed: 1, totalSkipped: 0, duration: 5 });
      expect(xml).toContain('<failure');
    });
  });
});
