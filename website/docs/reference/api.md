---
sidebar_position: 1
title: API Reference
description: Complete API reference for the TinyFlag SDK.
---

# API Reference

## `TinyFlag` Class

### Constructor

```typescript
const ff = new TinyFlag(options: TinyFlagOptions);
```

| Option         | Type                            | Default      | Description                                                        |
| -------------- | ------------------------------- | ------------ | ------------------------------------------------------------------ |
| `source`       | `string \| FlagConfig \| Array` | **required** | File path, URL, inline config, or array for multi-source merging   |
| `headers`      | `Record<string, string>`        | —            | HTTP headers for URL source                                        |
| `pollInterval` | `number`                        | `60000`      | URL polling interval (ms). Minimum: 5000                           |
| `watch`        | `boolean`                       | `true`       | Watch file for changes (file source only)                          |
| `strict`       | `boolean`                       | `false`      | Reject unknown fields                                              |
| `deduplicate`  | `boolean`                       | `true`       | Deduplicate exposure events per (flag, userId)                     |
| `fetchTimeout` | `number`                        | `5000`       | Timeout in ms for fetching flags from a URL                        |
| `retries`      | `number`                        | `0`          | Number of retries for URL fetches on transient errors (429, 5xx)   |
| `retryDelay`   | `number`                        | `1000`       | Base delay in ms between retries (exponential backoff with jitter) |
| `debug`        | `boolean`                       | `false`      | Enable debug logging                                               |

### Methods

#### `init(): Promise<void>`

Load flags from source. Must be called before evaluating flags. Throws on invalid source or schema errors.

#### `isEnabled(flagName: string, context?: UserContext): boolean`

Check if a flag is enabled. **Never throws** — returns `false` for unknown flags and emits an `error` event.

#### `getVariant(flagName: string, context?: UserContext): string | null`

Get the assigned variant. **Never throws** — returns `null` for unknown flags, disabled flags, or missing userId.

#### `on(event: string, handler: Function): void`

Register an event listener for `'exposure'`, `'change'`, or `'error'` events.

#### `off(event: string, handler: Function): void`

Remove a previously registered event listener.

#### `reload(newSource?: string | FlagConfig): Promise<void>`

Manually reload flags. Optionally provide a new source.

#### `getFlags(): Record<string, FlagDefinition>`

Get a read-only snapshot of all current flag definitions.

#### `getAllFlags(context?: UserContext): Record<string, { enabled: boolean; variant: string | null }>`

Evaluate all flags against a context and return a map of results. Useful for SSR hydration and debugging. Overrides are applied.

#### `override(flagName: string, value: boolean | string): void`

Override a flag's value for testing or development. Boolean values override `isEnabled`; string values override `getVariant`.

#### `clearOverrides(): void`

Remove all flag overrides.

#### `evaluateWithPersona(flagName: string, personaName: string, additionalContext?: UserContext): boolean`

Evaluate a flag using a named persona as the base context. The persona's properties are merged with `additionalContext` (additional takes precedence). Returns `false` if the persona or flag is not found.

#### `getPersonas(): Readonly<Record<string, Record<string, unknown>>>`

Get all defined personas from the flag configuration.

#### `getConfig<T>(flagName: string, context?: UserContext): T | null`

Get typed configuration values associated with a flag. Returns `null` if the flag is not found, disabled, or has no `config` field.

```typescript
const pricing = ff.getConfig<{ discount: number }>('pricing-experiment');
```

#### `destroy(): void`

Clean up all resources:

- Stops the polling timer (URL source)
- Closes the file watcher (file source)
- Removes all event listeners
- Clears the exposure deduplication cache
- Clears all flag overrides

## Utility Functions

### `parseYaml(input: string): unknown`

Parse a YAML string into a JavaScript object. Returns `null` for empty input.

```typescript
import { parseYaml } from 'tinyflag';

const raw = parseYaml(`
version: 1
flags:
  new-checkout:
    enabled: true
`);
```

### `validateConfig(config: unknown, strict?: boolean): ValidationError[]`

Validate a parsed flag configuration object. Returns an array of validation errors.

```typescript
import { parseYaml, validateConfig } from 'tinyflag';

const raw = parseYaml(yamlString);
const errors = validateConfig(raw);

if (errors.length > 0) {
  errors.forEach((e) => console.error(`${e.path}: ${e.message}`));
}
```

### `parseFlagConfig(raw: unknown, strict?: boolean)`

Parse and validate a raw configuration into a typed `FlagConfig`.

```typescript
import { parseYaml, parseFlagConfig } from 'tinyflag';

const raw = parseYaml(yamlString);
const { config, errors, warnings } = parseFlagConfig(raw);
```

**Returns:** `{ config: FlagConfig; errors: ValidationError[]; warnings: ValidationError[] }`

### `setDebug(enabled: boolean): void`

Enable or disable debug logging programmatically. Also available via `DEBUG=tinyflag` env var or the `debug` constructor option.

```typescript
import { setDebug } from 'tinyflag';
setDebug(true);
// ... debug output logged to console.debug ...
setDebug(false);
```

## Events

### `exposure`

Emitted when `isEnabled()` or `getVariant()` is called with a `userId`. Deduplicated by default.

```typescript
interface ExposureEvent {
  flag: string;
  variant: string | null;
  enabled: boolean;
  userId: string;
  timestamp: number; // Unix ms
}
```

### `change`

Emitted when flag definitions change (via reload, file watcher, or URL polling).

```typescript
interface ChangeEvent {
  flag: string;
  previous: FlagDefinition | undefined; // undefined = flag was added
  current: FlagDefinition | undefined; // undefined = flag was removed
  timestamp: number;
}
```

### `error`

Emitted for non-fatal errors. Evaluation methods never throw — they emit errors instead.

```typescript
interface ErrorEvent {
  code: string;
  message: string;
  flagName?: string;
}
```

| Code                    | Description                               |
| ----------------------- | ----------------------------------------- |
| `FLAG_NOT_FOUND`        | Unknown flag name                         |
| `INVALID_FLAG_NAME`     | Empty flag name                           |
| `LOAD_ERROR`            | Failed to reload flags                    |
| `UNKNOWN_FIELD`         | Unknown field in flag file (lenient mode) |
| `INSECURE_SOURCE`       | HTTP URL (not HTTPS)                      |
| `POLL_INTERVAL_CLAMPED` | pollInterval below 5s minimum             |
| `LISTENER_ERROR`        | Event listener threw an exception         |

:::note Safety guarantee
Listener errors are caught automatically and re-emitted as `error` events with code `LISTENER_ERROR`. Your event handlers will never crash the SDK.
:::

## Types

```typescript
interface UserContext {
  userId?: string;
  [key: string]: unknown;
}

interface FlagDefinition {
  enabled: boolean;
  description?: string;
  tags?: string[];
  rollout?: number;
  rules?: Rule[];
  variants?: Variant[];
}

interface Rule {
  conditions: Record<string, unknown>;
  enabled?: boolean;
  rollout?: number;
  variant?: string;
}

interface Variant {
  name: string;
  weight: number;
}

interface FlagConfig {
  version?: number;
  flags: Record<string, FlagDefinition>;
}
```
