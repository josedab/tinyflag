import { describe, it, expect } from 'vitest';
import {
  welchTTest,
  chiSquareTest,
  analyzeMetricImpact,
  createPrometheusSource,
  formatImpactAnalysis,
  type FlagChangePoint,
} from '../correlation-core.js';

describe('welchTTest', () => {
  it('detects significant difference between groups', () => {
    const before = [10, 12, 11, 13, 10, 12, 11, 10, 13, 12];
    const after = [20, 22, 21, 23, 20, 22, 21, 20, 23, 22];
    const result = welchTTest(before, after);

    expect(result.testName).toBe("Welch's t-test");
    expect(result.statistic).toBeGreaterThan(0); // (m2-m1)/se, after has higher mean
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.significant).toBe(true);
    expect(result.effectSize).toBeGreaterThan(0);
    expect(result.sampleSizeBefore).toBe(10);
    expect(result.sampleSizeAfter).toBe(10);
  });

  it('returns not significant for similar groups', () => {
    const before = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11];
    const after = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11];
    const result = welchTTest(before, after);

    expect(result.significant).toBe(false);
    expect(result.statistic).toBeCloseTo(0, 1);
  });

  it('handles insufficient sample size (< 2)', () => {
    const result = welchTTest([5], [10]);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBe(1);
    expect(result.statistic).toBe(0);
  });

  it('handles zero variance', () => {
    const before = [5, 5, 5, 5, 5];
    const after = [5, 5, 5, 5, 5];
    const result = welchTTest(before, after);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBe(1);
  });

  it('works with unequal group sizes', () => {
    const before = [10, 12, 11, 13, 10];
    const after = [20, 22, 21, 23, 20, 22, 21, 20, 23, 22, 21, 20];
    const result = welchTTest(before, after);
    expect(result.significant).toBe(true);
    expect(result.sampleSizeBefore).toBe(5);
    expect(result.sampleSizeAfter).toBe(12);
  });

  it('computes Cohen d effect size', () => {
    const before = [10, 12, 11, 13, 10, 12, 11, 10, 13, 12];
    const after = [20, 22, 21, 23, 20, 22, 21, 20, 23, 22];
    const result = welchTTest(before, after);
    expect(result.effectSize).toBeGreaterThan(1); // large effect
  });
});

describe('chiSquareTest', () => {
  it('detects significant difference in proportions', () => {
    // 10% vs 30% success rate
    const result = chiSquareTest(10, 100, 30, 100);
    expect(result.testName).toBe('Chi-square test');
    expect(result.statistic).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.significant).toBe(true);
  });

  it('returns not significant for similar proportions', () => {
    const result = chiSquareTest(50, 100, 52, 100);
    expect(result.significant).toBe(false);
  });

  it('handles zero total', () => {
    const result = chiSquareTest(0, 0, 10, 100);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBe(1);
    expect(result.statistic).toBe(0);
  });

  it('handles both zero totals', () => {
    const result = chiSquareTest(0, 0, 0, 0);
    expect(result.pValue).toBe(1);
  });

  it('computes Cramér V effect size', () => {
    const result = chiSquareTest(10, 100, 50, 100);
    expect(result.effectSize).toBeGreaterThan(0);
  });
});

describe('analyzeMetricImpact', () => {
  const changePoint: FlagChangePoint = {
    flag: 'test-flag',
    timestamp: Date.now(),
    action: 'enabled',
  };

  it('analyzes impact with significant change', () => {
    const before = [10, 12, 11, 13, 10, 12, 11, 10, 13, 12];
    const after = [20, 22, 21, 23, 20, 22, 21, 20, 23, 22];

    const analysis = analyzeMetricImpact('test-flag', changePoint, before, after, 'latency');
    expect(analysis.flag).toBe('test-flag');
    expect(analysis.metric).toBe('latency');
    expect(analysis.beforeSummary.mean).toBeCloseTo(11.4, 1);
    expect(analysis.afterSummary.mean).toBeCloseTo(21.4, 1);
    expect(analysis.changePercent).toBeGreaterThan(50);
    expect(analysis.statisticalTest.significant).toBe(true);
  });

  it('includes causal impact estimate', () => {
    const before = [10, 12, 11, 13, 10];
    const after = [20, 22, 21, 23, 20];
    const analysis = analyzeMetricImpact('flag', changePoint, before, after);
    expect(analysis.causalImpactEstimate).toBeDefined();
    expect(analysis.causalImpactEstimate!.pointEstimate).toBeGreaterThan(0);
  });

  it('handles empty before data', () => {
    const analysis = analyzeMetricImpact('flag', changePoint, [], [1, 2, 3]);
    expect(analysis.beforeSummary.count).toBe(0);
    expect(analysis.beforeSummary.mean).toBe(0);
  });

  it('handles single data point', () => {
    const analysis = analyzeMetricImpact('flag', changePoint, [5], [10]);
    expect(analysis.statisticalTest.significant).toBe(false);
  });

  it('handles zero before mean for changePercent', () => {
    const before = [0, 0, 0, 0, 0];
    const after = [10, 10, 10, 10, 10];
    const analysis = analyzeMetricImpact('flag', changePoint, before, after);
    expect(analysis.changePercent).toBe(0); // division by zero guarded
  });
});

describe('createPrometheusSource', () => {
  it('creates a source with correct name', () => {
    const source = createPrometheusSource('http://localhost:9090');
    expect(source.name).toBe('prometheus');
    expect(typeof source.query).toBe('function');
  });
});

describe('formatImpactAnalysis', () => {
  it('formats a complete impact analysis', () => {
    const changePoint: FlagChangePoint = {
      flag: 'test-flag',
      timestamp: 1700000000000,
      action: 'enabled',
    };
    const before = [10, 12, 11, 13, 10, 12, 11, 10, 13, 12];
    const after = [20, 22, 21, 23, 20, 22, 21, 20, 23, 22];
    const analysis = analyzeMetricImpact('test-flag', changePoint, before, after, 'error_rate');

    const output = formatImpactAnalysis(analysis);
    expect(output).toContain('Impact Analysis: test-flag');
    expect(output).toContain('error_rate');
    expect(output).toContain('Before:');
    expect(output).toContain('After:');
    expect(output).toContain('Statistical Test');
    expect(output).toContain('Causal Impact');
  });

  it('includes significance icons', () => {
    const changePoint: FlagChangePoint = { flag: 'f', timestamp: Date.now(), action: 'enabled' };
    const before = [10, 12, 11, 13, 10, 12, 11, 10, 13, 12];
    const after = [20, 22, 21, 23, 20, 22, 21, 20, 23, 22];
    const analysis = analyzeMetricImpact('f', changePoint, before, after);
    const output = formatImpactAnalysis(analysis);
    expect(output).toContain('✅'); // significant
  });
});
