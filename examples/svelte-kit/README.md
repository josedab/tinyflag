# TinyFlag + SvelteKit Example

This example demonstrates how to use TinyFlag with SvelteKit for SSR feature flags.

## Prerequisites

> If running from the monorepo, run `pnpm install && pnpm -r build` from the repo root first.

## Setup

```bash
npx sv create my-app
cd my-app
npm install tinyflag tinyflag-svelte
```

## Run

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

### Component

```svelte
<script>
  import { flag, variant } from 'tinyflag-svelte';

  const showFeature = flag('new-feature');
  const theme = variant('theme-test');
</script>

{#if $showFeature}
  <p>New feature is live! Variant: {$theme}</p>
{/if}
```

### SvelteKit Server Hook (SSR)

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

## Expected Behavior

Once running, the app renders flag-controlled UI via reactive stores:

- **`$showFeature` → `true`/`false`** — conditionally renders the feature section
- **`$theme` → `"control"` or `"dark"`** — selects the active theme variant

In SSR mode, flags are evaluated on the server in the hook and hydrated to the client without flicker.
