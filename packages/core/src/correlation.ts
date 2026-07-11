export { welchTTest, chiSquareTest, analyzeMetricImpact } from './correlation-core.js';
export type {
  MetricDataPoint,
  MetricsSource,
  FlagChangePoint,
  StatisticalTestResult,
  ImpactAnalysis,
} from './correlation-core.js';
export { createPrometheusSource } from './correlation-adapters.js';
export { formatImpactAnalysis } from './correlation-format.js';
