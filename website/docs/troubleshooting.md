---
sidebar_position: 9
title: Troubleshooting
description: Common issues, error codes, and debugging tips.
---

# Troubleshooting

## Error Codes

TinyFlag emits errors via the event system rather than throwing exceptions. Always attach an error listener:

```typescript
ff.on('error', (e) => console.warn(`[TinyFlag] ${e.code}: ${e.message}`));
```

### `FLAG_NOT_FOUND`

**Cause:** You called `isEnabled()` or `getVariant()` with a flag name that doesn't exist.

**Solutions:**
- Check for typos in the flag name
- Ensure the flag is defined in your `flags.yml`
- Verify that `ff.init()` has completed before evaluating flags

### `LOAD_ERROR`

**Cause:** TinyFlag could not load or parse the flag source.

**Solutions:**
- **File source:** Verify the file path exists and is readable
- **URL source:** Confirm the endpoint returns valid YAML or JSON
- **YAML syntax:** Validate with `npx tinyflag validate flags.yml`

### `INVALID_FLAG_NAME`

**Cause:** An empty string, `null`, or `undefined` was passed as a flag name.

**Solution:** Check that flag names are non-empty strings before calling `isEnabled()` or `getVariant()`.

### `INSECURE_SOURCE`

**Cause:** A URL source uses `http://` instead of `https://`.

**Solution:** Use an HTTPS URL. In development, this warning can be safely ignored.

### `UNKNOWN_FIELD`

**Cause:** Your flag configuration contains unrecognized fields.

**Solution:** Review your `flags.yml` for typos. Valid fields: `enabled`, `description`, `rollout`, `variants`, `rules`, `tags`.

### `POLL_INTERVAL_CLAMPED`

**Cause:** The `pollInterval` option was set below the 5000ms minimum.

**Solution:** Use a poll interval of at least 5000ms.

### `LISTENER_ERROR`

**Cause:** An event listener callback threw an exception.

**Solution:** Add error handling inside your event listeners.

## Common Issues

### Flags not loading

1. **`init()` not awaited:** Always `await ff.init()` before evaluating flags.

   ```typescript
   const ff = new TinyFlag({ source: './flags.yml' });
   await ff.init(); // Don't forget this!
   ```

2. **Wrong file path:** Paths are resolved relative to `process.cwd()`, not the source file. Use an absolute path if unsure:

   ```typescript
   import { resolve } from 'path';
   const ff = new TinyFlag({ source: resolve(__dirname, '../flags.yml') });
   ```

3. **No filesystem in serverless:** Cloudflare Workers and similar edge runtimes don't have `fs` access. Use an inline source or URL source instead.

### Rollout not working as expected

- **Rollout is deterministic:** The same `userId` always gets the same result for the same flag.
- **No `userId` in context:** Always pass a `userId` for percentage-based rollouts.
- **Rollout 0 with rules:** A flag with `rollout: 0` is disabled for everyone _except_ users matching a `rules` condition.

### File watcher not triggering

- **Editor save behavior:** Some editors (e.g., Vim, IntelliJ) write to a temp file and rename. TinyFlag uses a 100ms debounce to handle this.
- **`watch: false`:** If you explicitly disabled watching, file changes won't be detected.
- **Serverless environments:** File watchers don't work in serverless/edge runtimes. Use `pollInterval` for URL sources instead.

### Variants returning `null`

- **No variants defined:** `getVariant()` returns `null` if the flag has no `variants` array.
- **Flag disabled:** Disabled flags always return `null` for variants.
- **Weights must be positive:** Variant weights of `0` effectively exclude that variant.

## Enabling Debug Logging

Three ways to enable debug logging:

### Programmatic

```typescript
import { setDebug } from 'tinyflag';
setDebug(true);
```

### Constructor Option

```typescript
const ff = new TinyFlag({ source: './flags.yml', debug: true });
```

### Environment Variable

```bash
DEBUG=tinyflag node app.js
```

### Expected Debug Output

```
[tinyflag] Initializing with source type: file
[tinyflag] Loading flags from file: ./flags.yml
[tinyflag] Parsed 3 flags
[tinyflag] Evaluating flag: new-checkout { userId: 'user-1' }
[tinyflag] Rollout check: hash=42, rollout=50, result=true
```

## Debugging Flag Evaluation

### 1. Enable Debug Logging

Turn on debug mode to trace evaluation steps.

### 2. Inspect Loaded Flags

```typescript
const flags = ff.getFlags();
console.log(JSON.stringify(flags['my-flag'], null, 2));
```

### 3. Evaluate All Flags at Once

```typescript
const results = ff.getAllFlags({ userId: 'user-123', plan: 'pro' });
console.log(results);
```

### 4. Check Rules Order

Rules are evaluated top-to-bottom — the first matching rule wins. Verify the order in your flag file.

### 5. Verify userId

Rollout percentages and variant assignments require a `userId`:

```typescript
// ❌ No userId — rollout won't be consistent
ff.isEnabled('my-flag', { plan: 'pro' });

// ✅ Provide userId for deterministic evaluation
ff.isEnabled('my-flag', { userId: 'user-123', plan: 'pro' });
```

## Error Handling Patterns

### Wrapping `init()` in try/catch

```typescript
const ff = new TinyFlag({ source: './flags.yml' });
try {
  await ff.init();
} catch (err) {
  console.error('Failed to initialize flags:', err);
  // App continues — all flags return false / null
}
```

### Graceful Degradation on Reload Failures

Reload failures emit a `LOAD_ERROR` event but **do not discard current flags**. The SDK continues serving the last successfully loaded configuration.

### Cleanup on Shutdown

```typescript
process.on('SIGTERM', () => {
  ff.destroy();
  process.exit(0);
});
```

## Getting Help

- [GitHub Issues](https://github.com/josedab/tinyflag/issues) — Bug reports and feature requests
- [API Reference](/docs/reference/api) — Full SDK API documentation
- [Flag Format](/docs/concepts/flag-format) — YAML/JSON flag configuration reference
