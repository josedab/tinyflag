# tinyflag-svelte

Svelte stores for [TinyFlag](https://www.npmjs.com/package/tinyflag) feature flags.

[![npm version](https://img.shields.io/npm/v/tinyflag-svelte)](https://www.npmjs.com/package/tinyflag-svelte)
[![license](https://img.shields.io/npm/l/tinyflag-svelte)](https://github.com/josedab/tinyflag/blob/main/LICENSE)

## Compatibility

- **Svelte** 4+ or 5+
- **SvelteKit** 1.x+ / 2.x+

## Install

```bash
npm install tinyflag tinyflag-svelte
```

> **Note:** `tinyflag` is a required peer dependency and must be installed alongside `tinyflag-svelte`.

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

- [Svelte Integration Guide](https://github.com/josedab/tinyflag/blob/main/docs/integrations/svelte.md) — Full setup, SSR, and advanced usage
- [API Reference](https://github.com/josedab/tinyflag/blob/main/docs/api-reference.md) — Core SDK API
- [Flag Format](https://github.com/josedab/tinyflag/blob/main/docs/flag-format.md) — YAML/JSON configuration reference
- [Troubleshooting](https://github.com/josedab/tinyflag/blob/main/docs/troubleshooting.md) — Common issues and solutions

## License

[MIT](https://github.com/josedab/tinyflag/blob/main/LICENSE)
