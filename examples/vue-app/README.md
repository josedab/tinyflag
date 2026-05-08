# TinyFlag + Vue 3 / Nuxt Example

This example demonstrates how to use TinyFlag with Vue 3 composables and Nuxt SSR.

## Prerequisites

> If running from the monorepo, run `pnpm install && pnpm -r build` from the repo root first.

## Setup

```bash
npx nuxi@latest init my-app
cd my-app
npm install tinyflag tinyflag-vue
```

## Run

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Component

```vue
<script setup>
import { useFlag, useVariant } from 'tinyflag-vue';

const showFeature = useFlag('new-feature');
const theme = useVariant('theme-test');
</script>

<template>
  <div v-if="showFeature">New feature is live!</div>
</template>
```

### Nuxt Plugin (SSR)

```ts
// plugins/tinyflag.ts
import { TinyFlag, parseYaml, parseFlagConfig } from 'tinyflag';
import { provideTinyFlag } from 'tinyflag-vue';

export default defineNuxtPlugin(async () => {
  const ff = new TinyFlag({ source: './flags.yml' });
  await ff.init();
  provideTinyFlag({ instance: ff, context: { userId: getUser().id } });
});
```

## Expected Behavior

Once running, the app renders flag-controlled UI reactively:

- **`useFlag('new-feature')` → `true`/`false`** — conditionally renders the new feature section
- **`useVariant('theme-test')` → `"control"` or `"dark"`** — selects the active theme variant

In SSR mode (Nuxt), the flag state is resolved on the server and hydrated to the client without flicker.
