---
sidebar_position: 1
title: Flag File Format
description: YAML and JSON schema reference for TinyFlag flag definitions.
---

# Flag File Format

TinyFlag reads flag definitions from YAML or JSON files. The flag file is the single source of truth — no server needed.

## Schema

```yaml
version: 1 # Schema version (currently: 1)
flags:
  <flag-name>: # kebab-case, 1-128 chars
    enabled: boolean # Required — global on/off switch
    description?: string # Optional — human-readable purpose
    tags?: string[] # Optional — categorization labels
    rollout?: number # Optional — 0-100, percentage of users
    rules?: Rule[] # Optional — targeting rules
    variants?: Variant[] # Optional — A/B test variants
```

### Version

The `version` field identifies the schema version. Currently, only `version: 1` is supported.

- **Optional:** When absent, TinyFlag assumes version 1 semantics.
- **Valid values:** Only `1` is accepted. Any other value causes a validation error.
- **Future compatibility:** Always include `version: 1` explicitly to ensure forward compatibility.

### Flag Names

Flag names must be kebab-case: lowercase letters, digits, and hyphens. Cannot start or end with a hyphen. Maximum 128 characters.

✅ `my-flag`, `new-checkout`, `feature-123`, `a`
❌ `My Flag`, `-bad-name`, `flag_with_underscores`

### Rules

```yaml
rules:
  - conditions: # All conditions must match (AND logic)
      plan: pro # Equality
      email: '*@company.com' # Glob pattern
    enabled: true # Override enabled state
    rollout: 80 # Override rollout %
    variant: premium # Force a variant
```

### Tags

```yaml
flags:
  new-checkout:
    enabled: true
    tags: [beta, checkout]
    rollout: 50
```

Tags are optional string arrays for categorization and filtering (e.g., in the dashboard or custom tooling).

### Variants

```yaml
variants:
  - name: control # Variant identifier
    weight: 50 # Relative weight (not absolute %)
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

A JSON Schema file (`flags.schema.json`) is included in the package for IDE autocompletion and validation.

### VS Code (YAML Extension)

Install the [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) by Red Hat, then add a schema comment at the top of your flag file:

```yaml
# yaml-language-server: $schema=./node_modules/tinyflag/flags.schema.json
version: 1
flags:
  my-flag:
    enabled: true
```

Alternatively, configure it globally in `.vscode/settings.json`:

```json
{
  "yaml.schemas": {
    "./node_modules/tinyflag/flags.schema.json": ["flags.yml", "flags.yaml"]
  }
}
```

### VS Code (JSON files)

For JSON flag files, add a `$schema` property:

```json
{
  "$schema": "./node_modules/tinyflag/flags.schema.json",
  "version": 1,
  "flags": {}
}
```

### JetBrains IDEs

Go to **Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings**, add a new mapping pointing to `node_modules/tinyflag/flags.schema.json` and map it to your flag file pattern (e.g., `flags.yml`).

## Validation

Validate your flag file with the CLI:

```bash
npx tinyflag validate ./flags.yml
```

### Strict Mode

By default, unknown fields are ignored with a warning. Enable strict mode to reject them:

```typescript
const ff = new TinyFlag({ source: './flags.yml', strict: true });
```

| Validation Check                          | Default (lenient)       | Strict mode            |
| ----------------------------------------- | ----------------------- | ---------------------- |
| Unknown root-level fields (e.g., `meta:`) | Warning (field ignored) | **Error** (load fails) |
| Unknown flag fields (e.g., `priority:`)   | Warning (field ignored) | **Error** (load fails) |
| Invalid flag names (non-kebab-case)       | Error (load fails)      | Error (load fails)     |
| Missing `enabled` field                   | Error (load fails)      | Error (load fails)     |
| Invalid rollout range (not 0-100)         | Error (load fails)      | Error (load fails)     |
| All variant weights are zero              | Error (load fails)      | Error (load fails)     |

**When to use strict mode:**

- In CI/CD validation pipelines (`npx tinyflag validate --strict`)
- In development to catch typos in flag field names early
- When you want to ensure flag files contain no extraneous data
