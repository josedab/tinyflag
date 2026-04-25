export { TinyFlag } from './tinyflag.js';
export { CachedTinyFlag } from './cached.js';
export type { CachedTinyFlagOptions } from './cached.js';
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
