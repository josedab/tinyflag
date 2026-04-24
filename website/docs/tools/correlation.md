---
sidebar_position: 15
title: Impact Correlation
description: Correlate flag changes with external metrics using statistical significance tests.
---

# Impact Correlation

The correlation engine analyzes whether flag changes (enable/disable/rollout adjustments) caused statistically significant changes in your metrics — error rates, latency, conversion rates, etc.

## Quick Start

```typescript
import { analyzeMetricImpact, createPrometheusSource, formatImpactAnalysis } from 'tinyflag';
import type { FlagChangePoint, MetricsSource } from 'tinyflag';

// Define when flag changes happened
const flagChanges: FlagChangePoint[] = [
  {
    flag: 'new-checkout',
    timestamp: new Date('2026-04-20T14:00:00Z').getTime(),
    action: 'enabled',
    before: { enabled: false },
    after: { enabled: true },
  },
];

// Use Prometheus as the metrics source
const metricsSource = createPrometheusSource('http://prometheus:9090');

// Analyze impact on error rate
const analysis = await analyzeMetricImpact(flagChanges, metricsSource, 'http_error_rate', {
  windowBefore: 3600000, // 1 hour before change
  windowAfter: 3600000, // 1 hour after change
  confidenceLevel: 0.95,
});

console.log(formatImpactAnalysis(analysis));
// Flag Change Impact Analysis
// ═══════════════════════════
// Flag: new-checkout (enabled)
// Metric: http_error_rate
// Before: mean=0.021 (n=360)
// After:  mean=0.035 (n=360)
// Change: +66.7%
// Welch's t-test: t=4.21, p=0.0003 (SIGNIFICANT at 95%)
// Chi-square: χ²=12.4, p=0.0004 (SIGNIFICANT at 95%)
```

## Statistical Tests

### Welch's t-Test

Compares the means of two groups (before/after) assuming unequal variances. Best for continuous metrics like latency or error rate.

```typescript
import { welchTTest } from 'tinyflag';

const before = [45, 52, 48, 50, 47, 53, 49];
const after = [62, 58, 65, 60, 63, 67, 61];

const result = welchTTest(before, after, 0.95);
console.log(result);
// {
//   testName: "Welch's t-test",
//   statistic: -5.83,
//   pValue: 0.0002,
//   significant: true,
//   confidenceLevel: 0.95,
//   effectSize: 0.87,
//   sampleSizeBefore: 7,
//   sampleSizeAfter: 7
// }
```

### Chi-Square Test

Compares proportions (e.g., conversion rates). Best for categorical outcomes.

```typescript
import { chiSquareTest } from 'tinyflag';

const result = chiSquareTest(
  { successes: 120, total: 1000 }, // Before: 12% conversion
  { successes: 150, total: 1000 }, // After: 15% conversion
  0.95,
);
console.log(result.significant); // true or false
```

## Metrics Sources

### Prometheus

```typescript
import { createPrometheusSource } from 'tinyflag';

const source = createPrometheusSource('http://prometheus:9090');
const data = await source.query('http_error_rate', startTime, endTime);
```

### Custom Source

Implement the `MetricsSource` interface to connect any metrics backend:

```typescript
import type { MetricsSource, MetricDataPoint } from 'tinyflag';

const datadogSource: MetricsSource = {
  name: 'datadog',
  async query(metric, startTime, endTime): Promise<MetricDataPoint[]> {
    const series = await datadogClient.queryTimeSeries(metric, startTime, endTime);
    return series.map((p) => ({ timestamp: p.time, value: p.value }));
  },
  async listMetrics(): Promise<string[]> {
    return datadogClient.getMetricNames();
  },
};
```

## Impact Analysis Result

```typescript
interface ImpactAnalysis {
  flagChange: FlagChangePoint;
  metric: string;
  before: { mean: number; stddev: number; samples: number };
  after: { mean: number; stddev: number; samples: number };
  changePercent: number;
  tTest: StatisticalTestResult;
  chiSquare?: StatisticalTestResult;
  conclusion: 'significant-increase' | 'significant-decrease' | 'no-significant-change';
}
```

## Use Cases

- **Post-deploy validation**: After enabling a flag, check if error rates or latency changed significantly
- **Rollback decisions**: Provide statistical evidence for whether a flag change caused a regression
- **A/B test metrics**: Compare business metrics between flag-on and flag-off periods
- **Change review**: Include impact analysis in PR reviews for flag changes
