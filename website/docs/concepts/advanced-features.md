---
sidebar_position: 4
title: Advanced Features
description: Multi-source merging, schedules, lifecycle, personas, segments, prerequisites, and rollout strategies.
---

# Advanced Features

TinyFlag includes advanced capabilities beyond basic flag evaluation. These features support enterprise use cases like scheduled rollouts, prerequisite flags, and multi-tenant configurations.

## Multi-Source Merging

Load flags from multiple sources — perfect for base + environment overlays:

```typescript
const ff = new TinyFlag({
  source: [
    './flags.base.yml', // Base flags
    './flags.production.yml', // Environment overrides
  ],
});
await ff.init();
```

Later sources override earlier ones. Conflict warnings are emitted via the `error` event with code `UNKNOWN_FIELD`.

```typescript
import { mergeFlagConfigs } from 'tinyflag';

const { config, warnings } = mergeFlagConfigs([baseConfig, overlayConfig]);
warnings.forEach((w) => console.warn(`${w.flag}.${w.field}: ${w.message}`));
```

## Scheduled Flags

Enable or disable flags at specific times:

```yaml
flags:
  black-friday-sale:
    enabled: true
    schedule:
      enableAt: '2026-11-27T00:00:00-05:00'
      disableAt: '2026-11-30T23:59:59-05:00'
```

Schedules use ISO 8601 with timezone offset. The flag evaluates as disabled outside the scheduled window.

## Flag Lifecycle

Track flag maturity with lifecycle states:

```yaml
flags:
  legacy-nav:
    enabled: true
    lifecycle:
      state: sunset
      sunsetAt: '2026-06-01'
```

| State      | Behavior                                          |
| ---------- | ------------------------------------------------- |
| `draft`    | Evaluates as `false` unless debug mode is enabled |
| `active`   | Normal evaluation                                 |
| `sunset`   | Normal evaluation + emits `SUNSET_FLAG` warning   |
| `archived` | Always evaluates as `false`                       |

## Prerequisite Flags

Require other flags to be enabled before this flag can evaluate as enabled:

```yaml
flags:
  payments-v2:
    enabled: true
  checkout-v2:
    enabled: true
    requires:
      - payments-v2 # Only enabled if payments-v2 is also enabled
```

Circular dependencies are detected at load time and emitted as `CIRCULAR_DEPENDENCY` errors:

```typescript
import { detectCircularDependencies, buildDependencyTree } from 'tinyflag';

const cycles = detectCircularDependencies(ff.getFlags());
console.log(buildDependencyTree('checkout-v2', ff.getFlags()));
```

## Named Segments

Define reusable targeting conditions:

```yaml
segments:
  internal-users:
    conditions:
      email: '*@company.com'
  beta-testers:
    conditions:
      plan: pro
    extends:
      - internal-users # Inherits conditions

flags:
  new-feature:
    enabled: true
    rules:
      - segment: beta-testers
        enabled: true
```

Segments support inheritance via `extends`. Circular segment inheritance is detected at load time.

## Personas

Define named context presets for testing and evaluation:

```yaml
personas:
  pro-user:
    userId: 'user-pro'
    plan: pro
    country: US
  free-user:
    userId: 'user-free'
    plan: free

flags:
  premium-feature:
    enabled: true
    rules:
      - conditions:
          plan: pro
        enabled: true
    rollout: 0
```

```typescript
// Evaluate with a persona
ff.evaluateWithPersona('premium-feature', 'pro-user'); // true
ff.evaluateWithPersona('premium-feature', 'free-user'); // false

// Get all personas
const personas = ff.getPersonas();
```

## Advanced Rollout Strategies

Beyond simple percentage rollouts, TinyFlag supports three advanced strategies:

### Ramp (Time-Based)

Linearly ramp rollout percentage over time:

```yaml
flags:
  gradual-release:
    enabled: true
    rollout:
      type: ramp
      start: 5
      end: 100
      startAt: '2026-05-01T00:00:00Z'
      endAt: '2026-05-14T00:00:00Z'
```

### Ring (Deployment Rings)

Named deployment rings with per-ring percentages:

```yaml
flags:
  ring-release:
    enabled: true
    rollout:
      type: ring
      rings:
        - name: canary
          percentage: 100
          conditions:
            team: engineering
        - name: early-adopters
          percentage: 50
          conditions:
            plan: pro
        - name: everyone
          percentage: 10
```

### Cohort (Sticky Groups)

Hash on a custom field for cohort-level consistency:

```yaml
flags:
  company-feature:
    enabled: true
    rollout:
      type: cohort
      field: companyId
      percentage: 25
```

## Flag Configuration Values

Attach typed configuration to flags:

```yaml
flags:
  pricing-experiment:
    enabled: true
    config:
      discount: 15
      currency: USD
      showBanner: true
```

```typescript
const config = ff.getConfig<{ discount: number; currency: string }>('pricing-experiment');
if (config) {
  applyDiscount(config.discount, config.currency);
}
```

`getConfig()` returns `null` if the flag is disabled or doesn't exist.

## URL Fetch Retries

Configure retry behavior for URL source fetches with exponential backoff:

```typescript
const ff = new TinyFlag({
  source: 'https://cdn.example.com/flags.json',
  retries: 3, // Retry up to 3 times on transient errors
  retryDelay: 1000, // Base delay: 1s, then 2s, 4s (with jitter)
});
```

Retries apply only to transient errors (HTTP 429, 502, 503, 504, and network failures). Non-transient errors (4xx) fail immediately.

## Testing Utilities

TinyFlag ships a `tinyflag/testing` subpath with helpers for test setup:

```typescript
import { createMockTinyFlag, createFlag } from 'tinyflag/testing';

// Quick mock from boolean values
const ff = await createMockTinyFlag({
  flags: {
    'feature-a': true,
    'feature-b': false,
    experiment: {
      enabled: true,
      variants: [
        { name: 'control', weight: 50 },
        { name: 'new-flow', weight: 50 },
      ],
    },
  },
});

expect(ff.isEnabled('feature-a')).toBe(true);
ff.destroy();
```

## Environment Variable Overrides

Override flag values via environment variables without code changes:

```bash
TINYFLAG_new_checkout=true node app.js
TINYFLAG_experiment=new-flow node app.js
```

Priority: env var override > `override()` > flag file definition.
