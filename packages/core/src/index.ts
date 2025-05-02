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
export { validateConfig, parseFlagConfig } from './schema.js';
export { mergeFlagConfigs, diffEnvConfigs, formatEnvDiff } from './merge.js';
export type { EnvDiffEntry } from './merge.js';
export {
  detectCircularDependencies,
  buildDependencyTree,
  evaluateWithPersona,
  getEvaluationWarnings,
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
