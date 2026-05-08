# tinyflag-vue

Vue composables for [TinyFlag](https://www.npmjs.com/package/tinyflag) feature flags.

[![npm version](https://img.shields.io/npm/v/tinyflag-vue)](https://www.npmjs.com/package/tinyflag-vue)
[![license](https://img.shields.io/npm/l/tinyflag-vue)](https://github.com/josedab/tinyflag/blob/main/LICENSE)

## Compatibility

- **Vue** 3.2+ (Composition API required)
- **Nuxt** 3.x+

## Install

```bash
npm install tinyflag tinyflag-vue
```

> **Note:** `tinyflag` is a required peer dependency and must be installed alongside `tinyflag-vue`.

## Usage

```vue
<script setup>
import { provideTinyFlag, useFlag, useVariant } from 'tinyflag-vue';

provideTinyFlag({ source: './flags.yml', context: { userId: '123' } });

const showCheckout = useFlag('new-checkout');
const theme = useVariant('dark-mode');
</script>
```

## SSR (Nuxt)

```ts
import { TinyFlag } from 'tinyflag';
import { provideTinyFlag } from 'tinyflag-vue';

export default defineNuxtPlugin(async () => {
  const ff = new TinyFlag({ source: './flags.yml' });
  await ff.init();
  provideTinyFlag({ instance: ff, context: { userId: getUser().id } });
});
```

## Documentation

- [Vue Integration Guide](https://github.com/josedab/tinyflag/blob/main/docs/integrations/vue.md) — Full setup, SSR, and advanced usage
- [API Reference](https://github.com/josedab/tinyflag/blob/main/docs/api-reference.md) — Core SDK API
- [Flag Format](https://github.com/josedab/tinyflag/blob/main/docs/flag-format.md) — YAML/JSON configuration reference
- [Troubleshooting](https://github.com/josedab/tinyflag/blob/main/docs/troubleshooting.md) — Common issues and solutions

## License

[MIT](https://github.com/josedab/tinyflag/blob/main/LICENSE)
