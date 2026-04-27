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
}

/** A variant in an A/B test with a relative weight. */
export interface Variant {
  /** Variant identifier. */
  name: string;
  /** Relative weight for distribution (positive number). */
  weight: number;
}

/** Definition of a single feature flag. */
export interface FlagDefinition {
  /** Whether this flag is globally enabled. Required. */
  enabled: boolean;
  /** Human-readable description. */
  description?: string;
  /** Categorization tags. */
  tags?: string[];
  /** Percentage rollout (0–100). */
  rollout?: number;
  /** Targeting rules evaluated top-to-bottom. */
  rules?: Rule[];
  /** A/B test variants with relative weights. */
  variants?: Variant[];
}

/** Root flag configuration loaded from a source. */
export interface FlagConfig {
  /** Schema version. Currently only 1 is supported. */
  version?: number;
  /** Map of flag names to their definitions. */
  flags: Record<string, FlagDefinition>;
}

/** Configuration options for the TinyFlag SDK. */
export interface TinyFlagOptions {
  /**
   * Flag source — one of:
   * - File path string ending in .yml/.yaml/.json (Node/Bun/Deno only)
   * - URL string starting with http:// or https:// (all runtimes)
   * - Inline FlagConfig object (all runtimes)
   */
  source: string | FlagConfig;
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
