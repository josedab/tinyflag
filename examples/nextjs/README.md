# TinyFlag + Next.js Example

This example demonstrates how to use TinyFlag with Next.js App Router for server-side rendered feature flags.

## Prerequisites

> If running from the monorepo, run `pnpm install && pnpm -r build` from the repo root first.

## Setup

```bash
npx create-next-app@latest my-app
cd my-app
npm install tinyflag tinyflag-react
```

## Run

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. **Server-side**: Flags are loaded from `flags.yml` in the server component (`layout.tsx`)
2. **SSR**: The flag config is passed to the client `<TinyFlagProvider>` as an inline object
3. **Client-side**: Components use `useFlag()` and `useVariant()` hooks — they hydrate correctly

## Key Pattern: SSR with Inline Source

```tsx
// Server component (layout.tsx)
import { readFileSync } from 'fs';
import { parseYaml, parseFlagConfig } from 'tinyflag';

const yaml = readFileSync('./flags.yml', 'utf-8');
const { config } = parseFlagConfig(parseYaml(yaml));

// Pass config to client provider
<TinyFlagProvider source={config} context={{ userId }}>
```

This ensures:

- No YAML parsing on the client (smaller bundle)
- Flags are available immediately on first render (no flash)
- Hydration is consistent between server and client

## Expected Behavior

Once running, the app renders flag-controlled UI immediately on page load:

- **`useFlag('new-checkout')` → `true`/`false`** — toggles between the new and old checkout component
- **`useVariant('dark-mode')` → `"control"` or `"dark"`** — selects the active variant

Server-rendered HTML includes the correct flag state, so there is no flash of incorrect content on hydration.
