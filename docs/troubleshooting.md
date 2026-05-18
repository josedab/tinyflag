# Troubleshooting

Common issues and solutions when using TinyFlag.

## Error Codes

TinyFlag emits errors via the event system rather than throwing exceptions. Always attach an error listener:

```ts
ff.on('error', (e) => console.warn(`[TinyFlag] ${e.code}: ${e.message}`));
```

### `FLAG_NOT_FOUND`

**Cause:** You called `isEnabled()` or `getVariant()` with a flag name that doesn't exist in your configuration.

**Solutions:**

- Check for typos in the flag name.
- Ensure the flag is defined in your `flags.yml` or inline source.
- Verify that `ff.init()` has completed before evaluating flags.

```ts
// Returns false for unknown flags — check your error listener for details
ff.isEnabled('my-feture'); // typo → FLAG_NOT_FOUND emitted, returns false
```

### `LOAD_ERROR`

**Cause:** TinyFlag could not load or parse the flag source (file, URL, or inline object).

**Solutions:**

- **File source:** Verify the file path exists and is readable.
- **URL source:** Confirm the endpoint returns valid YAML or JSON with a `version` and `flags` field.
- **YAML syntax:** Validate your YAML with `tinyflag validate`:
  ```bash
  npx tinyflag validate flags.yml
  ```

### `INVALID_FLAG_NAME`

**Cause:** An empty string, `null`, or `undefined` was passed as a flag name.

**Solution:** Check that flag names are non-empty strings before calling `isEnabled()` or `getVariant()`.

### `INSECURE_SOURCE`

**Cause:** A URL source uses `http://` instead of `https://`.

**Solution:** Use an HTTPS URL for your flag source. If you must use HTTP in development, this warning can be safely ignored.

### `UNKNOWN_FIELD`

**Cause:** Your flag configuration contains fields that TinyFlag doesn't recognize.

**Solution:** Review your `flags.yml` for typos in field names. Valid flag fields include: `enabled`, `description`, `rollout`, `variants`, `rules`, `tags`.

### `POLL_INTERVAL_CLAMPED`

**Cause:** The `pollInterval` option was set below the 5000ms minimum.

**Solution:** Use a poll interval of at least 5000ms (5 seconds):

```ts
const ff = new TinyFlag({
  source: './flags.yml',
  pollInterval: 10000, // 10 seconds
});
```

### `LISTENER_ERROR`

**Cause:** An event listener callback threw an exception.

**Solution:** Add error handling inside your event listeners:

```ts
ff.on('change', (event) => {
  try {
    // your logic here
  } catch (err) {
    console.error('Listener error:', err);
  }
});
```

## Common Issues

### Flags not loading

1. **`init()` not awaited:** Always `await ff.init()` before evaluating flags.

   ```ts
   const ff = new TinyFlag({ source: './flags.yml' });
   await ff.init(); // Don't forget this!
   ```

2. **Wrong file path:** Paths are resolved relative to `process.cwd()`, not the source file. Use an absolute path if unsure:

   ```ts
   import { resolve } from 'path';
   const ff = new TinyFlag({ source: resolve(__dirname, '../flags.yml') });
   ```

3. **No filesystem in serverless:** Cloudflare Workers and similar edge runtimes don't have `fs` access. Use an inline source or URL source instead.

### Rollout not working as expected

- **Rollout is deterministic:** The same `userId` always gets the same result for the same flag. This is by design — TinyFlag hashes the `userId + flagName` to produce a stable percentage.
- **No `userId` in context:** If no `userId` is provided, rollout is evaluated without user-level consistency. Always pass a `userId` for percentage-based rollouts.
- **Rollout 0 with rules:** A flag with `rollout: 0` is disabled for everyone _except_ users matching a `rules` condition. This is the correct pattern for targeted rollouts.

### File watcher not triggering

- **Editor save behavior:** Some editors (e.g., Vim, IntelliJ) write to a temp file and rename. TinyFlag uses a 100ms debounce to handle this, but in rare cases changes may be missed.
- **Watch disabled:** File watching only works with file-path sources. URL and inline sources don't trigger watches.
- **`watch: false`:** If you explicitly set `watch: false`, file changes won't be detected.
- **Serverless environments:** File watchers don't work in serverless/edge runtimes. Use `pollInterval` for URL sources instead.

### Variants returning `null`

- **No variants defined:** `getVariant()` returns `null` if the flag has no `variants` array.
- **Flag disabled:** If the flag is disabled or the user doesn't pass the rollout check, `getVariant()` returns `null`.
- **Weights must be positive:** Variant weights of `0` effectively exclude that variant.

## Enabling Debug Logging

TinyFlag includes built-in debug logging that traces initialization, flag evaluation, source loading, and event dispatch. There are three ways to enable it:

### Using `setDebug()` (Programmatic)

```ts
import { setDebug } from 'tinyflag';

// Enable debug logging
setDebug(true);

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

ff.isEnabled('new-checkout', { userId: 'user-1' });

// Disable when done
setDebug(false);
```

### Using the `debug` Constructor Option

```ts
const ff = new TinyFlag({
  source: './flags.yml',
  debug: true,
});
```

### Using the `DEBUG` Environment Variable

```bash
DEBUG=tinyflag node app.js
```

### Expected Debug Output

When debug logging is enabled, you'll see output like this in the console:

```
[tinyflag] Initializing with source type: file
[tinyflag] Loading flags from file: ./flags.yml
[tinyflag] Parsed 3 flags
[tinyflag] Evaluating flag: new-checkout { userId: 'user-1' }
[tinyflag] Rollout check: hash=42, rollout=50, result=true
```

Debug messages are logged via `console.debug()` and prefixed with `[tinyflag]`.

## Getting Help

- [GitHub Issues](https://github.com/josedab/tinyflag/issues) — Bug reports and feature requests
- [API Reference](./api-reference.md) — Full SDK API documentation
- [Flag Format](./flag-format.md) — YAML/JSON flag configuration reference

## Debugging Flag Evaluation

When a flag isn't behaving as expected, follow this step-by-step workflow to diagnose the issue.

### 1. Enable Debug Logging

Turn on debug mode to trace evaluation steps:

```ts
import { setDebug } from 'tinyflag';
setDebug(true);
```

Debug output shows initialization, flag loading, rule matching, rollout hash calculations, and variant assignment. Look for lines like:

```
[tinyflag] Evaluating flag: new-checkout { userId: 'user-1' }
[tinyflag] Rollout check: hash=42, rollout=50, result=true
```

### 2. Inspect Loaded Flags

Verify that your flag definitions were loaded correctly:

```ts
const flags = ff.getFlags();
console.log(JSON.stringify(flags['my-flag'], null, 2));
```

Check that `enabled`, `rollout`, `rules`, and `variants` match your expectations.

### 3. Evaluate All Flags at Once

Use `getAllFlags()` to see how all flags evaluate for a specific user:

```ts
const results = ff.getAllFlags({ userId: 'user-123', plan: 'pro' });
console.log(results);
// { 'new-checkout': { enabled: true, variant: 'new-flow' }, ... }
```

This reveals whether the issue is isolated to one flag or affects multiple flags.

### 4. Check Rules Evaluation Order

Rules are evaluated top-to-bottom — **the first matching rule wins**. If a flag has multiple rules, verify the order in your flag file:

```yaml
rules:
  - conditions: { plan: enterprise }  # Checked first
    enabled: true
  - conditions: { plan: pro }         # Checked second
    enabled: true
    rollout: 50
```

A user matching both rules will get the first rule's behavior.

### 5. Verify userId for Rollout/Variant Features

Rollout percentages and variant assignments require a `userId` in the context. Without it, rollout is non-deterministic and variants return `null`:

```ts
// ❌ No userId — rollout won't be consistent
ff.isEnabled('my-flag', { plan: 'pro' });

// ✅ Provide userId for deterministic evaluation
ff.isEnabled('my-flag', { userId: 'user-123', plan: 'pro' });
```

## Error Handling Patterns

### Wrapping `init()` in try/catch

`init()` throws when the flag source is unreachable or contains validation errors. Always wrap it:

```typescript
const ff = new TinyFlag({ source: './flags.yml' });

try {
  await ff.init();
} catch (err) {
  console.error('Failed to initialize flags:', err);
  // App continues — all flags return false / null by default
}
```

If `init()` fails, the SDK is still usable: `isEnabled()` returns `false` and `getVariant()` returns `null` for all flags, since no flags were loaded.

### Monitoring with Error Events

Attach an `error` listener early to capture non-fatal issues (unknown flags, load failures on reload, insecure sources):

```typescript
ff.on('error', (e) => {
  logger.warn({ code: e.code, message: e.message, flag: e.flagName }, 'TinyFlag error');
  // Send to your monitoring system (e.g., Sentry, Datadog)
});
```

### Graceful Degradation on Reload Failures

When using URL or file sources with polling/watching, reload failures emit a `LOAD_ERROR` event but **do not discard the current flags**. The SDK continues serving the last successfully loaded configuration:

```typescript
ff.on('error', (e) => {
  if (e.code === 'LOAD_ERROR') {
    console.warn('Flag reload failed — serving stale flags:', e.message);
  }
});
```

### Cleanup on Shutdown

Always call `destroy()` in server shutdown handlers to stop file watchers and polling timers:

```typescript
process.on('SIGTERM', () => {
  ff.destroy();
  process.exit(0);
});
```
