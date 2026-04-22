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
ff.isEnabled('my-flag');                         // Global state only
ff.isEnabled('my-flag', { userId: 'user-123' }); // With rollout + rules
ff.isEnabled('my-flag', { userId: 'u1', plan: 'pro' }); // With targeting
```

## Percentage Rollouts

Rollout uses MurmurHash3 for deterministic bucketing. The same `(flagName, userId)` pair always produces the same result.

```yaml
flags:
  new-feature:
    enabled: true
    rollout: 25  # 25% of users
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

## Determinism Guarantee

**Same input → same output. Always. Across SDK versions.**

This is a core design principle. The MurmurHash3 algorithm and bucketing logic are frozen — we will never change them in a way that alters existing assignments.
