/**
 * Edge evaluation benchmarks for TinyFlag.
 * Run with: node --import tsx packages/edge/src/benchmark.ts
 */
import type { EdgeFlagOptions, EdgeFlagResult } from './index.js';

export interface BenchmarkResult {
  platform: string;
  iterations: number;
  p50Ms: number;
  p99Ms: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  memoryKB: number;
}

/**
 * Run a micro-benchmark for edge flag evaluation.
 */
export function benchmarkEvaluation(
  evaluator: (request: Request) => EdgeFlagResult,
  options: { iterations?: number; warmup?: number } = {},
): BenchmarkResult {
  const iterations = options.iterations ?? 10000;
  const warmup = options.warmup ?? 100;
  const times: number[] = [];

  // Create a sample request
  const request = new Request('https://example.com/page', {
    headers: {
      'x-user-id': 'bench-user-1',
      cookie: 'tinyflag-plan=pro',
      'cf-ipcountry': 'US',
    },
  });

  // Warmup phase
  for (let i = 0; i < warmup; i++) {
    evaluator(request);
  }

  // Measurement phase
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    evaluator(request);
    const end = performance.now();
    times.push(end - start);
  }

  times.sort((a, b) => a - b);

  const memoryUsage =
    typeof globalThis !== 'undefined' && 'process' in globalThis
      ? (
          globalThis as Record<string, unknown> as {
            process: { memoryUsage: () => { heapUsed: number } };
          }
        ).process.memoryUsage().heapUsed / 1024
      : 0;

  return {
    platform: detectPlatform(),
    iterations,
    p50Ms: times[Math.floor(times.length * 0.5)],
    p99Ms: times[Math.floor(times.length * 0.99)],
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: times[0],
    maxMs: times[times.length - 1],
    memoryKB: Math.round(memoryUsage),
  };
}

/** Format benchmark results as a table. */
export function formatBenchmarkResults(results: BenchmarkResult[]): string {
  const lines: string[] = [];
  lines.push('📊 Edge Evaluation Benchmarks');
  lines.push('');
  lines.push('  Platform          p50(ms)   p99(ms)   avg(ms)   min(ms)   max(ms)   Memory(KB)');
  lines.push('  ' + '─'.repeat(80));

  for (const r of results) {
    const platform = r.platform.padEnd(18);
    const p50 = r.p50Ms.toFixed(3).padStart(8);
    const p99 = r.p99Ms.toFixed(3).padStart(8);
    const avg = r.avgMs.toFixed(3).padStart(8);
    const min = r.minMs.toFixed(3).padStart(8);
    const max = r.maxMs.toFixed(3).padStart(8);
    const mem = String(r.memoryKB).padStart(10);
    lines.push(`  ${platform}${p50}  ${p99}  ${avg}  ${min}  ${max}  ${mem}`);
  }

  return lines.join('\n');
}

function detectPlatform(): string {
  if (typeof globalThis !== 'undefined') {
    if ('Deno' in globalThis) return 'Deno Deploy';
    if (
      'caches' in globalThis &&
      typeof (globalThis as Record<string, unknown>).caches === 'object'
    )
      return 'Cloudflare Workers';
  }
  const g = globalThis as Record<string, unknown>;
  if (
    typeof g.process !== 'undefined' &&
    (g.process as Record<string, unknown>)?.env &&
    ((g.process as Record<string, unknown>).env as Record<string, unknown>)?.VERCEL
  )
    return 'Vercel Edge';
  return 'Node.js';
}
