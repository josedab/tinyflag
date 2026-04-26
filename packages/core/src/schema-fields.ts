const ROOT_FIELD_NAMES = ['version', 'flags', 'personas', 'segments', 'tenants'] as const;
const FLAG_FIELD_NAMES = [
  'enabled',
  'description',
  'tags',
  'rollout',
  'rules',
  'variants',
  'schedule',
  'requires',
  'lifecycle',
  'config',
] as const;
const SCHEDULE_FIELD_NAMES = ['enableAt', 'disableAt'] as const;

export const KNOWN_ROOT_FIELDS: ReadonlySet<string> = new Set(ROOT_FIELD_NAMES);
export const KNOWN_FLAG_FIELDS: ReadonlySet<string> = new Set(FLAG_FIELD_NAMES);
export const KNOWN_SCHEDULE_FIELDS: ReadonlySet<string> = new Set(SCHEDULE_FIELD_NAMES);
export const ROLLOUT_STRATEGY_TYPES = ['ramp', 'ring', 'cohort'] as const;
export const FLAG_LIFECYCLE_STATES = ['draft', 'active', 'sunset', 'archived'] as const;
