import { describe, it, expect } from 'vitest';
import {
  generateTestMatrix,
  comparePerf,
  generatePerfReport,
  generateK6Script,
  generateArtilleryConfig,
  formatTestMatrix,
  formatPerfReport,
  type PerfMetrics,
  type TestMatrix,
} from '../perf.js';
import type { FlagConfig } from '../types.js';

function makeConfig(flagNames: string[], overrides: Record<string, any> = {}): FlagConfig {
  const flags: Record<string, any> = {};
  for (const name of flagNames) {
    flags[name] = { enabled: true, ...overrides[name] };
  }
  return { version: 1, flags };
}

function makeMetrics(id: string, overrides: Partial<PerfMetrics> = {}): PerfMetrics {
  return {
    combinationId: id,
    latencyP50: 10,
    latencyP95: 50,
    latencyP99: 100,
    throughput: 1000,
    errorRate: 0.01,
    duration: 30,
    ...overrides,
  };
}

describe('generateTestMatrix', () => {
  it('generates combinations for a single flag', () => {
    const matrix = generateTestMatrix(makeConfig(['flag-a']));
    expect(matrix.combinations).toHaveLength(2); // on/off
    expect(matrix.totalFlags).toBe(1);
    expect(matrix.prunedFlags).toBe(0);
  });

  it('generates combinations for multiple flags', () => {
    const matrix = generateTestMatrix(makeConfig(['a', 'b', 'c']));
    expect(matrix.combinations).toHaveLength(8); // 2^3
    expect(matrix.totalFlags).toBe(3);
  });

  it('first combination has all flags off', () => {
    const matrix = generateTestMatrix(makeConfig(['a', 'b']));
    const first = matrix.combinations[0];
    expect(Object.values(first.flags).every((v) => v === false)).toBe(true);
    expect(first.description).toBe('(all off)');
  });

  it('prunes flags when exceeding maxCombinations', () => {
    // 20+ flags should be pruned to fit maxCombinations=64 (6 flags max)
    const flagNames = Array.from({ length: 20 }, (_, i) => `flag-${i}`);
    const matrix = generateTestMatrix(makeConfig(flagNames), { maxCombinations: 64 });
    expect(matrix.combinations.length).toBeLessThanOrEqual(64);
    expect(matrix.prunedFlags).toBeGreaterThan(0);
    expect(matrix.totalFlags).toBe(20);
  });

  it('filters by tags', () => {
    const config = makeConfig(['a', 'b', 'c']);
    config.flags['a'].tags = ['perf'];
    config.flags['b'].tags = ['other'];
    config.flags['c'].tags = ['perf'];

    const matrix = generateTestMatrix(config, { tags: ['perf'] });
    const allFlagNames = new Set(matrix.combinations.flatMap((c) => Object.keys(c.flags)));
    expect(allFlagNames.has('b')).toBe(false);
  });

  it('excludes specific flags', () => {
    const matrix = generateTestMatrix(makeConfig(['a', 'b', 'c']), { exclude: ['b'] });
    const allFlagNames = new Set(matrix.combinations.flatMap((c) => Object.keys(c.flags)));
    expect(allFlagNames.has('b')).toBe(false);
  });

  it('filters rolloutOnly flags', () => {
    const config = makeConfig(['a', 'b']);
    config.flags['a'].rollout = 50;

    const matrix = generateTestMatrix(config, { rolloutOnly: true });
    const allFlagNames = new Set(matrix.combinations.flatMap((c) => Object.keys(c.flags)));
    expect(allFlagNames.has('a')).toBe(true);
    expect(allFlagNames.has('b')).toBe(false);
  });

  it('prioritizes flags with variants/rollout for pruning', () => {
    const flagNames = Array.from({ length: 20 }, (_, i) => `flag-${i}`);
    const config = makeConfig(flagNames);
    config.flags['flag-0'].variants = [
      { name: 'a', weight: 50 },
      { name: 'b', weight: 50 },
    ];
    config.flags['flag-0'].rollout = 50;

    const matrix = generateTestMatrix(config, { maxCombinations: 4 });
    // flag-0 should be prioritized (has variants + rollout)
    const includedFlags = new Set(matrix.combinations.flatMap((c) => Object.keys(c.flags)));
    expect(includedFlags.has('flag-0')).toBe(true);
  });

  it('handles empty config', () => {
    const matrix = generateTestMatrix({ flags: {} });
    expect(matrix.combinations).toHaveLength(1); // 2^0 = 1
    expect(matrix.totalFlags).toBe(0);
  });
});

describe('comparePerf', () => {
  it('computes percentage changes', () => {
    const baseline = makeMetrics('base', { latencyP99: 100, throughput: 1000, errorRate: 0.01 });
    const current = makeMetrics('test', { latencyP99: 150, throughput: 800, errorRate: 0.03 });

    const comparison = comparePerf(baseline, current);
    expect(comparison.latencyP99Change).toBeCloseTo(50); // +50%
    expect(comparison.throughputChange).toBeCloseTo(-20); // -20%
    expect(comparison.errorRateChange).toBeCloseTo(0.02);
  });

  it('marks within budget when latency and error rate are acceptable', () => {
    const baseline = makeMetrics('base', { latencyP99: 100 });
    const current = makeMetrics('test', { latencyP99: 150, errorRate: 0.02 });
    const comparison = comparePerf(baseline, current, 200);
    expect(comparison.withinBudget).toBe(true);
  });

  it('marks outside budget when latency exceeds limit', () => {
    const baseline = makeMetrics('base', { latencyP99: 100 });
    const current = makeMetrics('test', { latencyP99: 300, errorRate: 0.01 });
    const comparison = comparePerf(baseline, current, 200);
    expect(comparison.withinBudget).toBe(false);
  });

  it('marks outside budget when error rate exceeds 5%', () => {
    const baseline = makeMetrics('base');
    const current = makeMetrics('test', { latencyP99: 50, errorRate: 0.1 });
    const comparison = comparePerf(baseline, current);
    expect(comparison.withinBudget).toBe(false);
  });

  it('handles zero baseline values', () => {
    const baseline = makeMetrics('base', { latencyP99: 0, throughput: 0 });
    const current = makeMetrics('test', { latencyP99: 100, throughput: 500 });
    const comparison = comparePerf(baseline, current);
    expect(comparison.latencyP99Change).toBe(0);
    expect(comparison.throughputChange).toBe(0);
  });
});

describe('generatePerfReport', () => {
  it('generates a report with comparisons', () => {
    const matrix: TestMatrix = {
      combinations: [],
      totalFlags: 2,
      prunedFlags: 0,
      prunedCombinations: 0,
      generatedAt: Date.now(),
    };
    const results = [
      makeMetrics('combo-0', { latencyP99: 50 }),
      makeMetrics('combo-1', { latencyP99: 100 }),
      makeMetrics('combo-2', { latencyP99: 200 }),
    ];
    const report = generatePerfReport(matrix, results, 150);

    expect(report.results).toHaveLength(3);
    expect(report.comparisons).toHaveLength(2); // compared against first
    expect(report.worstCase?.combinationId).toBe('combo-2');
    expect(report.allWithinBudget).toBe(false); // combo-2 exceeds 150ms
  });

  it('handles empty results', () => {
    const matrix: TestMatrix = {
      combinations: [],
      totalFlags: 0,
      prunedFlags: 0,
      prunedCombinations: 0,
      generatedAt: Date.now(),
    };
    const report = generatePerfReport(matrix, []);
    expect(report.worstCase).toBeNull();
    expect(report.comparisons).toHaveLength(0);
    expect(report.allWithinBudget).toBe(true);
  });
});

describe('generateK6Script', () => {
  it('generates valid k6 script', () => {
    const combo = {
      id: 'combo-1',
      flags: { 'flag-a': true, 'flag-b': false },
      description: 'flag-a',
    };
    const script = generateK6Script(combo, 'http://localhost:3000');

    expect(script).toContain("import http from 'k6/http'");
    expect(script).toContain('combo-1');
    expect(script).toContain('http://localhost:3000');
    expect(script).toContain('FLAG_OVERRIDES');
    expect(script).toContain('"flag-a":true');
  });

  it('accepts custom duration and vus', () => {
    const combo = { id: 'c', flags: {}, description: '' };
    const script = generateK6Script(combo, 'http://x', { duration: '60s', vus: 50 });
    expect(script).toContain("duration: '60s'");
    expect(script).toContain('vus: 50');
  });
});

describe('generateArtilleryConfig', () => {
  it('generates valid Artillery YAML config', () => {
    const combo = { id: 'combo-2', flags: { 'flag-x': true }, description: 'flag-x enabled' };
    const config = generateArtilleryConfig(combo, 'http://localhost:3000');

    expect(config).toContain('target: "http://localhost:3000"');
    expect(config).toContain('combo-2');
    expect(config).toContain('flag-x enabled');
    expect(config).toContain('arrivalRate');
  });

  it('accepts custom duration and arrivalRate', () => {
    const combo = { id: 'c', flags: {}, description: '' };
    const config = generateArtilleryConfig(combo, 'http://x', { duration: 120, arrivalRate: 50 });
    expect(config).toContain('duration: 120');
    expect(config).toContain('arrivalRate: 50');
  });
});

describe('formatTestMatrix', () => {
  it('formats test matrix output', () => {
    const matrix = generateTestMatrix(makeConfig(['a', 'b']));
    const output = formatTestMatrix(matrix);
    expect(output).toContain('Performance Test Matrix');
    expect(output).toContain('combo-');
  });
});

describe('formatPerfReport', () => {
  it('formats performance report', () => {
    const matrix: TestMatrix = {
      combinations: [],
      totalFlags: 1,
      prunedFlags: 0,
      prunedCombinations: 0,
      generatedAt: Date.now(),
    };
    const results = [makeMetrics('combo-0'), makeMetrics('combo-1', { latencyP99: 150 })];
    const report = generatePerfReport(matrix, results);
    const output = formatPerfReport(report);

    expect(output).toContain('Performance Test Report');
    expect(output).toContain('Combinations tested:');
    expect(output).toContain('Comparisons vs baseline');
  });
});
