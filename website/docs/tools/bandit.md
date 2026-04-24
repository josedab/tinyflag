---
sidebar_position: 16
title: Bandit Optimizer
description: Multi-armed bandit auto-optimizer using Thompson Sampling for variant weights.
---

# Bandit Optimizer

The bandit optimizer implements Beta-Binomial Thompson Sampling to automatically adjust variant weights based on conversion data. Unlike static A/B tests, the bandit shifts traffic toward the winning variant in real-time, reducing opportunity cost.

## When to Use

| Approach   | Best For               | Trade-off                     |
| ---------- | ---------------------- | ----------------------------- |
| A/B Test   | Precise measurement    | Equal traffic to all variants |
| **Bandit** | Maximizing conversions | Less statistical precision    |

Use the bandit when you want to **optimize** rather than **measure** — e.g., optimizing checkout button copy, pricing tiers, or landing page layouts.

## Quick Start

```typescript
import {
  initOptimizerState,
  recordBanditConversion,
  updateWeights,
  getRecommendation,
  formatOptimizerState,
} from 'tinyflag';

// Initialize with your variant names
let state = initOptimizerState('checkout-button', ['buy-now', 'add-to-cart', 'get-started'], {
  winnerThreshold: 0.95, // Declare winner at 95% probability
  minImpressions: 100, // Minimum impressions per variant
});

// Record impressions and conversions as they happen
state = recordBanditConversion(state, 'buy-now', true); // Conversion
state = recordBanditConversion(state, 'add-to-cart', false); // No conversion
state = recordBanditConversion(state, 'get-started', true); // Conversion

// Update variant weights based on posterior probabilities
state = updateWeights(state);

// Check for a recommendation
const rec = getRecommendation(state);
console.log(rec);
// {
//   winner: null,              // null until threshold is met
//   recommendation: 'continue', // 'continue' | 'winner-found'
//   weights: { 'buy-now': 45, 'add-to-cart': 20, 'get-started': 35 }
// }

// Pretty-print the current state
console.log(formatOptimizerState(state));
```

## How It Works

1. **Beta prior**: Each variant starts with `Beta(α=1, β=1)` — a uniform prior (no bias)
2. **Update**: Each conversion increments α; each non-conversion increments β
3. **Sample**: Thompson Sampling draws from each variant's Beta distribution
4. **Assign weights**: Weights are proportional to the probability of each variant being best
5. **Declare winner**: When one variant's probability of being best exceeds the threshold (default 95%), a winner is declared

## Configuration

```typescript
interface OptimizerConfig {
  winnerThreshold: number; // Default: 0.95 — probability to declare winner
  minImpressions: number; // Default: 100 — min samples per variant
  priorAlpha: number; // Default: 1 — Bayesian prior successes
  priorBeta: number; // Default: 1 — Bayesian prior failures
}
```

Adjust priors to encode domain knowledge:

```typescript
// Strong prior: you believe ~50% conversion is typical
const state = initOptimizerState('experiment', ['a', 'b'], {
  priorAlpha: 50,
  priorBeta: 50,
});
```

## Integrating with TinyFlag

Use the optimizer to dynamically adjust variant weights in your flag file:

```typescript
import { TinyFlag } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

// On each evaluation, record the outcome
ff.on('exposure', (event) => {
  if (event.variant && event.flag === 'checkout-button') {
    // Later, when the user converts (or doesn't):
    state = recordBanditConversion(state, event.variant, userConverted);
    state = updateWeights(state);
  }
});

// Periodically update the flag file with new weights
const rec = getRecommendation(state);
if (rec.winner) {
  console.log(`Winner: ${rec.winner} — consider removing other variants`);
}
```

## Optimizer State

```typescript
interface OptimizerState {
  flag: string;
  variants: VariantState[];
  winner: string | null;
  winnerProbability: number;
  totalImpressions: number;
  totalConversions: number;
  updatedAt: number;
  iteration: number;
}

interface VariantState {
  name: string;
  params: { alpha: number; beta: number }; // Beta distribution parameters
  impressions: number;
  conversions: number;
  conversionRate: number;
  weight: number; // Current traffic weight (0–100)
}
```

## Notes

- The optimizer state is **in-memory**. Serialize `OptimizerState` to JSON and persist it between restarts.
- Weights are integers summing to 100 for compatibility with TinyFlag's variant weight format.
- With informative priors (high α/β), the optimizer requires more data to shift away from the prior — useful when you have historical conversion data.
