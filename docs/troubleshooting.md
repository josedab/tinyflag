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

**Solution:** Review your `flags.yml` for typos in field names. Valid flag fields include: `enabled`, `description`, `rollout`, `variants`, `rules`, `metadata`.

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

## Getting Help

- [GitHub Issues](https://github.com/josedab/tinyflag/issues) — Bug reports and feature requests
- [API Reference](./api-reference.md) — Full SDK API documentation
- [Flag Format](./flag-format.md) — YAML/JSON flag configuration reference
