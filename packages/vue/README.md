# tinyflag-vue

Vue composables for [TinyFlag](https://www.npmjs.com/package/tinyflag) feature flags.

[![npm version](https://img.shields.io/npm/v/tinyflag-vue)](https://www.npmjs.com/package/tinyflag-vue)
[![license](https://img.shields.io/npm/l/tinyflag-vue)](https://github.com/josedab/tinyflag/blob/main/LICENSE)

## Install

```bash
npm install tinyflag tinyflag-vue
```

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

Full documentation is available in the [main repository](https://github.com/josedab/tinyflag).

## License

[MIT](https://github.com/josedab/tinyflag/blob/main/LICENSE)
