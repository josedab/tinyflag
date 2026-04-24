import { readFileSync, existsSync } from 'fs';
import { analyzeMetricImpact, createPrometheusSource, formatImpactAnalysis } from 'tinyflag';
import type { FlagChangePoint, MetricDataPoint } from 'tinyflag';

export function handleImpactAnalyze(args: string[], jsonMode: boolean): void {
  if (args.length === 0 || args[0] === 'help') {
    console.log(`Usage: tinyflag impact-analyze --flag <name> --metrics <source> [options]

Analyze correlation between flag changes and external metrics.

Options:
  --flag <name>          Flag to analyze (required)
  --metrics <source>     Metrics source: prometheus (default: prometheus)
  --url <url>            Metrics endpoint URL (default: http://localhost:9090)
  --metric <query>       Metric query/name (default: http_request_errors_total)
  --window <hours>       Analysis window in hours (default: 24)
  --data <file>          Load before/after metric data from JSON file
  --change-at <ISO8601>  Timestamp of the flag change (default: midpoint of window)`);
    return;
  }

  const flagIdx = args.indexOf('--flag');
  const flagName = flagIdx >= 0 && args[flagIdx + 1] ? args[flagIdx + 1] : undefined;

  if (!flagName) {
    console.error('Error: --flag <name> is required');
    process.exit(1);
  }

  const metricsIdx = args.indexOf('--metrics');
  const metricsType = metricsIdx >= 0 && args[metricsIdx + 1] ? args[metricsIdx + 1] : 'prometheus';

  const urlIdx = args.indexOf('--url');
  const url = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : 'http://localhost:9090';

  const metricIdx = args.indexOf('--metric');
  const metricQuery =
    metricIdx >= 0 && args[metricIdx + 1] ? args[metricIdx + 1] : 'http_request_errors_total';

  const windowIdx = args.indexOf('--window');
  const windowHours =
    windowIdx >= 0 && args[windowIdx + 1] ? parseInt(args[windowIdx + 1], 10) : 24;
  const windowMs = windowHours * 3600 * 1000;

  const changeIdx = args.indexOf('--change-at');
  const changeAt =
    changeIdx >= 0 && args[changeIdx + 1]
      ? new Date(args[changeIdx + 1]).getTime()
      : Date.now() - windowMs / 2;

  const dataIdx = args.indexOf('--data');
  const dataFile = dataIdx >= 0 && args[dataIdx + 1] ? args[dataIdx + 1] : undefined;

  const changePoint: FlagChangePoint = {
    flag: flagName,
    timestamp: changeAt,
    action: 'enabled',
  };

  if (dataFile) {
    // Load from file
    if (!existsSync(dataFile)) {
      console.error(`Error: Data file not found: ${dataFile}`);
      process.exit(1);
    }

    try {
      const data = JSON.parse(readFileSync(dataFile, 'utf8')) as {
        before?: number[];
        after?: number[];
      };
      const before = data.before ?? [];
      const after = data.after ?? [];

      const analysis = analyzeMetricImpact(
        flagName,
        changePoint,
        before,
        after,
        metricQuery,
        windowMs,
      );

      if (jsonMode) {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        console.log(formatImpactAnalysis(analysis));
      }
    } catch (err) {
      console.error(`Error parsing data file: ${(err as Error).message}`);
      process.exit(1);
    }
  } else {
    // Fetch from Prometheus
    const source = createPrometheusSource(url);
    const now = Date.now();
    const beforeStart = changeAt - windowMs;
    const afterEnd = Math.min(now, changeAt + windowMs);

    Promise.all([
      source.query(metricQuery, beforeStart, changeAt),
      source.query(metricQuery, changeAt, afterEnd),
    ])
      .then(([beforePoints, afterPoints]) => {
        const before = beforePoints.map((p: MetricDataPoint) => p.value);
        const after = afterPoints.map((p: MetricDataPoint) => p.value);

        const analysis = analyzeMetricImpact(
          flagName,
          changePoint,
          before,
          after,
          metricQuery,
          windowMs,
        );

        if (jsonMode) {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          console.log(formatImpactAnalysis(analysis));
        }
      })
      .catch((err) => {
        console.error(`Error querying metrics: ${(err as Error).message}`);
        console.log('');
        console.log('Tip: Use --data <file> to load metric data from a JSON file:');
        console.log('  {"before": [0.01, 0.02, ...], "after": [0.05, 0.04, ...]}');
        process.exit(1);
      });
  }
}
