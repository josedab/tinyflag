import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Tests for the optimize command's Thompson Sampling logic.
 *
 * Since handleOptimize uses process.exit() and module-level STATE_FILE,
 * we test the core optimizer functions directly from tinyflag core
 * and test the file persistence logic by replicating loadOptimizerStates/saveOptimizerStates.
 */

import {
  initOptimizerState,
  recordBanditConversion,
  updateWeights,
  formatOptimizerState,
} from 'tinyflag';
import type { OptimizerState } from 'tinyflag';

let tmpDir: string;
let stateFile: string;

function loadOptimizerStates(): Record<string, OptimizerState> {
  if (!existsSync(stateFile)) return {};
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function saveOptimizerStates(states: Record<string, OptimizerState>): void {
  writeFileSync(stateFile, JSON.stringify(states, null, 2));
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'optimize-test-'));
  stateFile = join(tmpDir, '.tinyflag-optimizer.json');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('optimizer state persistence', () => {
  it('returns empty object when no state file exists', () => {
    expect(loadOptimizerStates()).toEqual({});
  });

  it('saves and loads state roundtrip', () => {
    const state = initOptimizerState('my-flag', ['control', 'variant-a']);
    saveOptimizerStates({ 'my-flag': state });

    const loaded = loadOptimizerStates();
    expect(loaded['my-flag']).toBeDefined();
    expect(loaded['my-flag'].flag).toBe('my-flag');
    expect(loaded['my-flag'].variants).toHaveLength(2);
  });

  it('handles corrupted state file', () => {
    writeFileSync(stateFile, 'not valid json');
    expect(loadOptimizerStates()).toEqual({});
  });

  it('stores multiple flags independently', () => {
    const stateA = initOptimizerState('flag-a', ['v1', 'v2']);
    const stateB = initOptimizerState('flag-b', ['v1', 'v2', 'v3']);
    saveOptimizerStates({ 'flag-a': stateA, 'flag-b': stateB });

    const loaded = loadOptimizerStates();
    expect(Object.keys(loaded)).toEqual(['flag-a', 'flag-b']);
    expect(loaded['flag-a'].variants).toHaveLength(2);
    expect(loaded['flag-b'].variants).toHaveLength(3);
  });
});

describe('initOptimizerState', () => {
  it('creates state with N arms (variants)', () => {
    const state = initOptimizerState('ab-test', ['control', 'variant-a', 'variant-b']);
    expect(state.flag).toBe('ab-test');
    expect(state.variants).toHaveLength(3);
    expect(state.winner).toBeNull();
    expect(state.totalImpressions).toBe(0);
    expect(state.totalConversions).toBe(0);
  });

  it('assigns equal weights to variants', () => {
    const state = initOptimizerState('test', ['a', 'b']);
    expect(state.variants[0].weight).toBe(50);
    expect(state.variants[1].weight).toBe(50);
  });

  it('handles single arm', () => {
    const state = initOptimizerState('test', ['only-one']);
    expect(state.variants).toHaveLength(1);
    expect(state.variants[0].weight).toBe(100);
  });

  it('handles three variants with weight distribution', () => {
    const state = initOptimizerState('test', ['a', 'b', 'c']);
    const totalWeight = state.variants.reduce((sum, v) => sum + v.weight, 0);
    expect(totalWeight).toBe(100);
  });

  it('initializes beta parameters', () => {
    const state = initOptimizerState('test', ['a', 'b']);
    for (const v of state.variants) {
      expect(v.params.alpha).toBe(1);
      expect(v.params.beta).toBe(1);
    }
  });
});

describe('recordBanditConversion', () => {
  it('records conversion for a variant', () => {
    let state = initOptimizerState('test', ['a', 'b']);
    state = recordBanditConversion(state, 'a', true);

    const variantA = state.variants.find((v) => v.name === 'a')!;
    expect(variantA.impressions).toBe(1);
    expect(variantA.conversions).toBe(1);
    expect(state.totalImpressions).toBe(1);
    expect(state.totalConversions).toBe(1);
  });

  it('records impression without conversion', () => {
    let state = initOptimizerState('test', ['a', 'b']);
    state = recordBanditConversion(state, 'a', false);

    const variantA = state.variants.find((v) => v.name === 'a')!;
    expect(variantA.impressions).toBe(1);
    expect(variantA.conversions).toBe(0);
    expect(state.totalImpressions).toBe(1);
    expect(state.totalConversions).toBe(0);
  });

  it('handles nonexistent arm gracefully', () => {
    let state = initOptimizerState('test', ['a', 'b']);
    state = recordBanditConversion(state, 'nonexistent', true);

    // State should be unchanged for known variants
    expect(state.variants.find((v) => v.name === 'a')!.impressions).toBe(0);
    expect(state.variants.find((v) => v.name === 'b')!.impressions).toBe(0);
  });

  it('accumulates multiple conversions', () => {
    let state = initOptimizerState('test', ['a', 'b']);
    state = recordBanditConversion(state, 'a', true);
    state = recordBanditConversion(state, 'a', true);
    state = recordBanditConversion(state, 'a', false);
    state = recordBanditConversion(state, 'b', true);

    const variantA = state.variants.find((v) => v.name === 'a')!;
    expect(variantA.impressions).toBe(3);
    expect(variantA.conversions).toBe(2);

    expect(state.totalImpressions).toBe(4);
    expect(state.totalConversions).toBe(3);
  });
});

describe('updateWeights (Thompson Sampling)', () => {
  it('updates weights based on conversion data', () => {
    let state = initOptimizerState('test', ['a', 'b']);

    // Give 'a' more conversions
    for (let i = 0; i < 50; i++) {
      state = recordBanditConversion(state, 'a', true);
      state = recordBanditConversion(state, 'b', false);
    }

    state = updateWeights(state, { winnerThreshold: 0.95 }, 1000);

    // Variant 'a' should have higher weight since it has all conversions
    const variantA = state.variants.find((v) => v.name === 'a')!;
    const variantB = state.variants.find((v) => v.name === 'b')!;
    expect(variantA.weight).toBeGreaterThan(variantB.weight);
  });

  it('increments iteration counter', () => {
    let state = initOptimizerState('test', ['a', 'b']);
    state = recordBanditConversion(state, 'a', true);
    state = updateWeights(state, {}, 100);
    expect(state.iteration).toBe(1);
  });

  it('all arms equal produces balanced weights', () => {
    let state = initOptimizerState('test', ['a', 'b']);
    // Equal data
    for (let i = 0; i < 100; i++) {
      state = recordBanditConversion(state, 'a', true);
      state = recordBanditConversion(state, 'b', true);
    }

    state = updateWeights(state, { winnerThreshold: 0.95 }, 1000);

    const variantA = state.variants.find((v) => v.name === 'a')!;
    const variantB = state.variants.find((v) => v.name === 'b')!;
    // Weights should be roughly equal (within 20%)
    expect(Math.abs(variantA.weight - variantB.weight)).toBeLessThan(20);
  });

  it('handles state with no data', () => {
    let state = initOptimizerState('test', ['a', 'b']);
    state = updateWeights(state, {}, 100);
    // Should not crash, weights remain close to equal
    const totalWeight = state.variants.reduce((sum, v) => sum + v.weight, 0);
    expect(totalWeight).toBe(100);
  });
});

describe('formatOptimizerState', () => {
  it('formats state as human-readable string', () => {
    const state = initOptimizerState('my-flag', ['control', 'treatment']);
    const output = formatOptimizerState(state);
    expect(output).toContain('my-flag');
    expect(output).toContain('control');
    expect(output).toContain('treatment');
  });

  it('shows winner when declared', () => {
    let state = initOptimizerState('my-flag', ['a', 'b']);
    // Manually set winner for formatting test
    state = { ...state, winner: 'a', winnerProbability: 0.97 };
    const output = formatOptimizerState(state);
    expect(output).toContain('a');
  });
});

describe('optimizer integration', () => {
  it('full lifecycle: init → record → update → status', () => {
    // Init
    const state1 = initOptimizerState('checkout-test', ['old-checkout', 'new-checkout']);
    const states: Record<string, OptimizerState> = { 'checkout-test': state1 };
    saveOptimizerStates(states);

    // Record conversions
    let loaded = loadOptimizerStates();
    for (let i = 0; i < 30; i++) {
      loaded['checkout-test'] = recordBanditConversion(
        loaded['checkout-test'],
        'new-checkout',
        true,
      );
      loaded['checkout-test'] = recordBanditConversion(
        loaded['checkout-test'],
        'old-checkout',
        false,
      );
    }
    saveOptimizerStates(loaded);

    // Update weights
    loaded = loadOptimizerStates();
    loaded['checkout-test'] = updateWeights(
      loaded['checkout-test'],
      { winnerThreshold: 0.95 },
      1000,
    );
    saveOptimizerStates(loaded);

    // Status
    const final = loadOptimizerStates()['checkout-test'];
    expect(final.totalImpressions).toBe(60);
    expect(final.iteration).toBe(1);
    const newCheckout = final.variants.find((v) => v.name === 'new-checkout')!;
    expect(newCheckout.weight).toBeGreaterThan(50);

    const output = formatOptimizerState(final);
    expect(output).toContain('checkout-test');
  });
});
