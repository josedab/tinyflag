/**
 * Progressive Delivery Orchestrator for TinyFlag.
 *
 * Provides multi-stage rollout pipelines (canary → ring → GA) with
 * health-check gates, automatic rollback on error-rate spikes,
 * and configurable promotion criteria.
 */

/** Health check result from a health-check provider. */
export interface HealthCheckResult {
  healthy: boolean;
  errorRate: number;
  latencyP99?: number;
  requestCount?: number;
  details?: Record<string, unknown>;
  timestamp: number;
}

/** Pluggable health-check provider interface. */
export interface HealthCheckProvider {
  name: string;
  check(service: string, window: number): Promise<HealthCheckResult>;
}

/** Promotion criteria that must pass before advancing to the next stage. */
export interface PromotionCriteria {
  /** Maximum error rate (0–1). Default: 0.05. */
  maxErrorRate: number;
  /** Maximum latency P99 in ms. Optional. */
  maxLatencyP99?: number;
  /** Minimum request count to consider metrics valid. Default: 10. */
  minRequestCount?: number;
  /** Minimum time (seconds) to hold at each stage before promoting. Default: 300. */
  minHoldTime: number;
  /** Number of consecutive passing checks required. Default: 3. */
  requiredPassingChecks: number;
}

/** A named stage in the rollout pipeline. */
export interface RolloutStage {
  /** Stage name (e.g., 'canary', 'ring-1', 'ga'). */
  name: string;
  /** Rollout percentage for this stage. */
  percentage: number;
  /** Stage-specific promotion criteria (overrides pipeline defaults). */
  criteria?: Partial<PromotionCriteria>;
}

/** Pipeline definition for a multi-stage rollout. */
export interface RolloutPipeline {
  /** Flag name being rolled out. */
  flag: string;
  /** Ordered list of stages. */
  stages: RolloutStage[];
  /** Default promotion criteria applied to all stages. */
  defaultCriteria: PromotionCriteria;
  /** Health check provider to use. */
  healthCheck: HealthCheckProvider;
  /** Webhook URL for notifications. */
  webhookUrl?: string;
}

/** Status of the rollout pipeline. */
export type PipelineStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'promoting'
  | 'rolled-back'
  | 'completed'
  | 'error';

/** Timeline event in the rollout. */
export interface RolloutEvent {
  type:
    | 'started'
    | 'stage-entered'
    | 'check-passed'
    | 'check-failed'
    | 'promoted'
    | 'rollback'
    | 'paused'
    | 'resumed'
    | 'completed'
    | 'error';
  timestamp: number;
  stageName: string;
  stageIndex: number;
  percentage: number;
  message: string;
  healthCheck?: HealthCheckResult;
}

/** Current state of the rollout pipeline. */
export interface RolloutState {
  flag: string;
  status: PipelineStatus;
  currentStageIndex: number;
  currentStageName: string;
  currentPercentage: number;
  consecutivePassingChecks: number;
  consecutiveFailingChecks: number;
  stageEnteredAt: number;
  startedAt: number;
  lastCheckAt?: number;
  history: RolloutEvent[];
}

/** Default promotion criteria values. */
const DEFAULT_CRITERIA: PromotionCriteria = {
  maxErrorRate: 0.05,
  minHoldTime: 300,
  requiredPassingChecks: 3,
  minRequestCount: 10,
};

/** Default canary → ring → GA stages. */
export const DEFAULT_STAGES: RolloutStage[] = [
  { name: 'canary', percentage: 1 },
  { name: 'ring-1', percentage: 10 },
  { name: 'ring-2', percentage: 50 },
  { name: 'ga', percentage: 100 },
];

/**
 * Progressive Delivery Orchestrator.
 * Manages multi-stage rollout pipelines with health-check gates and auto-rollback.
 */
export class RolloutOrchestrator {
  private pipeline: RolloutPipeline;
  private state: RolloutState;
  private updateCallback?: (flag: string, percentage: number) => void;

  constructor(pipeline: RolloutPipeline, onUpdate?: (flag: string, percentage: number) => void) {
    if (pipeline.stages.length === 0) {
      throw new Error('Pipeline must have at least one stage');
    }

    this.pipeline = {
      ...pipeline,
      defaultCriteria: { ...DEFAULT_CRITERIA, ...pipeline.defaultCriteria },
    };
    this.updateCallback = onUpdate;

    this.state = {
      flag: pipeline.flag,
      status: 'pending',
      currentStageIndex: -1,
      currentStageName: '',
      currentPercentage: 0,
      consecutivePassingChecks: 0,
      consecutiveFailingChecks: 0,
      stageEnteredAt: 0,
      startedAt: 0,
      history: [],
    };
  }

  /** Get current rollout state. */
  getState(): Readonly<RolloutState> {
    return { ...this.state };
  }

  /** Start the rollout pipeline by entering the first stage. */
  async start(): Promise<void> {
    if (this.state.status !== 'pending') {
      throw new Error(`Cannot start rollout in status: ${this.state.status}`);
    }

    this.state.status = 'running';
    this.state.startedAt = Date.now();
    this.addEvent('started', 'Rollout pipeline started');
    await this.enterStage(0);
  }

  /** Run a single health check cycle. Returns true if rollout is healthy. */
  async check(): Promise<boolean> {
    if (this.state.status !== 'running') return false;

    try {
      const criteria = this.getEffectiveCriteria();
      const result = await this.pipeline.healthCheck.check(
        this.pipeline.flag,
        criteria.minHoldTime,
      );
      this.state.lastCheckAt = Date.now();

      const passed = this.evaluateCriteria(result, criteria);

      if (passed) {
        this.state.consecutivePassingChecks++;
        this.state.consecutiveFailingChecks = 0;
        this.addEvent('check-passed', this.formatCheckMessage(result, true), result);
        return true;
      } else {
        this.state.consecutiveFailingChecks++;
        this.state.consecutivePassingChecks = 0;
        this.addEvent('check-failed', this.formatCheckMessage(result, false), result);

        if (this.state.consecutiveFailingChecks >= 3) {
          await this.rollback('3 consecutive health check failures');
          return false;
        }
        return false;
      }
    } catch (err) {
      this.addEvent('error', `Health check error: ${(err as Error).message}`);
      return true; // Don't rollback on transient errors
    }
  }

  /** Attempt to promote to the next stage if criteria are met. */
  async promote(force: boolean = false): Promise<boolean> {
    if (this.state.status !== 'running') return false;

    if (!force) {
      const criteria = this.getEffectiveCriteria();
      const holdElapsed = (Date.now() - this.state.stageEnteredAt) / 1000;

      if (holdElapsed < criteria.minHoldTime) {
        return false;
      }

      if (this.state.consecutivePassingChecks < criteria.requiredPassingChecks) {
        return false;
      }
    }

    const nextIndex = this.state.currentStageIndex + 1;

    if (nextIndex >= this.pipeline.stages.length) {
      this.state.status = 'completed';
      this.addEvent('completed', 'Rollout completed — all stages passed');
      return true;
    }

    this.addEvent('promoted', `Promoted from ${this.state.currentStageName}`);
    await this.enterStage(nextIndex);
    return true;
  }

  /** Rollback to 0%. */
  async rollback(reason: string): Promise<void> {
    this.state.status = 'rolled-back';
    this.state.currentPercentage = 0;
    this.addEvent('rollback', `Rolled back: ${reason}`);
    this.updateCallback?.(this.pipeline.flag, 0);

    if (this.pipeline.webhookUrl) {
      try {
        await fetch(this.pipeline.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'rollout-rollback',
            flag: this.pipeline.flag,
            stage: this.state.currentStageName,
            reason,
            timestamp: Date.now(),
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Best-effort notification
      }
    }
  }

  /** Pause the rollout at the current stage. */
  pause(): void {
    if (this.state.status !== 'running') return;
    this.state.status = 'paused';
    this.addEvent(
      'paused',
      `Paused at ${this.state.currentStageName} (${this.state.currentPercentage}%)`,
    );
  }

  /** Resume a paused rollout. */
  resume(): void {
    if (this.state.status !== 'paused') return;
    this.state.status = 'running';
    this.addEvent('resumed', `Resumed at ${this.state.currentStageName}`);
  }

  private async enterStage(index: number): Promise<void> {
    const stage = this.pipeline.stages[index];
    this.state.currentStageIndex = index;
    this.state.currentStageName = stage.name;
    this.state.currentPercentage = stage.percentage;
    this.state.consecutivePassingChecks = 0;
    this.state.consecutiveFailingChecks = 0;
    this.state.stageEnteredAt = Date.now();

    this.addEvent('stage-entered', `Entered stage "${stage.name}" at ${stage.percentage}%`);
    this.updateCallback?.(this.pipeline.flag, stage.percentage);
  }

  private getEffectiveCriteria(): PromotionCriteria {
    const stage = this.pipeline.stages[this.state.currentStageIndex];
    return {
      ...this.pipeline.defaultCriteria,
      ...(stage?.criteria ?? {}),
    };
  }

  private evaluateCriteria(result: HealthCheckResult, criteria: PromotionCriteria): boolean {
    if (result.errorRate > criteria.maxErrorRate) return false;
    if (criteria.maxLatencyP99 && result.latencyP99 && result.latencyP99 > criteria.maxLatencyP99) {
      return false;
    }
    if (criteria.minRequestCount && result.requestCount !== undefined) {
      if (result.requestCount < criteria.minRequestCount) return false;
    }
    return true;
  }

  private formatCheckMessage(result: HealthCheckResult, passed: boolean): string {
    const status = passed ? 'PASS' : 'FAIL';
    const parts = [`[${status}] error=${(result.errorRate * 100).toFixed(2)}%`];
    if (result.latencyP99 !== undefined) parts.push(`p99=${result.latencyP99.toFixed(0)}ms`);
    if (result.requestCount !== undefined) parts.push(`requests=${result.requestCount}`);
    return parts.join(', ');
  }

  private addEvent(
    type: RolloutEvent['type'],
    message: string,
    healthCheck?: HealthCheckResult,
  ): void {
    this.state.history.push({
      type,
      timestamp: Date.now(),
      stageName: this.state.currentStageName,
      stageIndex: this.state.currentStageIndex,
      percentage: this.state.currentPercentage,
      message,
      healthCheck,
    });

    if (this.state.history.length > 200) {
      this.state.history = this.state.history.slice(-100);
    }
  }
}
