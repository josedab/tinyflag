---
sidebar_position: 17
title: Performance Testing
description: Generate flag-aware test matrices and load test scripts for k6 and Artillery.
---

# Performance Testing

TinyFlag generates combinatorial test matrices from your flag definitions and produces ready-to-run load test scripts for k6 and Artillery. This ensures your application performs well under all flag combinations — not just the current production state.

## Test Matrix Generation

```typescript
import { generateTestMatrix, formatTestMatrix } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

const matrix = generateTestMatrix(
  { flags: ff.getFlags() },
  {
    maxCombinations: 32, // Cap total combinations (default: 64)
    tags: ['performance'], // Only flags tagged 'performance'
    exclude: ['debug-mode'], // Skip specific flags
    rolloutOnly: false, // Include all flags, not just rollout flags
  },
);

console.log(formatTestMatrix(matrix));
// Test Matrix: 16 combinations from 4 flags (pruned 2 flags, 48 combinations)
// ─────────────────────────────────────────
// combo-0: (all off)
// combo-1: new-checkout
// combo-2: dark-mode
// combo-3: new-checkout + dark-mode
// ...
```

### Smart Pruning

When you have many flags, the matrix would explode combinatorially (2^n). TinyFlag uses smart pruning:

1. **Flag prioritization**: Flags with variants, rollout percentages, and rules are tested first
2. **Automatic limit**: Maximum flags = `log₂(maxCombinations)` (e.g., 6 flags for 64 combinations)
3. **Tag filtering**: Focus on flags that matter for performance

## Comparing Performance Results

After running tests for each combination, compare results:

```typescript
import { comparePerf, generatePerfReport, formatPerfReport } from 'tinyflag';
import type { PerfMetrics } from 'tinyflag';

// Collect metrics for each combination (from your load test tool)
const metrics: PerfMetrics[] = [
  {
    combinationId: 'combo-0',
    latencyP50: 45,
    latencyP95: 120,
    latencyP99: 250,
    throughput: 1500,
    errorRate: 0.001,
    memoryMB: 256,
  },
  {
    combinationId: 'combo-1',
    latencyP50: 48,
    latencyP95: 135,
    latencyP99: 280,
    throughput: 1450,
    errorRate: 0.002,
    memoryMB: 260,
  },
  // ...
];

// Compare pairs
const comparison = comparePerf(metrics[0], metrics[1]);
console.log(comparison);
// {
//   baseline: 'combo-0',
//   candidate: 'combo-1',
//   latencyP99Change: +12.0%,
//   throughputChange: -3.3%,
//   errorRateChange: +100.0%,
//   regression: true
// }

// Full report
const report = generatePerfReport(matrix, metrics);
console.log(formatPerfReport(report));
```

## Load Test Script Generation

### k6

```typescript
import { generateK6Script } from 'tinyflag';

const script = generateK6Script(matrix, {
  baseUrl: 'http://localhost:3000',
  duration: '30s',
  vus: 50,
  endpoint: '/api/checkout',
});

fs.writeFileSync('./perf/k6-test.js', script);
// Run: k6 run ./perf/k6-test.js
```

### Artillery

```typescript
import { generateArtilleryConfig } from 'tinyflag';

const config = generateArtilleryConfig(matrix, {
  target: 'http://localhost:3000',
  duration: 30,
  arrivalRate: 50,
  endpoint: '/api/checkout',
});

fs.writeFileSync('./perf/artillery.yml', config);
// Run: artillery run ./perf/artillery.yml
```

## Types

```typescript
interface TestMatrix {
  combinations: FlagCombination[];
  totalFlags: number;
  prunedFlags: number;
  prunedCombinations: number;
  generatedAt: number;
}

interface FlagCombination {
  id: string; // e.g., 'combo-0'
  flags: Record<string, boolean>; // Flag states for this combination
  description: string; // e.g., 'new-checkout + dark-mode'
}

interface PerfMetrics {
  combinationId: string;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  throughput: number; // Requests per second
  errorRate: number; // 0–1
  memoryMB?: number;
}

interface PerfComparison {
  baseline: string;
  candidate: string;
  latencyP99Change: number;
  throughputChange: number;
  errorRateChange: number;
  regression: boolean;
}
```

## Workflow

1. **Generate matrix**: `generateTestMatrix()` with your current flag config
2. **Generate scripts**: `generateK6Script()` or `generateArtilleryConfig()`
3. **Run tests**: Execute each combination scenario
4. **Compare**: `comparePerf()` to find regressions
5. **Report**: `generatePerfReport()` for a comprehensive summary
6. **CI integration**: Fail the build if any combination shows a regression above your threshold
