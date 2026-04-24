---
sidebar_position: 10
title: A/B Experiments
description: Track conversions, compute confidence intervals, and declare experiment winners.
---

# A/B Experiments

TinyFlag includes a built-in experiment tracker for analyzing A/B test results. Define experiment metadata on flags, record conversions, and get statistically rigorous results — all without external analytics tools.

## Defining an Experiment

Add an `experiment` field to any flag with variants:

```yaml
flags:
  checkout-flow:
    enabled: true
    variants:
      - name: control
        weight: 50
      - name: new-flow
        weight: 50
    experiment:
      metric: conversion_rate
      minimumSampleSize: 200
      confidenceLevel: 0.95
      method: bayesian # or 'frequentist'
```

## Tracking Exposures and Conversions

```typescript
import { TinyFlag, ExperimentTracker, formatExperimentResults } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

const tracker = new ExperimentTracker();

// Track exposures when variants are assigned
ff.on('exposure', (event) => {
  if (event.variant) {
    tracker.trackExposure(event.flag, event.variant, event.userId);
  }
});

// Track conversions when users complete the goal
function onCheckoutComplete(userId: string) {
  const variant = ff.getVariant('checkout-flow', { userId });
  if (variant) {
    tracker.trackConversion('checkout-flow', variant, userId);
  }
}

// Track continuous values (e.g., revenue)
function onPurchase(userId: string, amount: number) {
  const variant = ff.getVariant('checkout-flow', { userId });
  if (variant) {
    tracker.trackConversion('checkout-flow', variant, userId, amount);
  }
}
```

## Analyzing Results

```typescript
const flag = ff.getFlags()['checkout-flow'];
const results = tracker.analyze('checkout-flow', flag.experiment!);

console.log(formatExperimentResults(results));
// Experiment: checkout-flow (metric: conversion_rate)
// Method: bayesian | Confidence: 95.0%
// ──────────────────────────────────────────
// control   : 1,250 samples, 312 conversions (25.0%) [22.6% – 27.4%]
// new-flow  : 1,248 samples, 374 conversions (30.0%) [27.4% – 32.5%]
// ──────────────────────────────────────────
// Winner: new-flow (significant: true)
```

## Experiment Result Shape

```typescript
interface ExperimentResult {
  flag: string;
  metric: string;
  method: 'bayesian' | 'frequentist';
  variants: VariantResult[];
  winner: string | null; // null if not yet significant
  significant: boolean;
  confidenceLevel: number;
  totalSamples: number;
}

interface VariantResult {
  name: string;
  sampleSize: number;
  conversions: number;
  conversionRate: number;
  confidenceInterval: [number, number];
  meanValue?: number; // Present for continuous metrics
}
```

## Experiment Configuration

| Field               | Type                          | Default      | Description                             |
| ------------------- | ----------------------------- | ------------ | --------------------------------------- |
| `metric`            | `string`                      | **required** | Metric name for this experiment         |
| `minimumSampleSize` | `number`                      | `100`        | Min samples per variant before analysis |
| `confidenceLevel`   | `number`                      | `0.95`       | Confidence level for significance tests |
| `method`            | `'bayesian' \| 'frequentist'` | `'bayesian'` | Statistical test method                 |

## Notes

- The `ExperimentTracker` is **in-memory only** — for production use, persist events to your analytics system and feed results back into the tracker.
- The bayesian method uses Beta-Binomial posterior probability for conversion rates.
- The frequentist method uses chi-square goodness-of-fit for conversion comparison.
- A winner is declared only when both the minimum sample size is met and the confidence threshold is exceeded.
