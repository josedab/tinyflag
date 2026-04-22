# Flag File Format

TinyFlag reads flag definitions from YAML or JSON files. The flag file is the single source of truth — no server needed.

## Schema

```yaml
version: 1                      # Schema version (currently: 1)
flags:
  <flag-name>:                   # kebab-case, 1-128 chars
    enabled: boolean             # Required — global on/off switch
    description?: string         # Optional — human-readable purpose
    tags?: string[]              # Optional — categorization labels
    rollout?: number             # Optional — 0-100, percentage of users
    rules?: Rule[]               # Optional — targeting rules
    variants?: Variant[]         # Optional — A/B test variants
```

### Flag Names

Flag names must be kebab-case: lowercase letters, digits, and hyphens. Cannot start or end with a hyphen. Maximum 128 characters.

✅ `my-flag`, `new-checkout`, `feature-123`, `a`
❌ `My Flag`, `-bad-name`, `flag_with_underscores`

### Rules

```yaml
rules:
  - conditions:              # All conditions must match (AND logic)
      plan: pro              # Equality
      email: '*@company.com' # Glob pattern
    enabled: true            # Override enabled state
    rollout: 80              # Override rollout %
    variant: premium         # Force a variant
```

### Variants

```yaml
variants:
  - name: control            # Variant identifier
    weight: 50               # Relative weight (not absolute %)
  - name: new-flow
    weight: 50
```

Weights are relative — `[1, 99]` means 1% and 99%, and `[50, 30]` means 62.5% and 37.5%.

## JSON Format

The same schema works in JSON:

```json
{
  "version": 1,
  "flags": {
    "new-checkout": {
      "enabled": true,
      "rollout": 50
    }
  }
}
```

## JSON Schema

For IDE autocompletion, reference the JSON Schema:

```yaml
# yaml-language-server: $schema=./node_modules/tinyflag/flags.schema.json
version: 1
flags: ...
```

## Validation

Validate your flag file:

```bash
npx tinyflag validate ./flags.yml
```

### Strict Mode

By default, unknown fields are ignored with a warning. Enable strict mode to reject them:

```typescript
const ff = new TinyFlag({ source: './flags.yml', strict: true });
```
