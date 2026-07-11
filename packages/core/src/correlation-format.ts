import type { ImpactAnalysis } from './correlation-core.js';

export function formatImpactAnalysis(analysis: ImpactAnalysis): string {
  const lines: string[] = [];

  lines.push(`📈 Impact Analysis: ${analysis.flag}`);
  lines.push('═'.repeat(50));
  lines.push(`Metric:  ${analysis.metric}`);
  lines.push(
    `Change:  ${analysis.changePoint.action} at ${new Date(analysis.changePoint.timestamp).toISOString()}`,
  );
  lines.push('');

  lines.push('Before:');
  lines.push(
    `  Mean: ${analysis.beforeSummary.mean.toFixed(4)}  StdDev: ${analysis.beforeSummary.stddev.toFixed(4)}  N=${analysis.beforeSummary.count}`,
  );
  lines.push('After:');
  lines.push(
    `  Mean: ${analysis.afterSummary.mean.toFixed(4)}  StdDev: ${analysis.afterSummary.stddev.toFixed(4)}  N=${analysis.afterSummary.count}`,
  );
  lines.push(
    `Change: ${analysis.changePercent >= 0 ? '+' : ''}${analysis.changePercent.toFixed(2)}%`,
  );
  lines.push('');

  const test = analysis.statisticalTest;
  const sigIcon = test.significant ? '✅' : '❌';
  lines.push(`Statistical Test: ${test.testName}`);
  lines.push(
    `  ${sigIcon} Significant: ${test.significant} (p=${test.pValue.toFixed(4)}, α=${(1 - test.confidenceLevel).toFixed(2)})`,
  );
  lines.push(`  Statistic: ${test.statistic.toFixed(4)}`);
  lines.push(`  Effect size: ${test.effectSize.toFixed(4)}`);

  if (analysis.causalImpactEstimate) {
    lines.push('');
    lines.push('Causal Impact Estimate:');
    lines.push(`  Point estimate: ${analysis.causalImpactEstimate.pointEstimate.toFixed(4)}`);
    lines.push(
      `  Relative effect: ${(analysis.causalImpactEstimate.relativeEffect * 100).toFixed(2)}%`,
    );
    lines.push(`  Confidence: ${(analysis.causalImpactEstimate.confidence * 100).toFixed(0)}%`);
  }

  return lines.join('\n');
}
