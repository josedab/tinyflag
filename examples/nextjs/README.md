# TinyFlag + Next.js Example

This example demonstrates how to use TinyFlag with Next.js App Router for server-side rendered feature flags.

## Setup

```bash
npx create-next-app@latest my-app
cd my-app
npm install tinyflag tinyflag-react
```

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
