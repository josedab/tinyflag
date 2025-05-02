import type {
  ConversionEvent,
  ExperimentConfig,
  ExperimentResult,
  VariantResult,
  FlagDefinition,
} from './types.js';

/**
 * In-memory experiment tracker for recording exposures and conversions.
 * For production use, back with a persistent store.
 */
export class ExperimentTracker {
  private exposures = new Map<string, Map<string, Set<string>>>(); // flag -> variant -> userIds
  private conversions = new Map<string, ConversionEvent[]>(); // flag -> events
  private values = new Map<string, Map<string, number[]>>(); // flag -> variant -> continuous values

  /** Record a user exposure to a variant. */
  trackExposure(flag: string, variant: string, userId: string): void {
    if (!flag || !variant || !userId) return;
    if (!this.exposures.has(flag)) {
      this.exposures.set(flag, new Map());
    }
    const flagMap = this.exposures.get(flag)!;
    if (!flagMap.has(variant)) {
      flagMap.set(variant, new Set());
    }
    flagMap.get(variant)!.add(userId);
  }

  /** Record a conversion event. */
  trackConversion(flag: string, variant: string, userId: string, value?: number): void {
    if (!flag || !variant || !userId) return;
    const event: ConversionEvent = { flag, variant, userId, value, timestamp: Date.now() };
    if (!this.conversions.has(flag)) {
      this.conversions.set(flag, []);
    }
    this.conversions.get(flag)!.push(event);

    if (value !== undefined) {
      if (!this.values.has(flag)) {
        this.values.set(flag, new Map());
      }
      const flagValues = this.values.get(flag)!;
      if (!flagValues.has(variant)) {
        flagValues.set(variant, []);
      }
      flagValues.get(variant)!.push(value);
    }
  }

  /** Get exposure counts per variant for a flag. */
  getExposures(flag: string): Map<string, number> {
    const result = new Map<string, number>();
    const flagMap = this.exposures.get(flag);
    if (flagMap) {
      for (const [variant, users] of flagMap) {
        result.set(variant, users.size);
      }
    }
    return result;
  }

  /** Get conversion events for a flag grouped by variant. */
  getConversions(flag: string): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    const events = this.conversions.get(flag) || [];
    for (const event of events) {
      if (!result.has(event.variant)) {
        result.set(event.variant, new Set());
      }
      result.get(event.variant)!.add(event.userId);
    }
    return result;
  }

  /** Analyze experiment results for a flag. */
  analyze(flag: string, flagDef: FlagDefinition): ExperimentResult | null {
    const experiment = flagDef.experiment;
    if (!experiment) return null;
    if (!flagDef.variants || flagDef.variants.length === 0) return null;

    const method = experiment.method || 'bayesian';
    const confidenceLevel = experiment.confidenceLevel ?? 0.95;
    const exposures = this.getExposures(flag);
    const conversions = this.getConversions(flag);
    const flagValues = this.values.get(flag);

    const variants: VariantResult[] = [];
    for (const v of flagDef.variants) {
      const sampleSize = exposures.get(v.name) || 0;
      const conversionCount = conversions.get(v.name)?.size || 0;
      const rate = sampleSize > 0 ? conversionCount / sampleSize : 0;
      const ci = wilsonConfidenceInterval(conversionCount, sampleSize, confidenceLevel);
      const variantValues = flagValues?.get(v.name);
      const meanValue = variantValues && variantValues.length > 0
        ? variantValues.reduce((a, b) => a + b, 0) / variantValues.length
        : undefined;

      variants.push({
        name: v.name,
        sampleSize,
        conversions: conversionCount,
        conversionRate: rate,
        confidenceInterval: ci,
        meanValue,
      });
    }

    const totalSamples = variants.reduce((s, v) => s + v.sampleSize, 0);
    const minSample = experiment.minimumSampleSize ?? 100;
    const allMeetMinimum = variants.every((v) => v.sampleSize >= minSample);

    let winner: string | null = null;
    let significant = false;

    if (allMeetMinimum && variants.length >= 2) {
      if (method === 'bayesian') {
        const result = bayesianAnalysis(variants, confidenceLevel);
        winner = result.winner;
        significant = result.significant;
      } else {
        const result = frequentistAnalysis(variants, confidenceLevel);
        winner = result.winner;
        significant = result.significant;
      }
    }

    return {
      flag,
      metric: experiment.metric,
      method,
      variants,
      winner,
      significant,
      confidenceLevel,
      totalSamples,
    };
  }

  /** Reset all data for a flag. */
  reset(flag: string): void {
    this.exposures.delete(flag);
    this.conversions.delete(flag);
    this.values.delete(flag);
  }
}

/** Wilson score confidence interval for binomial proportion. */
function wilsonConfidenceInterval(
  successes: number,
  total: number,
  confidence: number,
): [number, number] {
  if (total === 0) return [0, 0];
  const z = normalQuantile((1 + confidence) / 2);
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/** Bayesian A/B analysis using Beta-Binomial model. */
function bayesianAnalysis(
  variants: VariantResult[],
  confidenceLevel: number,
): { winner: string | null; significant: boolean } {
  if (variants.length < 2) return { winner: null, significant: false };

  // Use Monte Carlo simulation with Beta distribution
  const simulations = 10000;
  const wins = new Map<string, number>();
  for (const v of variants) wins.set(v.name, 0);

  for (let i = 0; i < simulations; i++) {
    let bestRate = -1;
    let bestVariant = '';
    for (const v of variants) {
      // Beta(alpha, beta) where alpha = conversions + 1, beta = non-conversions + 1
      const alpha = v.conversions + 1;
      const beta = v.sampleSize - v.conversions + 1;
      const sample = sampleBeta(alpha, beta);
      if (sample > bestRate) {
        bestRate = sample;
        bestVariant = v.name;
      }
    }
    wins.set(bestVariant, (wins.get(bestVariant) || 0) + 1);
  }

  let maxWins = 0;
  let winner = '';
  for (const [name, count] of wins) {
    if (count > maxWins) {
      maxWins = count;
      winner = name;
    }
  }

  const probability = maxWins / simulations;
  return {
    winner: probability >= confidenceLevel ? winner : null,
    significant: probability >= confidenceLevel,
  };
}

/** Frequentist analysis using z-test for proportions. */
function frequentistAnalysis(
  variants: VariantResult[],
  confidenceLevel: number,
): { winner: string | null; significant: boolean } {
  if (variants.length < 2) return { winner: null, significant: false };

  const alpha = 1 - confidenceLevel;
  const zCritical = normalQuantile(1 - alpha / 2);

  // Compare first two variants (control vs treatment)
  const control = variants[0];
  const treatment = variants[1];

  const p1 = control.conversionRate;
  const p2 = treatment.conversionRate;
  const n1 = control.sampleSize;
  const n2 = treatment.sampleSize;

  if (n1 === 0 || n2 === 0) return { winner: null, significant: false };

  const pooledP = (control.conversions + treatment.conversions) / (n1 + n2);
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));

  if (se === 0) return { winner: null, significant: false };

  const zScore = (p2 - p1) / se;
  const significant = Math.abs(zScore) > zCritical;

  return {
    winner: significant ? (p2 > p1 ? treatment.name : control.name) : null,
    significant,
  };
}

/** Sample from Beta distribution using Jöhnk's algorithm. */
function sampleBeta(alpha: number, beta: number): number {
  const a = sampleGamma(alpha);
  const b = sampleGamma(beta);
  return a / (a + b);
}

/** Sample from Gamma distribution using Marsaglia and Tsang's method. */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      x = normalRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Box-Muller transform for standard normal random variable. */
function normalRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Approximate inverse of the standard normal CDF (Rational approximation). */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

/** Format experiment results as an ASCII table. */
export function formatExperimentResults(result: ExperimentResult): string {
  const lines: string[] = [];
  lines.push(`📊 Experiment: ${result.flag} (metric: ${result.metric})`);
  lines.push(`   Method: ${result.method} | Confidence: ${(result.confidenceLevel * 100).toFixed(0)}% | Samples: ${result.totalSamples}`);
  lines.push('');

  // Table header
  const header = '  Variant            Samples    Conversions    Rate       CI (95%)';
  const separator = '  ' + '─'.repeat(header.length - 2);
  lines.push(header);
  lines.push(separator);

  for (const v of result.variants) {
    const name = v.name.padEnd(18);
    const samples = String(v.sampleSize).padStart(8);
    const conversions = String(v.conversions).padStart(12);
    const rate = (v.conversionRate * 100).toFixed(2).padStart(8) + '%';
    const ci = `[${(v.confidenceInterval[0] * 100).toFixed(2)}%, ${(v.confidenceInterval[1] * 100).toFixed(2)}%]`;
    lines.push(`  ${name}${samples}${conversions}${rate}   ${ci}`);
  }

  lines.push(separator);

  if (result.significant && result.winner) {
    lines.push(`  🏆 Winner: ${result.winner}`);
  } else if (result.totalSamples === 0) {
    lines.push('  ⏳ No data yet. Waiting for exposures and conversions.');
  } else {
    lines.push('  ⏳ Not yet significant. Continue collecting data.');
  }

  return lines.join('\n');
}
