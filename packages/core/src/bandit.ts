/**
 * Multi-Armed Bandit Auto-Optimizer for TinyFlag.
 *
 * Implements Beta-Binomial Thompson Sampling for automatic variant weight
 * adjustment. Tracks alpha/beta parameters per variant and auto-declares
 * a winner when posterior probability exceeds 95% threshold.
 */

/** Beta distribution parameters for a variant. */
export interface BetaParams {
  alpha: number;
  beta: number;
}

/** State of a variant in the optimizer. */
export interface VariantState {
  name: string;
  params: BetaParams;
  impressions: number;
  conversions: number;
  conversionRate: number;
  weight: number;
}

/** Optimizer state for a flag. */
export interface OptimizerState {
  flag: string;
  variants: VariantState[];
  winner: string | null;
  winnerProbability: number;
  totalImpressions: number;
  totalConversions: number;
  updatedAt: number;
  createdAt: number;
  iteration: number;
}

/** Optimizer configuration. */
export interface OptimizerConfig {
  /** Probability threshold to declare a winner. Default: 0.95. */
  winnerThreshold: number;
  /** Minimum impressions per variant before declaring winner. Default: 100. */
  minImpressions: number;
  /** Prior alpha (Bayesian prior successes). Default: 1. */
  priorAlpha: number;
  /** Prior beta (Bayesian prior failures). Default: 1. */
  priorBeta: number;
}

const DEFAULT_CONFIG: OptimizerConfig = {
  winnerThreshold: 0.95,
  minImpressions: 100,
  priorAlpha: 1,
  priorBeta: 1,
};

/**
 * Initialize optimizer state for a flag's variants.
 */
export function initOptimizerState(
  flag: string,
  variantNames: string[],
  config: Partial<OptimizerConfig> = {},
): OptimizerState {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const equalWeight = Math.floor(100 / variantNames.length);

  return {
    flag,
    variants: variantNames.map((name, i) => ({
      name,
      params: { alpha: cfg.priorAlpha, beta: cfg.priorBeta },
      impressions: 0,
      conversions: 0,
      conversionRate: 0,
      weight:
        i === variantNames.length - 1 ? 100 - equalWeight * (variantNames.length - 1) : equalWeight,
    })),
    winner: null,
    winnerProbability: 0,
    totalImpressions: 0,
    totalConversions: 0,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    iteration: 0,
  };
}

/**
 * Record a conversion event for a variant.
 */
export function recordConversion(
  state: OptimizerState,
  variantName: string,
  converted: boolean,
): OptimizerState {
  const variants = state.variants.map((v) => {
    if (v.name !== variantName) return v;

    const newParams = { ...v.params };
    if (converted) {
      newParams.alpha += 1;
    } else {
      newParams.beta += 1;
    }

    const impressions = v.impressions + 1;
    const conversions = v.conversions + (converted ? 1 : 0);

    return {
      ...v,
      params: newParams,
      impressions,
      conversions,
      conversionRate: impressions > 0 ? conversions / impressions : 0,
    };
  });

  return {
    ...state,
    variants,
    totalImpressions: state.totalImpressions + 1,
    totalConversions: state.totalConversions + (converted ? 1 : 0),
    updatedAt: Date.now(),
  };
}

/**
 * Run Thompson Sampling to update variant weights.
 * Simulates draws from each variant's Beta distribution and adjusts weights.
 */
export function updateWeights(
  state: OptimizerState,
  config: Partial<OptimizerConfig> = {},
  simulations: number = 10000,
): OptimizerState {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Run Thompson Sampling simulations
  const winCounts = new Array(state.variants.length).fill(0);

  for (let sim = 0; sim < simulations; sim++) {
    let bestIdx = 0;
    let bestSample = -1;

    for (let i = 0; i < state.variants.length; i++) {
      const { alpha, beta } = state.variants[i].params;
      const sample = sampleBeta(alpha, beta);
      if (sample > bestSample) {
        bestSample = sample;
        bestIdx = i;
      }
    }

    winCounts[bestIdx]++;
  }

  // Convert win counts to weights
  const totalWins = winCounts.reduce((a, b) => a + b, 0);
  const newVariants = state.variants.map((v, i) => ({
    ...v,
    weight: Math.max(1, Math.round((winCounts[i] / totalWins) * 100)),
  }));

  // Normalize weights to exactly 100
  const totalWeight = newVariants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight !== 100 && newVariants.length > 0) {
    newVariants[0].weight += 100 - totalWeight;
  }

  // Check for winner
  let winner: string | null = null;
  let winnerProbability = 0;

  const allMeetMinimum = state.variants.every((v) => v.impressions >= cfg.minImpressions);
  if (allMeetMinimum) {
    for (let i = 0; i < newVariants.length; i++) {
      const prob = winCounts[i] / totalWins;
      if (prob > winnerProbability) {
        winnerProbability = prob;
        winner = newVariants[i].name;
      }
    }

    if (winnerProbability < cfg.winnerThreshold) {
      winner = null;
    }
  }

  return {
    ...state,
    variants: newVariants,
    winner,
    winnerProbability,
    iteration: state.iteration + 1,
    updatedAt: Date.now(),
  };
}

/**
 * Sample from a Beta distribution using the Jöhnk algorithm.
 */
function sampleBeta(alpha: number, beta: number): number {
  if (alpha <= 0 || beta <= 0) return 0.5;

  // Use gamma sampling for Beta distribution: Beta(a,b) = Ga(a) / (Ga(a) + Ga(b))
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

/**
 * Sample from a Gamma distribution using Marsaglia and Tsang's method.
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number, v: number;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Standard normal random variable (Box-Muller transform). */
function randn(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Get the recommended action for the optimizer.
 */
export function getRecommendation(state: OptimizerState): {
  action: 'continue' | 'declare-winner' | 'needs-data';
  message: string;
} {
  if (state.winner) {
    return {
      action: 'declare-winner',
      message: `Winner: "${state.winner}" with ${(state.winnerProbability * 100).toFixed(1)}% probability`,
    };
  }

  const minImpressions = Math.min(...state.variants.map((v) => v.impressions));
  if (minImpressions < 100) {
    return {
      action: 'needs-data',
      message: `Need more data — min impressions per variant: ${minImpressions}/100`,
    };
  }

  return {
    action: 'continue',
    message: `No clear winner yet — ${state.iteration} iterations, ${state.totalImpressions} total impressions`,
  };
}

/** Format optimizer state as human-readable output. */
export function formatOptimizerState(state: OptimizerState): string {
  const lines: string[] = [];

  lines.push(`🎰 Multi-Armed Bandit: ${state.flag}`);
  lines.push('═'.repeat(50));
  lines.push(
    `Iteration: ${state.iteration} | Total: ${state.totalImpressions} impressions, ${state.totalConversions} conversions`,
  );

  if (state.winner) {
    lines.push(
      `🏆 Winner: ${state.winner} (${(state.winnerProbability * 100).toFixed(1)}% probability)`,
    );
  }

  lines.push('');
  lines.push('Variants:');
  for (const v of state.variants) {
    const bar = '█'.repeat(Math.round(v.weight / 5)) + '░'.repeat(20 - Math.round(v.weight / 5));
    lines.push(`  ${v.name}`);
    lines.push(`    Weight: ${v.weight}% ${bar}`);
    lines.push(
      `    Rate: ${(v.conversionRate * 100).toFixed(2)}% (${v.conversions}/${v.impressions})`,
    );
    lines.push(`    Beta(α=${v.params.alpha.toFixed(0)}, β=${v.params.beta.toFixed(0)})`);
  }

  const rec = getRecommendation(state);
  lines.push('');
  lines.push(`Status: ${rec.message}`);

  return lines.join('\n');
}
