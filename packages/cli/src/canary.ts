/**
 * Canary release integration for TinyFlag.
 *
 * Provides metrics bridge adapters, rollout controller with auto-rollback,
 * and CLI command for canary deployments.
 */

/** Health metrics from a metrics provider. */
export interface HealthMetrics {
  errorRate: number;
  latencyP50?: number;
  latencyP99?: number;
  requestCount?: number;
  timestamp: number;
}

/** Metrics provider adapter interface. */
export interface MetricsAdapter {
  name: string;
  /** Fetch current health metrics for a service. */
  fetchMetrics(service: string, window: number): Promise<HealthMetrics>;
}

/** Canary configuration. */
export interface CanaryConfig {
  /** Flag name to control rollout. */
  flag: string;
  /** Metrics adapter to use. */
  metricsAdapter: MetricsAdapter;
  /** Error rate threshold (0-1). Default: 0.05 (5%). */
  errorThreshold: number;
  /** Latency P99 threshold in ms. Optional. */
  latencyThreshold?: number;
  /** Rollout stages as percentages. Default: [1, 5, 25, 50, 100]. */
  stages: number[];
  /** Time in seconds to wait at each stage before advancing. */
  stageInterval: number;
  /** Grace period in seconds after rollback before re-evaluating. Default: 300. */
  gracePeriod: number;
  /** Number of consecutive threshold breaches before rollback. Default: 3. */
  confirmationWindow: number;
  /** Webhook URL for rollback notifications. */
  webhookUrl?: string;
}

/** State of a canary rollout. */
export interface CanaryState {
  flag: string;
  currentStage: number;
  currentPercentage: number;
  status: 'running' | 'paused' | 'rolled-back' | 'completed' | 'error';
  breachCount: number;
  lastMetrics?: HealthMetrics;
  startedAt: number;
  lastCheckAt?: number;
  history: CanaryEvent[];
}

/** An event in the canary timeline. */
export interface CanaryEvent {
  type: 'stage-advance' | 'rollback' | 'breach-detected' | 'check-passed' | 'completed' | 'error';
  timestamp: number;
  stage: number;
  percentage: number;
  message: string;
  metrics?: HealthMetrics;
}

/** Default rollout stages. */
const DEFAULT_STAGES = [1, 5, 25, 50, 100];

/** Default canary config values. */
const DEFAULTS: Partial<CanaryConfig> = {
  errorThreshold: 0.05,
  stages: DEFAULT_STAGES,
  stageInterval: 300,
  gracePeriod: 300,
  confirmationWindow: 3,
};

/**
 * Create a Prometheus metrics adapter.
 */
export function createPrometheusAdapter(baseUrl: string): MetricsAdapter {
  return {
    name: 'prometheus',
    async fetchMetrics(service: string, window: number): Promise<HealthMetrics> {
      const query = `rate(http_requests_total{service="${service}",status=~"5.."}[${window}s]) / rate(http_requests_total{service="${service}"}[${window}s])`;
      const url = `${baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Prometheus query failed: ${response.status}`);

      const data = await response.json() as { data?: { result?: Array<{ value?: [number, string] }> } };
      const value = data?.data?.result?.[0]?.value?.[1];

      return {
        errorRate: value ? parseFloat(value) : 0,
        timestamp: Date.now(),
      };
    },
  };
}

/**
 * Create a Datadog metrics adapter.
 */
export function createDatadogAdapter(apiKey: string, appKey: string, site: string = 'datadoghq.com'): MetricsAdapter {
  return {
    name: 'datadog',
    async fetchMetrics(service: string, window: number): Promise<HealthMetrics> {
      const now = Math.floor(Date.now() / 1000);
      const from = now - window;
      const query = `avg:trace.http.request.errors{service:${service}}.as_rate() / avg:trace.http.request.hits{service:${service}}.as_rate()`;

      const url = `https://api.${site}/api/v1/query?from=${from}&to=${now}&query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'DD-API-KEY': apiKey,
          'DD-APPLICATION-KEY': appKey,
        },
      });

      if (!response.ok) throw new Error(`Datadog query failed: ${response.status}`);
      const data = await response.json() as { series?: Array<{ pointlist?: Array<[number, number]> }> };
      const points = data?.series?.[0]?.pointlist;
      const lastValue = points?.[points.length - 1]?.[1] ?? 0;

      return {
        errorRate: lastValue,
        timestamp: Date.now(),
      };
    },
  };
}

/**
 * Create a CloudWatch metrics adapter.
 */
export function createCloudWatchAdapter(region: string): MetricsAdapter {
  return {
    name: 'cloudwatch',
    async fetchMetrics(service: string, window: number): Promise<HealthMetrics> {
      // CloudWatch requires AWS SDK — this adapter provides the interface
      // Implementation depends on the AWS SDK version in use
      throw new Error('CloudWatch adapter requires AWS SDK. Use createCloudWatchAdapterWithClient() instead.');
    },
  };
}

/**
 * Canary rollout controller.
 * Manages progressive rollout with automatic rollback on threshold breach.
 */
export class CanaryController {
  private config: Required<CanaryConfig>;
  private state: CanaryState;
  private updateCallback?: (flag: string, percentage: number) => void;

  constructor(config: CanaryConfig, onUpdate?: (flag: string, percentage: number) => void) {
    this.config = {
      ...DEFAULTS,
      ...config,
    } as Required<CanaryConfig>;

    this.updateCallback = onUpdate;

    this.state = {
      flag: config.flag,
      currentStage: -1,
      currentPercentage: 0,
      status: 'running',
      breachCount: 0,
      startedAt: Date.now(),
      history: [],
    };
  }

  /** Get current canary state. */
  getState(): Readonly<CanaryState> {
    return { ...this.state };
  }

  /** Run a single health check cycle. Returns true if rollout should continue. */
  async check(): Promise<boolean> {
    if (this.state.status !== 'running') return false;

    try {
      const metrics = await this.config.metricsAdapter.fetchMetrics(
        this.config.flag,
        this.config.stageInterval,
      );
      this.state.lastMetrics = metrics;
      this.state.lastCheckAt = Date.now();

      const breached = this.isThresholdBreached(metrics);

      if (breached) {
        this.state.breachCount++;
        this.addEvent('breach-detected', `Error rate ${(metrics.errorRate * 100).toFixed(2)}% exceeds threshold ${(this.config.errorThreshold * 100).toFixed(2)}%`, metrics);

        if (this.state.breachCount >= this.config.confirmationWindow) {
          await this.rollback(`${this.config.confirmationWindow} consecutive breaches detected`);
          return false;
        }
      } else {
        this.state.breachCount = 0;
        this.addEvent('check-passed', `Error rate ${(metrics.errorRate * 100).toFixed(2)}% within threshold`, metrics);
      }

      return true;
    } catch (err) {
      this.addEvent('error', `Health check failed: ${(err as Error).message}`);
      return true; // Don't rollback on transient metrics errors
    }
  }

  /** Advance to the next rollout stage. */
  async advance(): Promise<boolean> {
    if (this.state.status !== 'running') return false;

    const nextStage = this.state.currentStage + 1;
    if (nextStage >= this.config.stages.length) {
      this.state.status = 'completed';
      this.state.currentPercentage = 100;
      this.addEvent('completed', 'Canary rollout completed at 100%');
      this.updateCallback?.(this.config.flag, 100);
      return true;
    }

    this.state.currentStage = nextStage;
    this.state.currentPercentage = this.config.stages[nextStage];
    this.state.breachCount = 0;

    if (nextStage === this.config.stages.length - 1) {
      this.state.status = 'completed';
      this.addEvent('completed', `Canary rollout completed at ${this.state.currentPercentage}%`);
    } else {
      this.addEvent('stage-advance', `Advanced to ${this.state.currentPercentage}%`);
    }

    this.updateCallback?.(this.config.flag, this.state.currentPercentage);
    return true;
  }

  /** Rollback to 0%. */
  async rollback(reason: string): Promise<void> {
    this.state.status = 'rolled-back';
    this.state.currentPercentage = 0;
    this.addEvent('rollback', `Rolled back: ${reason}`, this.state.lastMetrics);
    this.updateCallback?.(this.config.flag, 0);

    // Send webhook notification
    if (this.config.webhookUrl) {
      try {
        await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'canary-rollback',
            flag: this.config.flag,
            reason,
            metrics: this.state.lastMetrics,
            timestamp: Date.now(),
          }),
        });
      } catch {
        // Best-effort notification
      }
    }
  }

  private isThresholdBreached(metrics: HealthMetrics): boolean {
    if (metrics.errorRate > this.config.errorThreshold) return true;
    if (this.config.latencyThreshold && metrics.latencyP99 && metrics.latencyP99 > this.config.latencyThreshold) {
      return true;
    }
    return false;
  }

  private addEvent(
    type: CanaryEvent['type'],
    message: string,
    metrics?: HealthMetrics,
  ): void {
    this.state.history.push({
      type,
      timestamp: Date.now(),
      stage: this.state.currentStage,
      percentage: this.state.currentPercentage,
      message,
      metrics,
    });

    // Cap history at 100 entries
    if (this.state.history.length > 100) {
      this.state.history = this.state.history.slice(-50);
    }
  }
}

/**
 * Format canary state as human-readable output.
 */
export function formatCanaryState(state: CanaryState): string {
  const lines: string[] = [];
  const statusIcons: Record<string, string> = {
    'running': '🟢',
    'paused': '⏸️',
    'rolled-back': '🔴',
    'completed': '✅',
    'error': '❌',
  };

  lines.push(`Canary Rollout: ${state.flag}`);
  lines.push('═'.repeat(40));
  lines.push(`Status: ${statusIcons[state.status] || '❓'} ${state.status}`);
  lines.push(`Stage: ${state.currentStage} (${state.currentPercentage}%)`);
  lines.push(`Breach count: ${state.breachCount}`);

  if (state.lastMetrics) {
    lines.push(`Last error rate: ${(state.lastMetrics.errorRate * 100).toFixed(2)}%`);
  }

  lines.push('');
  lines.push('Timeline:');
  for (const event of state.history.slice(-10)) {
    const time = new Date(event.timestamp).toISOString().slice(11, 19);
    lines.push(`  ${time} [${event.percentage}%] ${event.message}`);
  }

  return lines.join('\n');
}
