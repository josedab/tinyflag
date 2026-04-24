# tinyflag-svelte

Svelte stores for [TinyFlag](https://www.npmjs.com/package/tinyflag) feature flags.

[![npm version](https://img.shields.io/npm/v/tinyflag-svelte)](https://www.npmjs.com/package/tinyflag-svelte)
[![license](https://img.shields.io/npm/l/tinyflag-svelte)](https://github.com/josedab/tinyflag/blob/main/LICENSE)

## Install

```bash
npm install tinyflag tinyflag-svelte
```

## Usage

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

## SSR (SvelteKit)

```ts
import { TinyFlag } from 'tinyflag';
import { createTinyFlag } from 'tinyflag-svelte';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();
createTinyFlag({ instance: ff, context: { userId: getUser().id } });
```

## Documentation

Full documentation is available in the [main repository](https://github.com/josedab/tinyflag).

## License

[MIT](https://github.com/josedab/tinyflag/blob/main/LICENSE)
