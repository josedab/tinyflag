export { TinyFlag } from './tinyflag.js';
export type {
  FlagConfig,
  FlagDefinition,
  FlagSchedule,
  Rule,
  Variant,
  UserContext,
  TinyFlagOptions,
  ExposureEvent,
  ChangeEvent,
  ErrorEvent,
  TinyFlagErrorCode,
  TinyFlagEvents,
  ValidationError,
  MergeWarning,
  RolloutStrategy,
  RampStrategy,
  RingStrategy,
  CohortStrategy,
  PersonaDefinition,
  FlagLifecycleState,
  FlagLifecycle,
  SegmentDefinition,
} from './types.js';
export { parseYaml } from './yaml.js';
export { validateConfig } from './schema.js';
export { parseFlagConfig } from './parser.js';
export { mergeFlagConfigs, diffEnvConfigs, formatEnvDiff } from './merge.js';
export type { EnvDiffEntry } from './merge.js';
export {
  detectCircularDependencies,
  buildDependencyTree,
  evaluateFlag,
  evaluateVariant,
  evaluateWithPersona,
  getEvaluationWarnings,
  setEvaluationContext,
} from './evaluator.js';
export type { EvaluationWarning, EvaluationEnv } from './evaluator.js';
export { setDebug } from './debug.js';
export { generateKeyPair, signContent, verifyContent, signFile, verifyFile } from './signing.js';
export {
  connectAudit,
  createFileSink,
  createWebhookSink,
  createConsoleSink,
  createOtelSink,
} from './audit.js';
export type { AuditEvent, AuditSink, AuditOptions } from './audit.js';
export { pullFlags, pushFlags, threeWayMerge } from './sync.js';
export type { SyncMeta } from './sync.js';
export { CachedTinyFlag } from './cached.js';
export type { CachedTinyFlagOptions } from './cached.js';
export { createReplayRecorder, parseReplayLog, generateReplayHtmlReport } from './replay.js';
export type { ReplayLogEntry, ReplayRecorderOptions, ReplayDiff } from './replay.js';
export {
  resolveTenantFlags,
  evaluateTenantFlag,
  evaluateTenantVariant,
  listTenants,
  diffTenantFlags,
  validateTenantIsolation,
  formatTenantList,
} from './tenant.js';
export type {
  TenantContext,
  TenantFlagConfig,
  MultiTenantFlagConfig,
  TenantDiffEntry,
  TenantIsolationViolation,
} from './tenant.js';
export { ExperimentTracker, formatExperimentResults } from './experiment.js';
export type {
  ExperimentConfig,
  ConversionEvent,
  VariantResult,
  ExperimentResult,
} from './types.js';
export {
  RolloutOrchestrator,
  createPrometheusHealthCheck,
  createHttpHealthCheck,
  formatRolloutState,
  DEFAULT_STAGES,
} from './progressive.js';
export type {
  HealthCheckResult,
  HealthCheckProvider,
  PromotionCriteria,
  RolloutStage,
  RolloutPipeline,
  PipelineStatus,
  RolloutEvent,
  RolloutState,
} from './progressive.js';
export {
  ComplianceAuditTrail,
  parseGovernanceConfig,
  getPermissions,
  hasPermission,
  validateApprovalRequest,
  formatGovernanceReport,
} from './governance.js';
export type {
  GovernanceRole,
  RolePermissions,
  GovernanceUser,
  ApprovalWorkflow,
  GovernanceConfig,
  ApprovalRequest,
  ComplianceAuditEvent,
} from './governance.js';
export {
  suggestRolloutPercentage,
  detectAnomalies,
  suggestCleanup,
  formatRecommendations,
  formatAnomalies,
  formatCleanupSuggestions,
} from './intelligence.js';
export type {
  EvalEvent,
  FlagTimeSeries,
  RolloutRecommendation,
  FlagAnomaly,
  CleanupSuggestion,
} from './intelligence.js';
export {
  welchTTest,
  chiSquareTest,
  analyzeMetricImpact,
  createPrometheusSource,
  formatImpactAnalysis,
} from './correlation.js';
export type {
  MetricDataPoint,
  MetricsSource,
  FlagChangePoint,
  StatisticalTestResult,
  ImpactAnalysis,
} from './correlation.js';
export {
  initOptimizerState,
  recordConversion as recordBanditConversion,
  updateWeights,
  getRecommendation,
  formatOptimizerState,
} from './bandit.js';
export type { BetaParams, VariantState, OptimizerState, OptimizerConfig } from './bandit.js';
export {
  WebhookEngine,
  signPayload,
  verifySignature,
  createWebhookAdapter,
  createKafkaAdapter,
  createSnsAdapter,
  createPubSubAdapter,
  connectEventBus,
} from './webhooks.js';
export type {
  WebhookEvent,
  EventFilter,
  EventBusAdapter,
  WebhookEndpoint,
  DeliveryAttempt,
  RetryConfig,
} from './webhooks.js';
export {
  generateTestMatrix,
  comparePerf,
  generatePerfReport,
  generateK6Script,
  generateArtilleryConfig,
  formatTestMatrix,
  formatPerfReport,
} from './perf.js';
export type {
  FlagCombination,
  TestMatrix,
  MatrixOptions,
  PerfMetrics,
  PerfComparison,
  PerfReport,
} from './perf.js';
