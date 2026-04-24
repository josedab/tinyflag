# 🚩 TinyFlag

**Feature flags that fit in your pocket.**

Serverless, file-driven, zero-dependency feature flag SDK for JavaScript/TypeScript. Define flags in YAML or JSON, commit to Git, evaluate everywhere — no server, no dashboard, no vendor lock-in.

[![npm version](https://img.shields.io/npm/v/tinyflag)](https://www.npmjs.com/package/tinyflag)
[![CI](https://github.com/josedab/tinyflag/actions/workflows/ci.yml/badge.svg)](https://github.com/josedab/tinyflag/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/josedab/tinyflag/branch/main/graph/badge.svg)](https://codecov.io/gh/josedab/tinyflag)
[![bundle size](https://img.shields.io/bundlephobia/minzip/tinyflag)](https://bundlephobia.com/package/tinyflag)
[![license](https://img.shields.io/npm/l/tinyflag)](./LICENSE)

## Why TinyFlag?

| Feature           | LaunchDarkly | Unleash     | GrowthBook  | **TinyFlag**     |
| ----------------- | ------------ | ----------- | ----------- | ---------------- |
| Requires server   | ✅ (SaaS)    | ✅          | ✅          | ❌ **No**        |
| Git-native flags  | ❌           | ❌          | ❌          | ✅               |
| Zero dependencies | ❌           | ❌          | ❌          | ✅               |
| Edge/serverless   | Partial      | ❌          | Partial     | ✅               |
| Bundle size       | ~50KB        | ~30KB       | ~20KB       | **< 8KB**        |
| Pricing           | $$$$         | Free + paid | Free + paid | **Free forever** |

## Quick Start (< 60 seconds)

### 1. Install

```bash
npm install tinyflag
```

### 2. Create `flags.yml`

```yaml
version: 1
flags:
  new-checkout:
    enabled: true
    rollout: 50
  dark-mode:
    enabled: false
```

### 3. Use it

```typescript
import { TinyFlag } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

if (ff.isEnabled('new-checkout', { userId: user.id })) {
  showNewCheckout();
}
```

That's it. No API keys, no servers, no config files.

## Features

### Percentage Rollouts

Roll out features to a percentage of users with deterministic bucketing:

```yaml
flags:
  new-feature:
    enabled: true
    rollout: 25 # 25% of users
```

```typescript
// Same user always gets the same result
ff.isEnabled('new-feature', { userId: 'user-123' }); // true or false, consistently
```

### A/B Testing

Run experiments with weighted variants:

```yaml
flags:
  checkout-flow:
    enabled: true
    variants:
      - name: control
        weight: 50
      - name: new-flow
        weight: 50
```

```typescript
const variant = ff.getVariant('checkout-flow', { userId: user.id });
// 'control' or 'new-flow' — deterministic per user
```

### Targeting Rules

Target specific user segments:

```yaml
flags:
  beta-features:
    enabled: true
    rules:
      - conditions:
          plan: pro
        enabled: true
      - conditions:
          email: '*@company.com'
        enabled: true
      - conditions:
          country: { $in: [US, CA] }
        rollout: 80
      - conditions:
          age: { $gte: 18 }
        enabled: true
    rollout: 0 # disabled for everyone else
```

**Supported operators:**

| Operator                     | Example                      | Description        |
| ---------------------------- | ---------------------------- | ------------------ |
| Equality                     | `plan: pro`                  | Exact match        |
| Glob                         | `email: '*@co.com'`          | Wildcard pattern   |
| `$gte`, `$gt`, `$lte`, `$lt` | `age: { $gte: 18 }`          | Numeric comparison |
| `$in`                        | `country: { $in: [US, CA] }` | List membership    |
| `$not`                       | `plan: { $not: free }`       | Negation           |

### Multiple Sources

```typescript
// File (Node.js, Bun, Deno)
new TinyFlag({ source: './flags.yml' });

// URL (all runtimes, including browsers and edge)
new TinyFlag({
  source: 'https://cdn.example.com/flags.json',
  headers: { Authorization: 'Bearer <token>' },
});

// Inline (testing, edge workers, bundled configs)
new TinyFlag({
  source: {
    version: 1,
    flags: { 'my-flag': { enabled: true } },
  },
});
```

### Event Tracking

```typescript
// Track feature exposures for A/B test analysis
ff.on('exposure', (event) => {
  analytics.track('feature_exposure', event);
  // { flag, variant, enabled, userId, timestamp }
});

// React to flag changes (hot reload / polling)
ff.on('change', (event) => {
  console.log(`Flag ${event.flag} changed`);
});

// Handle errors gracefully
ff.on('error', (event) => {
  console.warn(`TinyFlag: ${event.code} — ${event.message}`);
});
```

### TypeScript Types

Generate type-safe flag definitions:

```bash
npx tinyflag generate ./flags.yml -o ./src/flags.d.ts
```

```typescript
// Auto-generated
export interface TinyFlagDefinitions {
  'new-checkout': { variants: 'control' | 'new-flow' };
  'dark-mode': { variants: never };
}
```

## API Reference

### `new TinyFlag(options)`

| Option         | Type                     | Default      | Description                          |
| -------------- | ------------------------ | ------------ | ------------------------------------ |
| `source`       | `string \| FlagConfig`   | **required** | File path, URL, or inline config     |
| `headers`      | `Record<string, string>` | `undefined`  | HTTP headers for URL source          |
| `pollInterval` | `number`                 | `60000`      | URL polling interval (ms, min: 5000) |
| `watch`        | `boolean`                | `true`       | Watch file for changes               |
| `strict`       | `boolean`                | `false`      | Reject unknown fields in flag file   |

### `ff.init(): Promise<void>`

Load flags from source. Must be called before evaluation.

### `ff.isEnabled(flagName, context?): boolean`

Check if a flag is enabled. Never throws — returns `false` for unknown flags.

### `ff.getVariant(flagName, context?): string | null`

Get the assigned variant. Never throws — returns `null` if no variant applies.

### `ff.on(event, handler): void`

Register an event listener (`'exposure'`, `'change'`, `'error'`).

### `ff.off(event, handler): void`

Remove an event listener.

### `ff.reload(newSource?): Promise<void>`

Manually reload flags from source.

### `ff.getFlags(): Record<string, FlagDefinition>`

Get a snapshot of all current flag definitions.

### `ff.destroy(): void`

Clean up watchers, timers, and listeners.

## CLI

```bash
# Validate a flags file
npx tinyflag validate ./flags.yml

# Generate TypeScript types
npx tinyflag generate ./flags.yml
npx tinyflag generate ./flags.yml -o ./src/flags.d.ts

# Diff flag changes between git refs
npx tinyflag diff main..HEAD
npx tinyflag diff main..HEAD --file config/flags.yml
```

## Framework Integrations

### React

```bash
npm install tinyflag tinyflag-react
```

```tsx
import { TinyFlagProvider, useFlag, useVariant } from 'tinyflag-react';

function App() {
  return (
    <TinyFlagProvider source="./flags.yml" context={{ userId: '123' }}>
      <Dashboard />
    </TinyFlagProvider>
  );
}

function Dashboard() {
  const showCheckout = useFlag('new-checkout');
  const theme = useVariant('dark-mode');
  return showCheckout ? <NewCheckout /> : <OldCheckout />;
}
```

### Vue

```bash
npm install tinyflag tinyflag-vue
```

```vue
<script setup>
import { provideTinyFlag, useFlag, useVariant } from 'tinyflag-vue';

provideTinyFlag({ source: './flags.yml', context: { userId: '123' } });

const showCheckout = useFlag('new-checkout');
const theme = useVariant('dark-mode');
</script>
```

### Svelte

```bash
npm install tinyflag tinyflag-svelte
```

```svelte
<script>
import { createTinyFlag, flag, variant } from 'tinyflag-svelte';

createTinyFlag({ source: './flags.yml', context: { userId: '123' } });

const showCheckout = flag('new-checkout');
const theme = variant('dark-mode');
</script>

{#if $showCheckout}
  <NewCheckout />
{/if}
```

## Dashboard

Open `packages/dashboard/index.html` in a browser or deploy to GitHub Pages. Load flags from a URL, file upload, or paste YAML/JSON directly.

## GitHub Action

```yaml
# .github/workflows/flags.yml
name: Validate Flags
on: [pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./packages/github-action
        with:
          flags-file: flags.yml
```

## SSR (Server-Side Rendering)

All framework bindings support SSR via a pre-initialized TinyFlag instance.

### Next.js / Remix (React SSR)

```tsx
// app/layout.tsx (server component)
import { TinyFlag } from 'tinyflag';
import { TinyFlagProvider } from 'tinyflag-react';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

export default function Layout({ children }) {
  return (
    <TinyFlagProvider instance={ff} context={{ userId: getUser().id }}>
      {children}
    </TinyFlagProvider>
  );
}
```

### Nuxt (Vue SSR)

```ts
// plugins/tinyflag.ts
import { TinyFlag } from 'tinyflag';
import { provideTinyFlag } from 'tinyflag-vue';

export default defineNuxtPlugin(async () => {
  const ff = new TinyFlag({ source: './flags.yml' });
  await ff.init();
  provideTinyFlag({ instance: ff, context: { userId: getUser().id } });
});
```

### SvelteKit (Svelte SSR)

```ts
// src/hooks.server.ts
import { TinyFlag } from 'tinyflag';
import { createTinyFlag } from 'tinyflag-svelte';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();
createTinyFlag({ instance: ff, context: { userId: getUser().id } });
```

## Migrating from Other SDKs

### From LaunchDarkly

| LaunchDarkly                              | TinyFlag                                  |
| ----------------------------------------- | ----------------------------------------- |
| `LDClient.init(sdkKey)`                   | `new TinyFlag({ source: './flags.yml' })` |
| `client.variation('flag', user, default)` | `ff.isEnabled('flag', context)`           |
| `client.jsonVariation(...)`               | `ff.getVariant('flag', context)`          |
| Dashboard UI                              | `flags.yml` in your repo                  |
| Targeting rules (UI)                      | Rules in `flags.yml`                      |

### From Unleash

| Unleash                        | TinyFlag                                  |
| ------------------------------ | ----------------------------------------- |
| `initialize({ url, appName })` | `new TinyFlag({ source: './flags.yml' })` |
| `isEnabled('flag')`            | `ff.isEnabled('flag', context)`           |
| `getVariant('flag')`           | `ff.getVariant('flag', context)`          |
| Unleash server                 | No server needed                          |
| Strategies                     | Rules in `flags.yml`                      |

## Full API Reference

### Constructor Options

| Option         | Type                     | Default      | Description                                                             |
| -------------- | ------------------------ | ------------ | ----------------------------------------------------------------------- |
| `source`       | `string \| FlagConfig`   | **required** | File path (.yml/.yaml/.json), URL (http/https), or inline config object |
| `headers`      | `Record<string, string>` | `undefined`  | HTTP headers for URL source (e.g., `Authorization`)                     |
| `pollInterval` | `number`                 | `60000`      | URL polling interval in ms (minimum: 5000)                              |
| `watch`        | `boolean`                | `true`       | Watch file for changes (file source only)                               |
| `strict`       | `boolean`                | `false`      | Reject unknown fields in flag file                                      |
| `deduplicate`  | `boolean`                | `true`       | Deduplicate exposure events per (flag, userId) pair                     |

### Methods

| Method                   | Returns                          | Description                                               |
| ------------------------ | -------------------------------- | --------------------------------------------------------- |
| `init()`                 | `Promise<void>`                  | Load flags from source. Must be called before evaluation. |
| `isEnabled(name, ctx?)`  | `boolean`                        | Check if flag is enabled. Never throws.                   |
| `getVariant(name, ctx?)` | `string \| null`                 | Get assigned variant. Never throws.                       |
| `on(event, handler)`     | `void`                           | Register event listener.                                  |
| `off(event, handler)`    | `void`                           | Remove event listener.                                    |
| `reload(newSource?)`     | `Promise<void>`                  | Manually reload flags.                                    |
| `getFlags()`             | `Record<string, FlagDefinition>` | Snapshot of current flags.                                |
| `destroy()`              | `void`                           | Clean up watchers, timers, listeners.                     |

### Event Payloads

```typescript
// ff.on('exposure', (event) => ...)
interface ExposureEvent {
  flag: string; // Flag name
  variant: string | null; // Assigned variant (null if no variants)
  enabled: boolean; // Whether flag is enabled
  userId: string; // User ID from context
  timestamp: number; // Unix timestamp (ms)
}

// ff.on('change', (event) => ...)
interface ChangeEvent {
  flag: string; // Flag name
  previous: FlagDefinition | undefined; // Previous definition (undefined if added)
  current: FlagDefinition | undefined; // Current definition (undefined if removed)
  timestamp: number; // Unix timestamp (ms)
}

// ff.on('error', (event) => ...)
interface ErrorEvent {
  code: string; // Error code (FLAG_NOT_FOUND, LOAD_ERROR, etc.)
  message: string; // Human-readable message
  flagName?: string; // Related flag name (if applicable)
}
```

### Error Codes

| Code                    | When                                                   |
| ----------------------- | ------------------------------------------------------ |
| `FLAG_NOT_FOUND`        | `isEnabled`/`getVariant` called with unknown flag name |
| `INVALID_FLAG_NAME`     | Empty or whitespace-only flag name                     |
| `LOAD_ERROR`            | Flag file/URL failed to load (after initial load)      |
| `UNKNOWN_FIELD`         | Unknown field in flag file (lenient mode)              |
| `INSECURE_SOURCE`       | URL source uses HTTP instead of HTTPS                  |
| `POLL_INTERVAL_CLAMPED` | pollInterval was below 5000ms minimum                  |
| `LISTENER_ERROR`        | An event listener threw an exception                   |

## Flag File Schema

See [`flags.schema.json`](./flags.schema.json) for IDE autocompletion. Add to your `flags.yml`:

```yaml
# yaml-language-server: $schema=./node_modules/tinyflag/flags.schema.json
version: 1
flags: ...
```

## Runtime Support

| Runtime            | Support              |
| ------------------ | -------------------- |
| Node.js 18+        | ✅ File, URL, inline |
| Bun                | ✅ File, URL, inline |
| Deno               | ✅ File, URL, inline |
| Cloudflare Workers | ✅ URL, inline       |
| Browsers (ES2020+) | ✅ URL, inline       |

## Design Principles

1. **Your flag file IS the system** — no server, no dashboard, no database
2. **Zero dependencies** — just your code and your flags
3. **Deterministic** — same (flag, userId) → same result. Always.
4. **Never crashes your app** — evaluation never throws, errors are events
5. **Git-native** — review flag changes in PRs like any other code

## License

[MIT](./LICENSE)
