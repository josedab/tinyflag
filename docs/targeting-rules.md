# Targeting Rules

Rules let you target specific user segments. Each flag can have multiple rules evaluated top-to-bottom — first match wins.

## Rule Structure

```yaml
rules:
  - conditions:        # All conditions must match (AND logic)
      field: value     # Condition on a UserContext field
    enabled: true      # What happens when rule matches
```

## Operators

### Equality

```yaml
conditions:
  plan: pro            # context.plan === 'pro'
```

### Glob Pattern

```yaml
conditions:
  email: '*@company.com'   # Matches alice@company.com
```

Only `*` wildcard is supported. A pattern without `*` is treated as equality.

### Numeric Comparison

```yaml
conditions:
  age: { $gte: 18 }       # context.age >= 18
  score: { $lt: 100 }     # context.score < 100
```

Supported: `$gt`, `$gte`, `$lt`, `$lte`. Returns false for non-numeric context values.

### List Inclusion

```yaml
conditions:
  country: { $in: [US, CA, UK] }   # context.country is one of these
```

### Negation

```yaml
conditions:
  plan: { $not: free }     # context.plan !== 'free'
```

## Rule Effects

When a rule matches, it can:

```yaml
rules:
  - conditions: { plan: pro }
    enabled: true          # Enable the flag for this segment

  - conditions: { plan: pro }
    rollout: 80            # Override rollout to 80% for pros

  - conditions: { role: beta }
    variant: new-ui        # Force a specific variant
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
rollout: 0  # Disabled for everyone else
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
rollout: 10  # 10% elsewhere
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
rollout: 0  # Free users don't get it
```
