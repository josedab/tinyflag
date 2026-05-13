# Targeting Rules

Rules let you target specific user segments. Each flag can have multiple rules evaluated top-to-bottom — first match wins.

## Rule Structure

```yaml
rules:
  - conditions: # All conditions must match (AND logic)
      field: value # Condition on a UserContext field
    enabled: true # What happens when rule matches
```

## Operators

### Equality

```yaml
conditions:
  plan: pro # context.plan === 'pro'
```

### Glob Pattern

```yaml
conditions:
  email: '*@company.com' # Matches alice@company.com
```

Only `*` wildcard is supported. A pattern without `*` is treated as equality.

### Numeric Comparison

```yaml
conditions:
  age: { $gte: 18 } # context.age >= 18
  score: { $lt: 100 } # context.score < 100
```

Supported: `$gt`, `$gte`, `$lt`, `$lte`. Returns false for non-numeric context values.

### List Inclusion

```yaml
conditions:
  country: { $in: [US, CA, UK] } # context.country is one of these
```

### Negation

```yaml
conditions:
  plan: { $not: free } # context.plan !== 'free'
```

## Rule Effects

When a rule matches, it can:

```yaml
rules:
  - conditions: { plan: pro }
    enabled: true # Enable the flag for this segment

  - conditions: { plan: pro }
    rollout: 80 # Override rollout to 80% for pros

  - conditions: { role: beta }
    variant: new-ui # Force a specific variant
```

## Evaluation Rules

- **AND logic**: All conditions in a rule must match
- **First match wins**: Rules are evaluated top-to-bottom
- **Missing context fields**: Condition does not match (never errors)
- **`null` context values**: Condition does not match
- **Empty conditions `{}`**: Rule always matches (vacuous truth)

## Examples

### Beta for Internal Users

```yaml
rules:
  - conditions:
      email: '*@company.com'
    enabled: true
rollout: 0 # Disabled for everyone else
```

### Geo-Targeted Rollout

```yaml
rules:
  - conditions:
      country: { $in: [US, CA] }
    rollout: 80
  - conditions:
      country: { $in: [UK, DE, FR] }
    rollout: 50
rollout: 10 # 10% elsewhere
```

### Premium Feature Gate

```yaml
rules:
  - conditions:
      plan: enterprise
    enabled: true
  - conditions:
      plan: pro
    rollout: 50
rollout: 0 # Free users don't get it
```

## Edge Cases & Gotchas

### Null or Undefined Context Fields

If a context field used in a condition is `null` or `undefined`, the condition silently does **not match**. No error is emitted.

```yaml
rules:
  - conditions:
      plan: pro
    enabled: true
```

```typescript
// context.plan is undefined → condition does not match → rule skipped
ff.isEnabled('feature', { userId: 'u1' }); // falls through to default
```

### Empty Conditions Object

A rule with an empty `conditions: {}` object is [vacuous truth](https://en.wikipedia.org/wiki/Vacuous_truth) — it **always matches**, regardless of context.

```yaml
rules:
  - conditions: {}
    enabled: true # This rule always matches
```

Use this pattern intentionally to create a catch-all rule at the end of a rule list.

### `$not` with Missing Fields

If the context field referenced by `$not` is missing (or `null`/`undefined`), the condition does **not match**. This means `$not` cannot be used to match "field is absent."

```yaml
rules:
  - conditions:
      plan: { $not: free }
    enabled: true
```

```typescript
// context has no 'plan' field → condition does not match (not "plan is not free")
ff.isEnabled('feature', { userId: 'u1' }); // rule skipped
ff.isEnabled('feature', { userId: 'u1', plan: 'pro' }); // rule matches
```
