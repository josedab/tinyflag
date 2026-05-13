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
| `deduplicate`  | `boolean`                | `true`       | Deduplicate exposure events per (flag, userId). Uses an in-memory `Set<string>` cache that is unbounded and lives for the instance lifetime — there is no TTL or size limit. For long-lived server processes, be aware the cache grows with each unique `(flag, userId)` pair. Calling `destroy()` clears the cache. |
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

## Utility Functions

### `parseYaml(input: string): unknown`

Parse a YAML string into a JavaScript object. Returns `null` for empty input. Throws an `Error` with a descriptive message if parsing fails.

```typescript
import { parseYaml } from 'tinyflag';

const raw = parseYaml(`
version: 1
flags:
  new-checkout:
    enabled: true
    rollout: 50
`);
// raw = { version: 1, flags: { 'new-checkout': { enabled: true, rollout: 50 } } }
```

| Parameter | Type     | Description              |
| --------- | -------- | ------------------------ |
| `input`   | `string` | YAML string to parse     |

**Returns:** `unknown` — the parsed JavaScript value, or `null` if the input is empty.

---

### `validateConfig(config: unknown, strict?: boolean): ValidationError[]`

Validate a parsed flag configuration object. Returns an array of validation errors (empty array means the configuration is valid).

```typescript
import { parseYaml, validateConfig } from 'tinyflag';

const raw = parseYaml(yamlString);
const errors = validateConfig(raw);

if (errors.length > 0) {
  errors.forEach((e) => console.error(`${e.path}: ${e.message}`));
} else {
  console.log('Configuration is valid');
}

// Strict mode rejects unknown fields
const strictErrors = validateConfig(raw, true);
```

| Parameter | Type      | Default | Description                            |
| --------- | --------- | ------- | -------------------------------------- |
| `config`  | `unknown` | —       | Parsed configuration object to validate |
| `strict`  | `boolean` | `false` | When `true`, rejects unknown fields    |

**Returns:** `ValidationError[]` — array of validation errors. Empty if valid.

---

### `parseFlagConfig(raw: unknown, strict?: boolean): { config: FlagConfig; errors: ValidationError[]; warnings: ValidationError[] }`

Parse and validate a raw configuration object into a typed `FlagConfig`. Combines validation and type-safe parsing in one step.

```typescript
import { parseYaml, parseFlagConfig } from 'tinyflag';

const raw = parseYaml(yamlString);
const { config, errors, warnings } = parseFlagConfig(raw);

if (errors.length > 0) {
  console.error('Invalid config:', errors);
} else {
  console.log('Flags:', Object.keys(config.flags));
  warnings.forEach((w) => console.warn(`${w.path}: ${w.message}`));
}
```

| Parameter | Type      | Default | Description                            |
| --------- | --------- | ------- | -------------------------------------- |
| `raw`     | `unknown` | —       | Parsed configuration object            |
| `strict`  | `boolean` | `false` | When `true`, rejects unknown fields    |

**Returns:** An object with:
- `config` — `FlagConfig` (typed flag definitions; empty `{ flags: {} }` if errors)
- `errors` — `ValidationError[]` (fatal validation errors)
- `warnings` — `ValidationError[]` (non-fatal warnings, e.g., unknown fields in lenient mode)

---

### `setDebug(enabled: boolean): void`

Enable or disable debug logging programmatically. Debug logging can also be enabled via the `DEBUG=tinyflag` environment variable or the `debug: true` constructor option.

```typescript
import { setDebug } from 'tinyflag';

// Enable debug logging
setDebug(true);

// ... perform operations — debug output will be logged to console.debug ...

// Disable when done
setDebug(false);
```

| Parameter | Type      | Description                       |
| --------- | --------- | --------------------------------- |
| `enabled` | `boolean` | `true` to enable, `false` to disable |

---

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

> **Safety guarantee:** Listener errors are caught automatically and re-emitted as `error` events with code `LISTENER_ERROR`. Your event handlers will never crash the SDK — a failing listener in a `change` or `exposure` handler is isolated and reported via the `error` event instead.

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

## Loader Utilities

Low-level functions used internally by TinyFlag for loading and parsing flag sources. These are exported from `packages/core/src/loader.ts` but are **not re-exported from the public API** — they are intended for advanced use cases such as custom loaders or build-time tooling.

> **Note:** These functions are not available via a subpath export. Import them directly from the source file:

```typescript
// Direct file-level import (internal use only)
import { detectSourceType, parseSource, loadFromFile, loadFromUrl, loadFromInline } from 'tinyflag/dist/loader.js';
```

### `detectSourceType(source: string | FlagConfig): SourceType`

Determine the source type from a source value.

```typescript
detectSourceType('./flags.yml');        // → 'file'
detectSourceType('https://cdn.example.com/flags.json'); // → 'url'
detectSourceType({ flags: {} });        // → 'inline'
```

| Parameter | Type                    | Description      |
| --------- | ----------------------- | ---------------- |
| `source`  | `string \| FlagConfig`  | The flag source  |

**Returns:** `SourceType` — one of `'file'`, `'url'`, or `'inline'`.

---

### `parseSource(content: string, filePath: string, strict: boolean): LoadResult`

Parse raw text content (YAML or JSON) into a validated `FlagConfig`. The file extension of `filePath` determines the parser: `.json` uses `JSON.parse`, everything else uses the built-in YAML parser.

```typescript
const yamlContent = `
version: 1
flags:
  my-flag:
    enabled: true
`;
const result = parseSource(yamlContent, 'flags.yml', false);
console.log(result.config.flags['my-flag'].enabled); // true
```

| Parameter  | Type      | Description                                |
| ---------- | --------- | ------------------------------------------ |
| `content`  | `string`  | Raw YAML or JSON string                    |
| `filePath` | `string`  | File path (used to detect JSON vs YAML)    |
| `strict`   | `boolean` | Reject unknown fields when `true`          |

**Returns:** `LoadResult` — `{ config: FlagConfig, warnings: ValidationError[] }`. Throws on parse or validation errors.

---

### `loadFromFile(filePath: string, strict: boolean): Promise<LoadResult>`

Load flags from a local file path. Node.js, Bun, and Deno only — not available in browser or edge runtimes.

```typescript
const result = await loadFromFile('./flags.yml', false);
console.log(Object.keys(result.config.flags));
```

| Parameter  | Type      | Description                            |
| ---------- | --------- | -------------------------------------- |
| `filePath` | `string`  | Path to the flags file                 |
| `strict`   | `boolean` | Reject unknown fields when `true`      |

**Returns:** `Promise<LoadResult>`. Throws if the file is not found, unreadable, or invalid.

---

### `loadFromUrl(url, strict, headers?, etag?, lastModified?, fetchTimeout?): Promise<LoadResult & { etag?, lastModified?, notModified? }>`

Load flags from a URL. Supports conditional requests via `ETag` / `If-Modified-Since` headers for efficient polling.

```typescript
const result = await loadFromUrl('https://cdn.example.com/flags.yml', false);
console.log(result.config.flags);

// Subsequent polls with conditional headers
const updated = await loadFromUrl(
  'https://cdn.example.com/flags.yml',
  false,
  undefined,
  result.etag,
  result.lastModified,
);
if (updated.notModified) {
  console.log('No changes');
}
```

| Parameter      | Type                        | Default | Description                          |
| -------------- | --------------------------- | ------- | ------------------------------------ |
| `url`          | `string`                    | —       | URL to fetch flags from              |
| `strict`       | `boolean`                   | —       | Reject unknown fields when `true`    |
| `headers`      | `Record<string, string>`    | —       | Custom HTTP headers                  |
| `etag`         | `string`                    | —       | ETag from previous response          |
| `lastModified` | `string`                    | —       | Last-Modified from previous response |
| `fetchTimeout` | `number`                    | `5000`  | Timeout in milliseconds              |

**Returns:** `Promise<LoadResult & { etag?: string; lastModified?: string; notModified?: boolean }>`. Throws on network or validation errors.

---

### `loadFromInline(source: FlagConfig, strict: boolean): LoadResult`

Validate and load flags from an inline object. Useful for serverless/edge environments.

```typescript
const result = loadFromInline({
  version: 1,
  flags: {
    'my-flag': { enabled: true, rollout: 50 },
  },
}, false);
console.log(result.config.flags);
```

| Parameter | Type         | Description                         |
| --------- | ------------ | ----------------------------------- |
| `source`  | `FlagConfig` | Inline flag configuration object    |
| `strict`  | `boolean`    | Reject unknown fields when `true`   |

**Returns:** `LoadResult` — `{ config: FlagConfig, warnings: ValidationError[] }`. Throws on validation errors.

---

### Loader Types

```typescript
type SourceType = 'file' | 'url' | 'inline';

interface LoadResult {
  config: FlagConfig;
  warnings: ValidationError[];
}
```
