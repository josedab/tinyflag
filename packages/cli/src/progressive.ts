/**
 * Progressive delivery orchestrator re-export for CLI.
 * Delegates to core package.
 */
export {
  RolloutOrchestrator,
  createPrometheusHealthCheck,
  createHttpHealthCheck,
  formatRolloutState,
  DEFAULT_STAGES,
} from 'tinyflag';
export type {
  HealthCheckResult,
  HealthCheckProvider,
  PromotionCriteria,
  RolloutStage,
  RolloutPipeline,
  PipelineStatus,
  RolloutEvent,
  RolloutState,
} from 'tinyflag';
