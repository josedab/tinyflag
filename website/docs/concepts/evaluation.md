---
sidebar_position: 3
title: Flag Evaluation
description: How TinyFlag evaluates flags, rollouts, and variants.
---

# Flag Evaluation

TinyFlag provides two core evaluation methods: `isEnabled()` for boolean flags and `getVariant()` for A/B tests.

## `isEnabled(flagName, context?)`

Returns `true` or `false`. **Never throws** — returns `false` for unknown flags.

### Evaluation Order

1. Flag doesn't exist → `false` (emits `error` event)
2. `enabled` is `false` → `false`
3. Rules exist and context provided → first matching rule wins
4. `rollout` defined with `userId` → deterministic hash bucketing
5. `rollout` defined without `userId` → falls through to `enabled`
6. Otherwise → `enabled` value

```typescript
ff.isEnabled('my-flag'); // Global state only
ff.isEnabled('my-flag', { userId: 'user-123' }); // With rollout + rules
ff.isEnabled('my-flag', { userId: 'u1', plan: 'pro' }); // With targeting
```

## Percentage Rollouts

Rollout uses MurmurHash3 for deterministic bucketing. The same `(flagName, userId)` pair always produces the same result.

```yaml
flags:
  new-feature:
    enabled: true
    rollout: 25 # 25% of users
```

- `rollout: 0` → disabled for all users (even if `enabled: true`)
- `rollout: 100` → enabled for all users
- No `userId` in context → rollout is skipped, returns `enabled` value

## `getVariant(flagName, context?)`

Returns the assigned variant name or `null`. **Never throws.**

```typescript
const variant = ff.getVariant('experiment', { userId: 'user-123' });
// Returns 'control' or 'test' — deterministic per user
```

### Returns `null` when:

- Flag doesn't exist
- Flag is disabled
- No variants defined
- No `userId` in context

## A/B Testing

```yaml
flags:
  checkout-flow:
    enabled: true
    variants:
      - name: control
        weight: 50
      - name: new-flow
        weight: 50
```

Variant assignment uses a different hash seed than rollout, ensuring independent bucketing.

## Bulk Evaluation with `getAllFlags()`

Use `getAllFlags()` to evaluate every flag at once. This is useful for SSR hydration and debugging.

```typescript
const allFlags = ff.getAllFlags({ userId: 'user-123', plan: 'pro' });
// {
//   'new-checkout': { enabled: true, variant: 'new-flow' },
//   'dark-mode':    { enabled: false, variant: null },
// }

// SSR example: serialize to the client
const serialized = JSON.stringify(allFlags);
```

Overrides set via `override()` are applied during `getAllFlags()` evaluation.

## Testing Overrides

Use `override()` and `clearOverrides()` to force flag values during testing or local development.

```typescript
// Override isEnabled result (boolean)
ff.override('new-checkout', true);

// Override getVariant result (string)
ff.override('checkout-flow', 'new-flow');

ff.isEnabled('new-checkout'); // true (overridden)
ff.getVariant('checkout-flow'); // 'new-flow' (overridden)

// Clean up all overrides
ff.clearOverrides();
```

Overrides take precedence over all evaluation logic (rules, rollouts, enabled state). They are intended for development and testing — not production use.

## Determinism Guarantee

**Same input → same output. Always. Across SDK versions.**

This is a core design principle. The MurmurHash3 algorithm and bucketing logic are frozen — we will never change them in a way that alters existing assignments.
