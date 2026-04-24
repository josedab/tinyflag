/**
 * Flag-Aware Performance Testing for TinyFlag.
 *
 * Generates combinatorial test matrices from flag definitions with smart pruning,
 * produces k6/Artillery/Locust test scripts, and comparison reports.
 */

import type { FlagConfig, FlagDefinition } from './types.js';

// --- Test Matrix Generation ---

/** A single flag combination for testing. */
export interface FlagCombination {
  id: string;
  flags: Record<string, boolean>;
  description: string;
}

/** Test matrix — all combinations to test. */
export interface TestMatrix {
  combinations: FlagCombination[];
  totalFlags: number;
  prunedFlags: number;
  prunedCombinations: number;
  generatedAt: number;
}

/** Options for test matrix generation. */
export interface MatrixOptions {
  /** Maximum number of combinations. Default: 64. */
  maxCombinations?: number;
  /** Only include flags matching these tags. */
  tags?: string[];
  /** Exclude specific flags. */
  exclude?: string[];
  /** Only include flags with rollout defined. */
  rolloutOnly?: boolean;
}

/**
 * Generate a test matrix from flag definitions.
 * Uses smart pruning to limit combinatorial explosion.
 */
export function generateTestMatrix(config: FlagConfig, options: MatrixOptions = {}): TestMatrix {
  const maxCombinations = options.maxCombinations ?? 64;

  // Filter flags
  let flagEntries = Object.entries(config.flags);
  const totalFlags = flagEntries.length;

  if (options.tags?.length) {
    flagEntries = flagEntries.filter(([, def]) => def.tags?.some((t) => options.tags!.includes(t)));
  }

  if (options.exclude?.length) {
    flagEntries = flagEntries.filter(([name]) => !options.exclude!.includes(name));
  }

  if (options.rolloutOnly) {
    flagEntries = flagEntries.filter(([, def]) => def.rollout !== undefined);
  }

  // Smart pruning: limit flags to log2(maxCombinations)
  const maxFlags = Math.floor(Math.log2(maxCombinations));
  const prunedFlags = Math.max(0, flagEntries.length - maxFlags);

  // Prioritize flags with variants or rollout (more interesting to test)
  flagEntries.sort((a, b) => {
    const scoreA =
      (a[1].variants?.length ?? 0) * 2 + (a[1].rollout ? 1 : 0) + (a[1].rules?.length ?? 0);
    const scoreB =
      (b[1].variants?.length ?? 0) * 2 + (b[1].rollout ? 1 : 0) + (b[1].rules?.length ?? 0);
    return scoreB - scoreA;
  });

  flagEntries = flagEntries.slice(0, maxFlags);
  const flagNames = flagEntries.map(([name]) => name);
  const n = flagNames.length;
  const totalCombinations = Math.pow(2, n);
  const prunedCombinations = Math.max(0, totalCombinations - maxCombinations);

  // Generate combinations (binary enumeration)
  const combinations: FlagCombination[] = [];
  const limit = Math.min(totalCombinations, maxCombinations);

  for (let i = 0; i < limit; i++) {
    const flags: Record<string, boolean> = {};
    const parts: string[] = [];

    for (let j = 0; j < n; j++) {
      const enabled = (i & (1 << j)) !== 0;
      flags[flagNames[j]] = enabled;
      if (enabled) parts.push(flagNames[j]);
    }

    combinations.push({
      id: `combo-${i}`,
      flags,
      description: parts.length > 0 ? parts.join(' + ') : '(all off)',
    });
  }

  return {
    combinations,
    totalFlags,
    prunedFlags,
    prunedCombinations,
    generatedAt: Date.now(),
  };
}

// --- Performance Test Results ---

/** Performance metrics for a single combination. */
export interface PerfMetrics {
  combinationId: string;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  throughput: number;
  errorRate: number;
  duration: number;
}

/** Performance comparison result. */
export interface PerfComparison {
  baseline: PerfMetrics;
  current: PerfMetrics;
  latencyP99Change: number;
  throughputChange: number;
  errorRateChange: number;
  withinBudget: boolean;
}

/** Full performance test report. */
export interface PerfReport {
  matrix: TestMatrix;
  results: PerfMetrics[];
  comparisons: PerfComparison[];
  worstCase: PerfMetrics | null;
  allWithinBudget: boolean;
  latencyBudget: number;
  generatedAt: number;
}

/**
 * Compare two performance results.
 */
export function comparePerf(
  baseline: PerfMetrics,
  current: PerfMetrics,
  latencyBudget: number = 200,
): PerfComparison {
  const latencyP99Change =
    baseline.latencyP99 > 0
      ? ((current.latencyP99 - baseline.latencyP99) / baseline.latencyP99) * 100
      : 0;
  const throughputChange =
    baseline.throughput > 0
      ? ((current.throughput - baseline.throughput) / baseline.throughput) * 100
      : 0;
  const errorRateChange = current.errorRate - baseline.errorRate;

  return {
    baseline,
    current,
    latencyP99Change,
    throughputChange,
    errorRateChange,
    withinBudget: current.latencyP99 <= latencyBudget && current.errorRate <= 0.05,
  };
}

/**
 * Generate a performance report from test results.
 */
export function generatePerfReport(
  matrix: TestMatrix,
  results: PerfMetrics[],
  latencyBudget: number = 200,
): PerfReport {
  const comparisons: PerfComparison[] = [];

  // Use first result (all flags off) as baseline
  const baseline = results[0];
  if (baseline) {
    for (let i = 1; i < results.length; i++) {
      comparisons.push(comparePerf(baseline, results[i], latencyBudget));
    }
  }

  const worstCase =
    results.length > 0
      ? results.reduce((worst, r) => (r.latencyP99 > worst.latencyP99 ? r : worst))
      : null;

  return {
    matrix,
    results,
    comparisons,
    worstCase,
    allWithinBudget: comparisons.every((c) => c.withinBudget),
    latencyBudget,
    generatedAt: Date.now(),
  };
}

// --- Test Script Generation ---

/**
 * Generate a k6 test script for a flag combination.
 */
export function generateK6Script(
  combination: FlagCombination,
  baseUrl: string,
  options: { duration?: string; vus?: number } = {},
): string {
  const duration = options.duration ?? '30s';
  const vus = options.vus ?? 10;
  const flagOverrides = JSON.stringify(combination.flags);

  return `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: ${vus},
  duration: '${duration}',
  thresholds: {
    http_req_duration: ['p(99)<200'],
    http_req_failed: ['rate<0.05'],
  },
  tags: { combination: '${combination.id}' },
};

const FLAG_OVERRIDES = ${flagOverrides};

export default function () {
  const res = http.get('${baseUrl}', {
    headers: {
      'X-TinyFlag-Overrides': JSON.stringify(FLAG_OVERRIDES),
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(0.1);
}
`;
}

/**
 * Generate an Artillery test config for a flag combination.
 */
export function generateArtilleryConfig(
  combination: FlagCombination,
  baseUrl: string,
  options: { duration?: number; arrivalRate?: number } = {},
): string {
  const duration = options.duration ?? 30;
  const arrivalRate = options.arrivalRate ?? 10;

  return `config:
  target: "${baseUrl}"
  phases:
    - duration: ${duration}
      arrivalRate: ${arrivalRate}
      name: "test-${combination.id}"
  defaults:
    headers:
      X-TinyFlag-Overrides: '${JSON.stringify(combination.flags)}'

scenarios:
  - name: "${combination.description}"
    flow:
      - get:
          url: "/"
          expect:
            - statusCode: 200
`;
}

// --- Formatting ---

/** Format test matrix as human-readable output. */
export function formatTestMatrix(matrix: TestMatrix): string {
  const lines: string[] = [];

  lines.push('🧪 Performance Test Matrix');
  lines.push('═'.repeat(50));
  lines.push(
    `Total flags: ${matrix.totalFlags} | Tested: ${matrix.totalFlags - matrix.prunedFlags} | Pruned: ${matrix.prunedFlags}`,
  );
  lines.push(`Combinations: ${matrix.combinations.length}`);
  lines.push('');

  for (const combo of matrix.combinations) {
    const flags = Object.entries(combo.flags)
      .map(([name, on]) => `${on ? '✅' : '⬜'} ${name}`)
      .join('  ');
    lines.push(`  ${combo.id}: ${flags}`);
  }

  return lines.join('\n');
}

/** Format performance report as human-readable output. */
export function formatPerfReport(report: PerfReport): string {
  const lines: string[] = [];

  lines.push('📊 Performance Test Report');
  lines.push('═'.repeat(60));
  lines.push(`Combinations tested: ${report.results.length}`);
  lines.push(`Latency budget: ${report.latencyBudget}ms (p99)`);
  lines.push(`All within budget: ${report.allWithinBudget ? '✅ Yes' : '❌ No'}`);
  lines.push('');

  if (report.worstCase) {
    lines.push(`Worst case: ${report.worstCase.combinationId}`);
    lines.push(
      `  p99: ${report.worstCase.latencyP99.toFixed(1)}ms | errors: ${(report.worstCase.errorRate * 100).toFixed(2)}%`,
    );
    lines.push('');
  }

  lines.push('Results:');
  for (const r of report.results) {
    const budget = r.latencyP99 <= report.latencyBudget ? '✅' : '❌';
    lines.push(
      `  ${budget} ${r.combinationId}: p50=${r.latencyP50.toFixed(1)}ms p99=${r.latencyP99.toFixed(1)}ms throughput=${r.throughput.toFixed(0)}req/s errors=${(r.errorRate * 100).toFixed(2)}%`,
    );
  }

  if (report.comparisons.length > 0) {
    lines.push('');
    lines.push('Comparisons vs baseline:');
    for (const c of report.comparisons) {
      const direction = c.latencyP99Change >= 0 ? '📈' : '📉';
      lines.push(
        `  ${direction} ${c.current.combinationId}: latency ${c.latencyP99Change >= 0 ? '+' : ''}${c.latencyP99Change.toFixed(1)}% | throughput ${c.throughputChange >= 0 ? '+' : ''}${c.throughputChange.toFixed(1)}%`,
      );
    }
  }

  return lines.join('\n');
}
