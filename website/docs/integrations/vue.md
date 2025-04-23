---
sidebar_position: 2
title: Vue
description: Vue 3 composables for TinyFlag with Nuxt SSR support.
---

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

| Option         | Type                     | Required | Default | Description                         |
| -------------- | ------------------------ | -------- | ------- | ----------------------------------- |
| `source`       | `string \| FlagConfig`   | Yes      | —       | Flag source (file path, URL, inline)|
| `context`      | `UserContext`            | No       | —       | User context for evaluation         |
| `headers`      | `Record<string, string>` | No       | —       | HTTP headers for URL source         |
| `pollInterval` | `number`                 | No       | `60000` | URL polling interval (ms). Min: 5000|
| `watch`        | `boolean`                | No       | `true`  | File watching (file source only)    |
| `strict`       | `boolean`                | No       | `false` | Strict validation                   |
| `deduplicate`  | `boolean`                | No       | `true`  | Deduplicate exposure events         |
| `fetchTimeout` | `number`                 | No       | `5000`  | URL fetch timeout (ms)              |
| `debug`        | `boolean`                | No       | `false` | Enable debug logging                |
| `instance`     | `TinyFlag`               | No       | —       | Pre-initialized instance (SSR/Nuxt) |

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

## Error Handling

When `provideTinyFlag()` creates its own instance (no `instance` option), `init()` errors are silently caught. For proper error handling, pre-initialize:

```ts
const ff = new TinyFlag({ source: './flags.yml' });
try {
  await ff.init();
} catch (err) {
  console.error('Failed to load flags:', err);
}

provideTinyFlag({ instance: ff, context: { userId: '123' } });
```
