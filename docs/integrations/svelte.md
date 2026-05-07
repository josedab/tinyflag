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
