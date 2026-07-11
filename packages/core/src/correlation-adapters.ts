import type { MetricDataPoint, MetricsSource } from './correlation-core.js';

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
