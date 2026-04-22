# Vue Integration

TinyFlag provides Vue 3 composables for reactive feature flags with Nuxt SSR support.

## Installation

```bash
npm install tinyflag tinyflag-vue
```

## Basic Usage

```vue
<script setup>
import { provideTinyFlag, useFlag, useVariant } from 'tinyflag-vue';

provideTinyFlag({ source: './flags.yml', context: { userId: '123' } });

const showCheckout = useFlag('new-checkout');
const variant = useVariant('new-checkout');
</script>

<template>
  <NewCheckout v-if="showCheckout && variant === 'new-flow'" />
  <OldCheckout v-else />
</template>
```

## API

### `provideTinyFlag(options): TinyFlag`

Call in a parent component's `setup()`. Makes TinyFlag available to all children via Vue's provide/inject.

### `useFlag(flagName: string): Ref<boolean>`

Returns a reactive `Ref<boolean>` that updates when the flag changes.

### `useVariant(flagName: string): Ref<string | null>`

Returns a reactive `Ref<string | null>` that updates when the variant changes.

### `useTinyFlagInstance(): TinyFlag`

Returns the TinyFlag instance for advanced use cases.

## Nuxt SSR

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

See the [Vue example](../examples/vue-app/) for more details.
