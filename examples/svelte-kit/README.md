# TinyFlag + SvelteKit Example

This example demonstrates how to use TinyFlag with SvelteKit for SSR feature flags.

## Setup

```bash
npx sv create my-app
cd my-app
npm install tinyflag tinyflag-svelte
```

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
    context: { userId: event.cookies.get('userId') || 'anonymous' }
  });
  return resolve(event);
}
```
