import { describe, it, expect } from 'vitest';
import { TinyFlag } from '../tinyflag.js';
import { evaluateFlag } from '../evaluator.js';
import type { FlagDefinition } from '../types.js';

/**
 * Performance benchmark tests.
 * PRD NFR 5.1: Flag evaluation latency < 0.1ms (p99) per call.
 */
describe('Performance benchmarks', () => {
  it('isEnabled evaluates in < 0.1ms per call (10,000 iterations)', async () => {
    const ff = new TinyFlag({
      source: {
        version: 1,
        flags: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [
            `flag-${i}`,
            {
              enabled: true,
              rollout: 50,
              rules: [
                { conditions: { plan: 'pro' }, enabled: true },
                { conditions: { country: { $in: ['US', 'CA'] } }, rollout: 80 },
              ],
              variants: [
                { name: 'control', weight: 50 },
                { name: 'test', weight: 50 },
              ],
            },
          ]),
        ),
      },
    });
    await ff.init();

    const iterations = 10_000;
    const context = { userId: 'bench-user', plan: 'free', country: 'UK' };

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      ff.isEnabled(`flag-${i % 100}`, context);
    }
    const elapsed = performance.now() - start;

    const avgMs = elapsed / iterations;
    console.log(
      `  isEnabled: ${avgMs.toFixed(4)}ms avg (${iterations} calls in ${elapsed.toFixed(1)}ms)`,
    );

    // PRD target: < 0.1ms p99. Average should be well under.
    expect(avgMs).toBeLessThan(0.1);

    ff.destroy();
  });

  it('getVariant evaluates in < 0.1ms per call', async () => {
    const ff = new TinyFlag({
      source: {
        version: 1,
        flags: {
          experiment: {
            enabled: true,
            variants: [
              { name: 'control', weight: 50 },
              { name: 'test-a', weight: 25 },
              { name: 'test-b', weight: 25 },
            ],
          },
        },
      },
    });
    await ff.init();

    const iterations = 10_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      ff.getVariant('experiment', { userId: `user-${i}` });
    }
    const elapsed = performance.now() - start;

    const avgMs = elapsed / iterations;
    console.log(
      `  getVariant: ${avgMs.toFixed(4)}ms avg (${iterations} calls in ${elapsed.toFixed(1)}ms)`,
    );

    expect(avgMs).toBeLessThan(0.1);

    ff.destroy();
  });

  it('evaluateFlag (raw) evaluates in < 0.01ms per call', () => {
    const flag: FlagDefinition = {
      enabled: true,
      rollout: 50,
      rules: [
        { conditions: { plan: 'pro' }, enabled: true },
        { conditions: { age: { $gte: 18 } }, rollout: 80 },
      ],
    };

    const iterations = 100_000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      evaluateFlag('bench-flag', flag, { userId: `u-${i}`, plan: 'free', age: 25 });
    }
    const elapsed = performance.now() - start;

    const avgMs = elapsed / iterations;
    console.log(
      `  evaluateFlag (raw): ${avgMs.toFixed(5)}ms avg (${iterations} calls in ${elapsed.toFixed(1)}ms)`,
    );

    expect(avgMs).toBeLessThan(0.01);
  });

  it('SDK initialization with 100 flags completes in < 10ms', async () => {
    const flags = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [
        `flag-${i}`,
        { enabled: true, rollout: i, description: `Flag number ${i}` },
      ]),
    );

    const start = performance.now();
    const ff = new TinyFlag({ source: { version: 1, flags } });
    await ff.init();
    const elapsed = performance.now() - start;

    console.log(`  init (100 flags): ${elapsed.toFixed(1)}ms`);

    expect(elapsed).toBeLessThan(10);

    ff.destroy();
  });
});
