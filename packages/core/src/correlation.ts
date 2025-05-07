/**
 * Flag Impact Correlation Engine for TinyFlag.
 *
 * Correlates flag enable/disable/rollout events with external metrics
 * (error rates, latency p99, conversion rates) via pluggable metrics source.
 * Includes statistical significance testing (t-test, chi-square).
 */

// --- Metrics Source Interface ---

/** A time-series metric data point. */
export interface MetricDataPoint {
  timestamp: number;
  value: number;
}

/** Pluggable metrics source interface. */
export interface MetricsSource {
  name: string;
  /** Query a metric for a given time range. */
  query(metric: string, startTime: number, endTime: number): Promise<MetricDataPoint[]>;
  /** List available metrics. */
  listMetrics?(): Promise<string[]>;
}

/** Flag change event for correlation analysis. */
export interface FlagChangePoint {
  flag: string;
  timestamp: number;
  action: 'enabled' | 'disabled' | 'rollout-changed' | 'rule-changed';
  before?: unknown;
  after?: unknown;
}

// --- Statistical Testing ---

/** Result of a statistical significance test. */
export interface StatisticalTestResult {
  testName: string;
  statistic: number;
  pValue: number;
  significant: boolean;
  confidenceLevel: number;
  effectSize: number;
  sampleSizeBefore: number;
  sampleSizeAfter: number;
}

/** Calculate mean of an array. */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Calculate variance of an array. */
function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
}

/** Calculate standard deviation. */
function stddev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

/**
 * Two-sample Welch's t-test for comparing means of two groups.
 * Assumes unequal variances (Welch's approximation).
 */
export function welchTTest(
  before: number[],
  after: number[],
  confidenceLevel: number = 0.95,
): StatisticalTestResult {
  const n1 = before.length;
  const n2 = after.length;

  if (n1 < 2 || n2 < 2) {
    return {
      testName: "Welch's t-test",
      statistic: 0,
      pValue: 1,
      significant: false,
      confidenceLevel,
      effectSize: 0,
      sampleSizeBefore: n1,
      sampleSizeAfter: n2,
    };
  }

  const m1 = mean(before);
  const m2 = mean(after);
  const v1 = variance(before);
  const v2 = variance(after);

  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se === 0) {
    return {
      testName: "Welch's t-test",
      statistic: 0,
      pValue: 1,
      significant: false,
      confidenceLevel,
      effectSize: 0,
      sampleSizeBefore: n1,
      sampleSizeAfter: n2,
    };
  }

  const t = (m2 - m1) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (v1 / n1 + v2 / n2) ** 2;
  const denom = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
  const df = num / denom;

  // Approximate p-value using Student's t CDF approximation
  const pValue = approximateTCdf(Math.abs(t), df);

  // Cohen's d effect size
  const pooledSd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const effectSize = pooledSd > 0 ? Math.abs(m2 - m1) / pooledSd : 0;

  return {
    testName: "Welch's t-test",
    statistic: t,
    pValue: 2 * pValue, // Two-tailed
    significant: 2 * pValue < 1 - confidenceLevel,
    confidenceLevel,
    effectSize,
    sampleSizeBefore: n1,
    sampleSizeAfter: n2,
  };
}

/**
 * Chi-square test for comparing proportions (e.g., error rates, conversion rates).
 */
export function chiSquareTest(
  beforeSuccess: number,
  beforeTotal: number,
  afterSuccess: number,
  afterTotal: number,
  confidenceLevel: number = 0.95,
): StatisticalTestResult {
  if (beforeTotal === 0 || afterTotal === 0) {
    return {
      testName: 'Chi-square test',
      statistic: 0,
      pValue: 1,
      significant: false,
      confidenceLevel,
      effectSize: 0,
      sampleSizeBefore: beforeTotal,
      sampleSizeAfter: afterTotal,
    };
  }

  const beforeFail = beforeTotal - beforeSuccess;
  const afterFail = afterTotal - afterSuccess;
  const total = beforeTotal + afterTotal;
  const totalSuccess = beforeSuccess + afterSuccess;
  const totalFail = beforeFail + afterFail;

  // Expected values under null hypothesis
  const e11 = (beforeTotal * totalSuccess) / total;
  const e12 = (beforeTotal * totalFail) / total;
  const e21 = (afterTotal * totalSuccess) / total;
  const e22 = (afterTotal * totalFail) / total;

  // Chi-square statistic
  let chi2 = 0;
  if (e11 > 0) chi2 += (beforeSuccess - e11) ** 2 / e11;
  if (e12 > 0) chi2 += (beforeFail - e12) ** 2 / e12;
  if (e21 > 0) chi2 += (afterSuccess - e21) ** 2 / e21;
  if (e22 > 0) chi2 += (afterFail - e22) ** 2 / e22;

  // Approximate p-value (1 degree of freedom)
  const pValue = approximateChiCdf(chi2);

  // Effect size (Cramér's V)
  const effectSize = Math.sqrt(chi2 / total);

  return {
    testName: 'Chi-square test',
    statistic: chi2,
    pValue,
    significant: pValue < 1 - confidenceLevel,
    confidenceLevel,
    effectSize,
    sampleSizeBefore: beforeTotal,
    sampleSizeAfter: afterTotal,
  };
}

// --- Approximation functions for CDF ---

/** Approximate upper-tail probability of Student's t distribution. */
function approximateTCdf(t: number, df: number): number {
  // Abramowitz & Stegun approximation
  const x = df / (df + t * t);
  if (x >= 1) return 0.5;
  if (x <= 0) return 0;
  // Beta function approximation for I_x(a, b) where a=df/2, b=0.5
  return 0.5 * Math.pow(x, df / 2) * Math.pow(1 - x, 0.5) * (1 / betaFunction(df / 2, 0.5));
}

/** Approximate upper-tail probability of chi-square with 1 df. */
function approximateChiCdf(chi2: number): number {
  if (chi2 <= 0) return 1;
  // Using normal approximation: sqrt(2*chi2) - sqrt(2*df-1) ~ N(0,1)
  const z = Math.sqrt(2 * chi2) - Math.sqrt(1);
  return 1 - normalCdf(z);
}

/** Standard normal CDF approximation (Abramowitz & Stegun). */
function normalCdf(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const erf = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/** Beta function approximation. */
function betaFunction(a: number, b: number): number {
  return (gamma(a) * gamma(b)) / gamma(a + b);
}

/** Stirling's approximation for gamma function. */
function gamma(n: number): number {
  if (n < 0.5) return Math.PI / (Math.sin(Math.PI * n) * gamma(1 - n));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  const x = c.reduce((acc, ci, i) => i === 0 ? ci : acc + ci / (n - 1 + i), 0);
  const t = n - 1 + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, n - 0.5) * Math.exp(-t) * x;
}

// --- Impact Analysis ---

/** Result of an impact correlation analysis. */
export interface ImpactAnalysis {
  flag: string;
  metric: string;
  changePoint: FlagChangePoint;
  window: { before: number; after: number };
  beforeSummary: { mean: number; stddev: number; count: number };
  afterSummary: { mean: number; stddev: number; count: number };
  changePercent: number;
  statisticalTest: StatisticalTestResult;
  causalImpactEstimate?: {
    pointEstimate: number;
    relativeEffect: number;
    confidence: number;
  };
}

/**
 * Analyze the impact of a flag change on a metric.
 */
export function analyzeMetricImpact(
  flag: string,
  changePoint: FlagChangePoint,
  beforeData: number[],
  afterData: number[],
  metricName: string = 'metric',
  windowMs: number = 86400000,
): ImpactAnalysis {
  const beforeMean = mean(beforeData);
  const afterMean = mean(afterData);
  const changePercent = beforeMean !== 0 ? ((afterMean - beforeMean) / beforeMean) * 100 : 0;

  const test = welchTTest(beforeData, afterData);

  // Simple causal impact estimate (difference-in-means)
  const causalImpactEstimate = {
    pointEstimate: afterMean - beforeMean,
    relativeEffect: changePercent / 100,
    confidence: test.significant ? Math.min(0.95, 1 - test.pValue) : Math.max(0.1, 1 - test.pValue),
  };

  return {
    flag,
    metric: metricName,
    changePoint,
    window: { before: windowMs, after: windowMs },
    beforeSummary: { mean: beforeMean, stddev: stddev(beforeData), count: beforeData.length },
    afterSummary: { mean: afterMean, stddev: stddev(afterData), count: afterData.length },
    changePercent,
    statisticalTest: test,
    causalImpactEstimate,
  };
}

// --- Prometheus Metrics Source ---

/**
 * Create a Prometheus metrics source.
 */
export function createPrometheusSource(baseUrl: string): MetricsSource {
  return {
    name: 'prometheus',
    async query(metric: string, startTime: number, endTime: number): Promise<MetricDataPoint[]> {
      const step = Math.max(15, Math.floor((endTime - startTime) / 1000 / 300));
      const url = `${baseUrl}/api/v1/query_range?query=${encodeURIComponent(metric)}&start=${startTime / 1000}&end=${endTime / 1000}&step=${step}`;

      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Prometheus query failed: ${response.status}`);

      const data = (await response.json()) as {
        data?: { result?: Array<{ values?: Array<[number, string]> }> };
      };

      const values = data?.data?.result?.[0]?.values ?? [];
      return values.map(([ts, val]) => ({
        timestamp: ts * 1000,
        value: parseFloat(val),
      }));
    },
  };
}

/** Format impact analysis as human-readable output. */
export function formatImpactAnalysis(analysis: ImpactAnalysis): string {
  const lines: string[] = [];

  lines.push(`📈 Impact Analysis: ${analysis.flag}`);
  lines.push('═'.repeat(50));
  lines.push(`Metric:  ${analysis.metric}`);
  lines.push(`Change:  ${analysis.changePoint.action} at ${new Date(analysis.changePoint.timestamp).toISOString()}`);
  lines.push('');

  lines.push('Before:');
  lines.push(`  Mean: ${analysis.beforeSummary.mean.toFixed(4)}  StdDev: ${analysis.beforeSummary.stddev.toFixed(4)}  N=${analysis.beforeSummary.count}`);
  lines.push('After:');
  lines.push(`  Mean: ${analysis.afterSummary.mean.toFixed(4)}  StdDev: ${analysis.afterSummary.stddev.toFixed(4)}  N=${analysis.afterSummary.count}`);
  lines.push(`Change: ${analysis.changePercent >= 0 ? '+' : ''}${analysis.changePercent.toFixed(2)}%`);
  lines.push('');

  const test = analysis.statisticalTest;
  const sigIcon = test.significant ? '✅' : '❌';
  lines.push(`Statistical Test: ${test.testName}`);
  lines.push(`  ${sigIcon} Significant: ${test.significant} (p=${test.pValue.toFixed(4)}, α=${(1 - test.confidenceLevel).toFixed(2)})`);
  lines.push(`  Statistic: ${test.statistic.toFixed(4)}`);
  lines.push(`  Effect size: ${test.effectSize.toFixed(4)}`);

  if (analysis.causalImpactEstimate) {
    lines.push('');
    lines.push('Causal Impact Estimate:');
    lines.push(`  Point estimate: ${analysis.causalImpactEstimate.pointEstimate.toFixed(4)}`);
    lines.push(`  Relative effect: ${(analysis.causalImpactEstimate.relativeEffect * 100).toFixed(2)}%`);
    lines.push(`  Confidence: ${(analysis.causalImpactEstimate.confidence * 100).toFixed(0)}%`);
  }

  return lines.join('\n');
}
