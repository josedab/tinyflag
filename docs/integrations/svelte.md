# Svelte Integration

TinyFlag provides Svelte stores for reactive feature flags with SvelteKit SSR support.

## Installation

```bash
npm install tinyflag tinyflag-svelte
```

## Basic Usage

```svelte
<script>
import { createTinyFlag, flag, variant } from 'tinyflag-svelte';

createTinyFlag({ source: './flags.yml', context: { userId: '123' } });

const showCheckout = flag('new-checkout');
const checkoutVariant = variant('new-checkout');
</script>

{#if $showCheckout}
  {#if $checkoutVariant === 'new-flow'}
    <NewCheckout />
  {:else}
    <OldCheckout />
  {/if}
{:else}
  <OldCheckout />
{/if}
```

## API

### `createTinyFlag(options): { instance, destroy }`

Initialize TinyFlag. Call once at the root of your app.

| Option         | Type                     | Required | Default | Description                              |
| -------------- | ------------------------ | -------- | ------- | ---------------------------------------- |
| `source`       | `string \| FlagConfig`   | Yes      | —       | Flag source (file path, URL, or inline)  |
| `context`      | `UserContext`            | No       | —       | User context for evaluation              |
| `headers`      | `Record<string, string>` | No       | —       | HTTP headers for URL source              |
| `pollInterval` | `number`                 | No       | `60000` | URL polling interval (ms). Min: 5000     |
| `watch`        | `boolean`                | No       | `true`  | File watching (file source only)         |
| `strict`       | `boolean`                | No       | `false` | Strict validation                        |
| `deduplicate`  | `boolean`                | No       | `true`  | Deduplicate exposure events              |
| `fetchTimeout` | `number`                 | No       | `5000`  | URL fetch timeout (ms)                   |
| `debug`        | `boolean`                | No       | `false` | Enable debug logging                     |
| `instance`     | `TinyFlag`               | No       | —       | Pre-initialized instance (SSR/SvelteKit) |

### `flag(flagName: string): Readable<boolean>`

Returns a Svelte `Readable` store. Use with `$` syntax.

### `variant(flagName: string): Readable<string | null>`

Returns a Svelte `Readable` store for the variant.

### `setContext(context: UserContext): void`

Update the user context. Triggers re-evaluation of all stores.

### `useTinyFlagInstance(): TinyFlag`

Returns the TinyFlag instance for advanced use cases (e.g., subscribing to events, calling `override()`, or `getAllFlags()`).

## SvelteKit SSR

```ts
// src/hooks.server.ts
import { TinyFlag } from 'tinyflag';
import { createTinyFlag } from 'tinyflag-svelte';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

export async function handle({ event, resolve }) {
  createTinyFlag({
    instance: ff,
    context: { userId: event.cookies.get('userId') || 'anonymous' },
  });
  return resolve(event);
}
```

See the [SvelteKit example](../examples/svelte-kit/) for more details.

## Error Handling

> **Note:** When `createTinyFlag()` creates its own TinyFlag instance (i.e., no `instance` option), `init()` errors are silently caught. This prevents unhandled promise rejections but means initialization failures will go unnoticed — all flags will return `false` and all variants will return `null`.

For proper error handling, pre-initialize the instance with `try/catch` and pass it via the `instance` option:

```ts
const ff = new TinyFlag({ source: './flags.yml' });
try {
  await ff.init();
} catch (err) {
  console.error('Failed to load flags:', err);
}

const { destroy } = createTinyFlag({ instance: ff, context: { userId: '123' } });
```
