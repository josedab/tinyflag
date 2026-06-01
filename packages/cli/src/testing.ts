import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import type { FlagConfig, UserContext, FlagDefinition } from 'tinyflag';

// Import evaluateFlag from the evaluator to avoid needing setEvaluationContext
// The testing module creates isolated evaluation contexts per test
function evaluateFlagSimple(
  flagName: string,
  flag: FlagDefinition,
  context?: UserContext,
): boolean {
  if (!flag.enabled) return false;

  // Check rules
  if (flag.rules && flag.rules.length > 0 && context) {
    for (const rule of flag.rules) {
      if (matchRuleSimple(rule.conditions, context)) {
        const ruleEnabled = rule.enabled !== undefined ? rule.enabled : true;
        return ruleEnabled;
      }
    }
  }

  return flag.enabled;
}

function matchRuleSimple(conditions: Record<string, unknown>, context: UserContext): boolean {
  for (const [field, expected] of Object.entries(conditions)) {
    const contextValue = context[field];
    if (contextValue === undefined || contextValue === null) return false;

    if (typeof expected === 'object' && expected !== null && !Array.isArray(expected)) {
      const ops = expected as Record<string, unknown>;
      if ('$in' in ops) {
        const list = ops.$in;
        if (!Array.isArray(list) || !list.includes(contextValue)) return false;
        continue;
      }
      if ('$not' in ops) {
        if (contextValue === ops.$not) return false;
        continue;
      }
    }

    if (contextValue !== expected) return false;
  }
  return true;
}

/** A single test assertion in a spec. */
export interface FlagTestAssertion {
  /** Flag name to evaluate. */
  flag: string;
  /** Expected enabled state (if checking boolean). */
  enabled?: boolean;
  /** Expected variant (if checking variant selection). */
  variant?: string;
  /** Optional JS expression for advanced assertions (escape hatch). */
  expr?: string;
}

/** A test case with context and assertions. */
export interface FlagTestCase {
  /** Human-readable test name. */
  name: string;
  /** User context for evaluation. */
  context: UserContext;
  /** Assertions to verify. */
  assertions: FlagTestAssertion[];
  /** Skip this test case. */
  skip?: boolean;
}

/** A test spec file containing multiple test cases. */
export interface FlagTestSpec {
  /** Description of what this spec tests. */
  description?: string;
  /** Path to the flags file to test against. */
  flagsFile?: string;
  /** Inline flag config (alternative to flagsFile). */
  flags?: Record<string, unknown>;
  /** Test cases. */
  tests: FlagTestCase[];
}

/** Result of running a single assertion. */
export interface AssertionResult {
  flag: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message?: string;
}

/** Result of running a single test case. */
export interface TestCaseResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  assertions: AssertionResult[];
  duration: number;
}

/** Result of running an entire spec file. */
export interface SpecResult {
  file: string;
  description?: string;
  tests: TestCaseResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

/** Overall test run result. */
export interface TestRunResult {
  specs: SpecResult[];
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  duration: number;
}

/**
 * Parse a YAML test spec file.
 */
export function parseTestSpec(content: string): FlagTestSpec {
  const raw = parseYaml(content) as Record<string, unknown>;

  const spec: FlagTestSpec = {
    description: typeof raw.description === 'string' ? raw.description : undefined,
    flagsFile: typeof raw.flagsFile === 'string' ? raw.flagsFile : undefined,
    tests: [],
  };

  if (raw.flags && typeof raw.flags === 'object') {
    spec.flags = raw.flags as Record<string, unknown>;
  }

  const tests = raw.tests;
  if (!Array.isArray(tests)) return spec;

  for (const test of tests) {
    if (typeof test !== 'object' || test === null) continue;
    const t = test as Record<string, unknown>;

    const testCase: FlagTestCase = {
      name: String(t.name || 'unnamed'),
      context: (t.context || {}) as UserContext,
      assertions: [],
      skip: typeof t.skip === 'boolean' ? t.skip : false,
    };

    const assertions = t.assertions || t.assert;
    if (Array.isArray(assertions)) {
      for (const a of assertions) {
        if (typeof a !== 'object' || a === null) continue;
        const assertion = a as Record<string, unknown>;
        testCase.assertions.push({
          flag: String(assertion.flag || ''),
          enabled: typeof assertion.enabled === 'boolean' ? assertion.enabled : undefined,
          variant: typeof assertion.variant === 'string' ? assertion.variant : undefined,
          expr: typeof assertion.expr === 'string' ? assertion.expr : undefined,
        });
      }
    }

    spec.tests.push(testCase);
  }

  return spec;
}

/**
 * Run a single test spec against a flag config.
 */
export function runTestSpec(
  spec: FlagTestSpec,
  config: FlagConfig,
  specFile: string = '<inline>',
): SpecResult {
  const startTime = Date.now();
  const results: TestCaseResult[] = [];

  for (const test of spec.tests) {
    if (test.skip) {
      results.push({ name: test.name, status: 'skip', assertions: [], duration: 0 });
      continue;
    }

    const caseStart = Date.now();
    const assertionResults: AssertionResult[] = [];
    let allPassed = true;

    for (const assertion of test.assertions) {
      const flag = config.flags[assertion.flag];
      if (!flag) {
        assertionResults.push({
          flag: assertion.flag,
          passed: false,
          expected: 'flag to exist',
          actual: 'undefined',
          message: `Flag "${assertion.flag}" not found in config`,
        });
        allPassed = false;
        continue;
      }

      // Check enabled state
      if (assertion.enabled !== undefined) {
        const actual = evaluateFlagSimple(assertion.flag, flag, test.context);
        const passed = actual === assertion.enabled;
        assertionResults.push({
          flag: assertion.flag,
          passed,
          expected: assertion.enabled,
          actual,
          message: passed ? undefined : `Expected enabled=${assertion.enabled}, got ${actual}`,
        });
        if (!passed) allPassed = false;
      }

      // Check JS expression (escape hatch)
      if (assertion.expr) {
        try {
          const enabled = evaluateFlagSimple(assertion.flag, flag, test.context);
          const fn = new Function('enabled', 'flag', 'context', `return (${assertion.expr})`);
          const result = fn(enabled, flag, test.context);
          const passed = !!result;
          assertionResults.push({
            flag: assertion.flag,
            passed,
            expected: `expr: ${assertion.expr} → true`,
            actual: result,
            message: passed ? undefined : `Expression evaluated to ${result}`,
          });
          if (!passed) allPassed = false;
        } catch (err) {
          assertionResults.push({
            flag: assertion.flag,
            passed: false,
            expected: `expr to not throw`,
            actual: String(err),
            message: `Expression error: ${err}`,
          });
          allPassed = false;
        }
      }
    }

    results.push({
      name: test.name,
      status: allPassed ? 'pass' : 'fail',
      assertions: assertionResults,
      duration: Date.now() - caseStart,
    });
  }

  return {
    file: specFile,
    description: spec.description,
    tests: results,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    skipped: results.filter((r) => r.status === 'skip').length,
    duration: Date.now() - startTime,
  };
}

/**
 * Discover and run all test specs in a directory.
 */
export function runTestSpecs(
  specDir: string,
  config: FlagConfig,
): TestRunResult {
  const startTime = Date.now();
  const specs: SpecResult[] = [];
  const specFiles = findSpecFiles(specDir);

  for (const file of specFiles) {
    const content = readFileSync(file, 'utf8');
    const spec = parseTestSpec(content);

    // If spec references a flagsFile, load it
    let effectiveConfig = config;
    if (spec.flagsFile) {
      try {
        const flagContent = readFileSync(spec.flagsFile, 'utf8');
        effectiveConfig = parseFlagConfig(parseYaml(flagContent));
      } catch {
        // Fall back to provided config
      }
    }

    specs.push(runTestSpec(spec, effectiveConfig, file));
  }

  return {
    specs,
    totalPassed: specs.reduce((s, r) => s + r.passed, 0),
    totalFailed: specs.reduce((s, r) => s + r.failed, 0),
    totalSkipped: specs.reduce((s, r) => s + r.skipped, 0),
    duration: Date.now() - startTime,
  };
}

function findSpecFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && (entry.endsWith('.test.yml') || entry.endsWith('.test.yaml') || entry.endsWith('.spec.yml'))) {
          files.push(fullPath);
        }
      } catch {
        continue;
      }
    }
  }

  walk(dir);
  return files.sort();
}

/**
 * Format test results as human-readable output.
 */
export function formatTestResults(result: TestRunResult): string {
  const lines: string[] = [];

  for (const spec of result.specs) {
    lines.push(`📋 ${spec.file}${spec.description ? ` — ${spec.description}` : ''}`);

    for (const test of spec.tests) {
      const icon = test.status === 'pass' ? '✅' : test.status === 'fail' ? '❌' : '⏭️';
      lines.push(`  ${icon} ${test.name} (${test.duration}ms)`);

      if (test.status === 'fail') {
        for (const a of test.assertions) {
          if (!a.passed) {
            lines.push(`     ✗ ${a.flag}: ${a.message}`);
          }
        }
      }
    }
    lines.push('');
  }

  const total = result.totalPassed + result.totalFailed + result.totalSkipped;
  lines.push(`Results: ${result.totalPassed} passed, ${result.totalFailed} failed, ${result.totalSkipped} skipped (${total} total, ${result.duration}ms)`);

  return lines.join('\n');
}

/**
 * Generate JUnit XML output for CI integration.
 */
export function formatJUnitXml(result: TestRunResult): string {
  const lines: string[] = [];
  const total = result.totalPassed + result.totalFailed + result.totalSkipped;

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<testsuites tests="${total}" failures="${result.totalFailed}" skipped="${result.totalSkipped}" time="${(result.duration / 1000).toFixed(3)}">`);

  for (const spec of result.specs) {
    const specTotal = spec.passed + spec.failed + spec.skipped;
    lines.push(`  <testsuite name="${escapeXml(spec.file)}" tests="${specTotal}" failures="${spec.failed}" skipped="${spec.skipped}" time="${(spec.duration / 1000).toFixed(3)}">`);

    for (const test of spec.tests) {
      lines.push(`    <testcase name="${escapeXml(test.name)}" time="${(test.duration / 1000).toFixed(3)}">`);

      if (test.status === 'skip') {
        lines.push('      <skipped />');
      } else if (test.status === 'fail') {
        for (const a of test.assertions) {
          if (!a.passed) {
            lines.push(`      <failure message="${escapeXml(a.message || 'assertion failed')}" type="AssertionFailure">`);
            lines.push(`        Flag: ${escapeXml(a.flag)}, Expected: ${escapeXml(String(a.expected))}, Actual: ${escapeXml(String(a.actual))}`);
            lines.push('      </failure>');
          }
        }
      }

      lines.push('    </testcase>');
    }

    lines.push('  </testsuite>');
  }

  lines.push('</testsuites>');
  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
