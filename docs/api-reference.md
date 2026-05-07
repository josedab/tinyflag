# API Reference

## `TinyFlag` Class

### Constructor

```typescript
const ff = new TinyFlag(options: TinyFlagOptions);
```

| Option         | Type                     | Default      | Description                                                      |
| -------------- | ------------------------ | ------------ | ---------------------------------------------------------------- |
| `source`       | `string \| FlagConfig`   | **required** | File path (.yml/.yaml/.json), URL (http/https), or inline config |
| `headers`      | `Record<string, string>` | —            | HTTP headers for URL source                                      |
| `pollInterval` | `number`                 | `60000`      | URL polling interval (ms). Minimum: 5000                         |
| `watch`        | `boolean`                | `true`       | Watch file for changes (file source only)                        |
| `strict`       | `boolean`                | `false`      | Reject unknown fields                                            |
| `deduplicate`  | `boolean`                | `true`       | Deduplicate exposure events per (flag, userId)                   |
| `fetchTimeout` | `number`                 | `5000`       | Timeout in ms for fetching flags from a URL                      |
| `debug`        | `boolean`                | `false`      | Enable debug logging (also enabled via `DEBUG=tinyflag` env var) |

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

Override a flag's value for testing or development. Boolean values override `isEnabled`; string values override `getVariant`. Emits an `error` event for empty flag names.

#### `clearOverrides(): void`

Remove all flag overrides.

#### `destroy(): void`

Clean up file watchers, polling timers, and event listeners.

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
