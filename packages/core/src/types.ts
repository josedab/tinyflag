/** User context passed to flag evaluation for targeting and rollout bucketing. */
export interface UserContext {
  userId?: string;
  [key: string]: unknown;
}

/** A single targeting rule applied to a flag. */
export interface Rule {
  /** Key-value conditions on UserContext fields. All must match (AND logic). */
  conditions: Record<string, unknown>;
  /** Override the flag's enabled state when this rule matches. Defaults to true. */
  enabled?: boolean;
  /** Override rollout percentage for matched users. */
  rollout?: number;
  /** Force a specific variant for matched users. */
  variant?: string;
  /** Reference a named segment instead of inline conditions. */
  segment?: string;
}

/** A variant in an A/B test with a relative weight. */
export interface Variant {
  /** Variant identifier. */
  name: string;
  /** Relative weight for distribution (positive number). */
  weight: number;
}

/** Schedule for automatic flag enable/disable (ISO 8601 with timezone offset). */
export interface FlagSchedule {
  /** ISO 8601 datetime when the flag should be enabled. */
  enableAt?: string;
  /** ISO 8601 datetime when the flag should be disabled. */
  disableAt?: string;
}

/** Ramp rollout strategy: linearly interpolate percentage over time. */
export interface RampStrategy {
  type: 'ramp';
  start: number;
  end: number;
  startAt: string;
  endAt: string;
}

/** Ring-based rollout strategy: named deployment rings with matching rules. */
export interface RingStrategy {
  type: 'ring';
  rings: Array<{
    name: string;
    percentage: number;
    conditions?: Record<string, unknown>;
  }>;
}

/** Sticky cohort strategy: consistent hashing per cohort field. */
export interface CohortStrategy {
  type: 'cohort';
  field: string;
  percentage: number;
}

/** Advanced rollout strategy (union type). */
export type RolloutStrategy = RampStrategy | RingStrategy | CohortStrategy;

/** Flag lifecycle states: draft → active → sunset → archived. */
export type FlagLifecycleState = 'draft' | 'active' | 'sunset' | 'archived';

/** Lifecycle metadata for a flag. */
export interface FlagLifecycle {
  /** Current lifecycle state. */
  state: FlagLifecycleState;
  /** ISO 8601 date when sunset begins. Required when state is 'sunset'. */
  sunsetAt?: string;
}

/** Definition of a single feature flag. */
export interface FlagDefinition {
  /** Whether this flag is globally enabled. Required. */
  enabled: boolean;
  /** Human-readable description. */
  description?: string;
  /** Categorization tags. */
  tags?: readonly string[];
  /** Percentage rollout (0–100). Simple number or advanced strategy. */
  rollout?: number | RolloutStrategy;
  /** Targeting rules evaluated top-to-bottom. */
  rules?: readonly Rule[];
  /** A/B test variants with relative weights. */
  variants?: readonly Variant[];
  /** Scheduled enable/disable times (ISO 8601 with timezone offset). */
  schedule?: FlagSchedule;
  /** Prerequisite flag names that must be enabled for this flag to evaluate as enabled. */
  requires?: readonly string[];
  /** Lifecycle state metadata. */
  lifecycle?: FlagLifecycle;
  /** Typed configuration values associated with this flag. */
  config?: Record<string, unknown>;
}

/** A named persona preset defining reusable context for evaluation. */
export interface PersonaDefinition {
  [key: string]: unknown;
}

/** A named segment defining reusable targeting conditions. */
export interface SegmentDefinition {
  /** Conditions that define membership in this segment. */
  conditions: Record<string, unknown>;
  /** Other segments this segment extends (inherits conditions from). */
  extends?: readonly string[];
}

/** Root flag configuration loaded from a source. */
export interface FlagConfig {
  /** Schema version. Currently only 1 is supported. */
  version?: number;
  /** Map of flag names to their definitions. */
  flags: Record<string, FlagDefinition>;
  /** Named context presets for evaluation. */
  personas?: Record<string, PersonaDefinition>;
  /** Named segments defining reusable targeting conditions. */
  segments?: Record<string, SegmentDefinition>;
}

/** Warning emitted during multi-source flag merging. */
export interface MergeWarning {
  flag: string;
  field: string;
  message: string;
}

/** Configuration options for the TinyFlag SDK. */
export interface TinyFlagOptions {
  /**
   * Flag source — one of:
   * - File path string ending in .yml/.yaml/.json (Node/Bun/Deno only)
   * - URL string starting with http:// or https:// (all runtimes)
   * - Inline FlagConfig object (all runtimes)
   * - Array of the above for multi-file merging (base + environment overlays)
   */
  source: string | FlagConfig | Array<string | FlagConfig>;
  /** Custom HTTP headers for URL sources (e.g., Authorization). */
  headers?: Record<string, string>;
  /** Polling interval in ms for URL sources. Default: 60000. Minimum: 5000. */
  pollInterval?: number;
  /** Enable file watching for file sources. Default: true. */
  watch?: boolean;
  /** Strict mode rejects unknown fields. Default: false (lenient with warnings). */
  strict?: boolean;
  /** Deduplicate exposure events per (flag, userId) pair. Default: true. */
  deduplicate?: boolean;
  /** Enable debug logging (also enabled via DEBUG=tinyflag env var). Default: false. */
  debug?: boolean;
  /** Timeout in ms for fetching flags from a URL. Default: 5000. */
  fetchTimeout?: number;
}

/** Event emitted when a flag is evaluated with a userId. */
export interface ExposureEvent {
  flag: string;
  variant: string | null;
  enabled: boolean;
  userId: string;
  timestamp: number;
}

/** Event emitted when a flag definition changes. */
export interface ChangeEvent {
  flag: string;
  previous: FlagDefinition | undefined;
  current: FlagDefinition | undefined;
  timestamp: number;
}

/** Error event emitted for non-fatal issues. */
export interface ErrorEvent {
  code: string;
  message: string;
  flagName?: string;
}

/** Map of event names to their handler signatures. */
export interface TinyFlagEvents {
  exposure: (event: ExposureEvent) => void;
  change: (event: ChangeEvent) => void;
  error: (event: ErrorEvent) => void;
}

/** Validation error describing a problem in a flag definition. */
export interface ValidationError {
  path: string;
  message: string;
}
