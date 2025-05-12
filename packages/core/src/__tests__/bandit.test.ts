import { describe, it, expect } from 'vitest';
import {
  initOptimizerState,
  recordConversion,
  updateWeights,
  getRecommendation,
  formatOptimizerState,
} from '../bandit.js';

describe('initOptimizerState', () => {
  it('initializes with N arms and equal weights', () => {
    const state = initOptimizerState('flag-1', ['a', 'b', 'c']);
    expect(state.flag).toBe('flag-1');
    expect(state.variants).toHaveLength(3);
    expect(state.winner).toBeNull();
    expect(state.totalImpressions).toBe(0);
    expect(state.totalConversions).toBe(0);
    expect(state.iteration).toBe(0);

    // Weights should sum to 100
    const totalWeight = state.variants.reduce((s, v) => s + v.weight, 0);
    expect(totalWeight).toBe(100);
  });

  it('initializes with default prior alpha=1, beta=1', () => {
    const state = initOptimizerState('flag-1', ['a', 'b']);
    for (const v of state.variants) {
      expect(v.params.alpha).toBe(1);
      expect(v.params.beta).toBe(1);
    }
  });

  it('accepts custom prior config', () => {
    const state = initOptimizerState('flag-1', ['a', 'b'], { priorAlpha: 2, priorBeta: 5 });
    for (const v of state.variants) {
      expect(v.params.alpha).toBe(2);
      expect(v.params.beta).toBe(5);
    }
  });

  it('handles single arm', () => {
    const state = initOptimizerState('flag-1', ['only']);
    expect(state.variants).toHaveLength(1);
    expect(state.variants[0].weight).toBe(100);
  });
});

describe('recordConversion', () => {
  it('updates success count on conversion', () => {
    let state = initOptimizerState('flag-1', ['a', 'b']);
    state = recordConversion(state, 'a', true);

    const varA = state.variants.find((v) => v.name === 'a')!;
    expect(varA.params.alpha).toBe(2); // prior 1 + 1
    expect(varA.params.beta).toBe(1);
    expect(varA.impressions).toBe(1);
    expect(varA.conversions).toBe(1);
    expect(state.totalImpressions).toBe(1);
    expect(state.totalConversions).toBe(1);
  });

  it('updates failure count on non-conversion', () => {
    let state = initOptimizerState('flag-1', ['a', 'b']);
    state = recordConversion(state, 'a', false);

    const varA = state.variants.find((v) => v.name === 'a')!;
    expect(varA.params.alpha).toBe(1);
    expect(varA.params.beta).toBe(2); // prior 1 + 1
    expect(varA.impressions).toBe(1);
    expect(varA.conversions).toBe(0);
    expect(state.totalConversions).toBe(0);
  });

  it('computes conversionRate correctly', () => {
    let state = initOptimizerState('flag-1', ['a']);
    state = recordConversion(state, 'a', true);
    state = recordConversion(state, 'a', true);
    state = recordConversion(state, 'a', false);

    const varA = state.variants.find((v) => v.name === 'a')!;
    expect(varA.conversionRate).toBeCloseTo(2 / 3, 5);
  });

  it('does not modify other variants', () => {
    let state = initOptimizerState('flag-1', ['a', 'b']);
    state = recordConversion(state, 'a', true);

    const varB = state.variants.find((v) => v.name === 'b')!;
    expect(varB.impressions).toBe(0);
    expect(varB.params.alpha).toBe(1);
  });
});

describe('updateWeights', () => {
  it('rebalances weights via Thompson sampling', () => {
    let state = initOptimizerState('flag-1', ['a', 'b']);

    // Give 'a' many conversions, 'b' none
    for (let i = 0; i < 50; i++) {
      state = recordConversion(state, 'a', true);
      state = recordConversion(state, 'b', false);
    }

    state = updateWeights(state);
    const varA = state.variants.find((v) => v.name === 'a')!;
    const varB = state.variants.find((v) => v.name === 'b')!;

    // 'a' should have higher weight
    expect(varA.weight).toBeGreaterThan(varB.weight);
    expect(state.iteration).toBe(1);
  });

  it('weights sum to 100', () => {
    let state = initOptimizerState('flag-1', ['a', 'b', 'c']);
    for (let i = 0; i < 20; i++) {
      state = recordConversion(state, 'a', true);
      state = recordConversion(state, 'b', Math.random() > 0.5);
      state = recordConversion(state, 'c', false);
    }
    state = updateWeights(state);

    const total = state.variants.reduce((s, v) => s + v.weight, 0);
    expect(total).toBe(100);
  });

  it('declares winner when probability exceeds threshold', () => {
    let state = initOptimizerState('flag-1', ['a', 'b'], { minImpressions: 10 });

    // Clear winner: 'a' converts 90%, 'b' converts 5%
    for (let i = 0; i < 100; i++) {
      state = recordConversion(state, 'a', Math.random() < 0.9);
      state = recordConversion(state, 'b', Math.random() < 0.05);
    }

    state = updateWeights(state, { minImpressions: 10 });
    expect(state.winner).toBe('a');
    expect(state.winnerProbability).toBeGreaterThan(0.95);
  });

  it('does not declare winner before min impressions', () => {
    let state = initOptimizerState('flag-1', ['a', 'b'], { minImpressions: 1000 });
    for (let i = 0; i < 10; i++) {
      state = recordConversion(state, 'a', true);
      state = recordConversion(state, 'b', false);
    }
    state = updateWeights(state, { minImpressions: 1000 });
    expect(state.winner).toBeNull();
  });

  it('handles all arms equal', () => {
    let state = initOptimizerState('flag-1', ['a', 'b']);
    for (let i = 0; i < 50; i++) {
      state = recordConversion(state, 'a', true);
      state = recordConversion(state, 'b', true);
    }
    state = updateWeights(state, { minImpressions: 10 });
    // With equal performance, neither should be a clear winner
    // winnerProbability should be ~0.5
    expect(state.winnerProbability).toBeLessThan(0.95);
    expect(state.winner).toBeNull();
  });
});

describe('getRecommendation', () => {
  it('returns declare-winner when winner exists', () => {
    const state = initOptimizerState('flag-1', ['a', 'b']);
    const modifiedState = { ...state, winner: 'a', winnerProbability: 0.98 };
    const rec = getRecommendation(modifiedState);
    expect(rec.action).toBe('declare-winner');
    expect(rec.message).toContain('a');
  });

  it('returns needs-data when impressions are low', () => {
    const state = initOptimizerState('flag-1', ['a', 'b']);
    const rec = getRecommendation(state);
    expect(rec.action).toBe('needs-data');
    expect(rec.message).toContain('0/100');
  });

  it('returns continue when enough data but no winner', () => {
    let state = initOptimizerState('flag-1', ['a', 'b']);
    for (let i = 0; i < 100; i++) {
      state = recordConversion(state, 'a', true);
      state = recordConversion(state, 'b', true);
    }
    const rec = getRecommendation(state);
    expect(rec.action).toBe('continue');
  });
});

describe('formatOptimizerState', () => {
  it('formats state with variants', () => {
    let state = initOptimizerState('flag-1', ['a', 'b']);
    for (let i = 0; i < 10; i++) {
      state = recordConversion(state, 'a', true);
      state = recordConversion(state, 'b', false);
    }
    state = updateWeights(state, { minImpressions: 100 });

    const output = formatOptimizerState(state);
    expect(output).toContain('Multi-Armed Bandit: flag-1');
    expect(output).toContain('Variants:');
    expect(output).toContain('Weight:');
    expect(output).toContain('Rate:');
    expect(output).toContain('Beta(');
  });

  it('shows winner when declared', () => {
    const state = {
      ...initOptimizerState('flag-1', ['a', 'b']),
      winner: 'a',
      winnerProbability: 0.97,
    };
    const output = formatOptimizerState(state);
    expect(output).toContain('Winner: a');
  });

  it('handles zero trials', () => {
    const state = initOptimizerState('flag-1', ['a', 'b']);
    const output = formatOptimizerState(state);
    expect(output).toContain('0 impressions');
    expect(output).toContain('0 conversions');
  });
});
