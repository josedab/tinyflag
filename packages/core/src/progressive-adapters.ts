import type { HealthCheckProvider, HealthCheckResult } from './progressive-core.js';

export function createPrometheusHealthCheck(baseUrl: string): HealthCheckProvider {
  return {
    name: 'prometheus',
    async check(service: string, window: number): Promise<HealthCheckResult> {
      const errorQuery = `rate(http_requests_total{service="${service}",status=~"5.."}[${window}s]) / rate(http_requests_total{service="${service}"}[${window}s])`;
      const latencyQuery = `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="${service}"}[${window}s]))`;
      const countQuery = `sum(increase(http_requests_total{service="${service}"}[${window}s]))`;

      const [errorRate, latencyP99, requestCount] = await Promise.all([
        queryPrometheus(baseUrl, errorQuery),
        queryPrometheus(baseUrl, latencyQuery).catch(() => undefined),
        queryPrometheus(baseUrl, countQuery).catch(() => undefined),
      ]);

      return {
        healthy: !isNaN(errorRate) && errorRate <= 0.05,
        errorRate: isNaN(errorRate) ? 0 : errorRate,
        latencyP99: latencyP99 !== undefined ? latencyP99 * 1000 : undefined,
        requestCount: requestCount !== undefined ? Math.floor(requestCount) : undefined,
        timestamp: Date.now(),
      };
    },
  };
}

export function createHttpHealthCheck(healthUrl: string): HealthCheckProvider {
  return {
    name: 'http',
    async check(_service: string, _window: number): Promise<HealthCheckResult> {
      const start = Date.now();
      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - start;
        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        return {
          healthy: response.ok,
          errorRate: response.ok ? 0 : 1,
          latencyP99: latency,
          requestCount: typeof body.requestCount === 'number' ? body.requestCount : undefined,
          details: body,
          timestamp: Date.now(),
        };
      } catch {
        return {
          healthy: false,
          errorRate: 1,
          latencyP99: Date.now() - start,
          timestamp: Date.now(),
        };
      }
    },
  };
}

async function queryPrometheus(baseUrl: string, query: string): Promise<number> {
  const url = `${baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Prometheus query failed: ${response.status}`);
  const data = (await response.json()) as {
    data?: { result?: Array<{ value?: [number, string] }> };
  };
  const value = data?.data?.result?.[0]?.value?.[1];
  return value ? parseFloat(value) : 0;
}
