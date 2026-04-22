# React Integration

TinyFlag provides React hooks for feature flags with full SSR support.

## Installation

```bash
npm install tinyflag tinyflag-react
```

## Basic Usage

```tsx
import { TinyFlagProvider, useFlag, useVariant } from 'tinyflag-react';

function App() {
  return (
    <TinyFlagProvider source="./flags.yml" context={{ userId: '123', plan: 'pro' }}>
      <Dashboard />
    </TinyFlagProvider>
  );
}

function Dashboard() {
  const showCheckout = useFlag('new-checkout');
  const variant = useVariant('new-checkout');

  if (!showCheckout) return <OldCheckout />;
  return variant === 'new-flow' ? <NewCheckout /> : <OldCheckout />;
}
```

## API

### `<TinyFlagProvider>`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `source` | `string \| FlagConfig` | Yes | Flag source |
| `context` | `UserContext` | No | User context for evaluation |
| `headers` | `Record<string, string>` | No | HTTP headers for URL source |
| `pollInterval` | `number` | No | URL polling interval (ms) |
| `watch` | `boolean` | No | File watching |
| `strict` | `boolean` | No | Strict validation |
| `instance` | `TinyFlag` | No | Pre-initialized instance (SSR) |

### `useFlag(flagName: string): boolean`

Returns whether a flag is enabled. Re-renders on flag changes.

### `useVariant(flagName: string): string | null`

Returns the assigned variant. Re-renders on flag changes.

### `useTinyFlagInstance(): TinyFlag`

Returns the TinyFlag instance for advanced use cases.

## Next.js SSR

For server-side rendering, pre-initialize TinyFlag and pass the instance:

```tsx
// app/layout.tsx (server component)
import { readFileSync } from 'fs';
import { parseYaml, parseFlagConfig } from 'tinyflag';

const yaml = readFileSync('./flags.yml', 'utf-8');
const { config } = parseFlagConfig(parseYaml(yaml));

export default function Layout({ children }) {
  return (
    <TinyFlagProvider source={config} context={{ userId: getUser().id }}>
      {children}
    </TinyFlagProvider>
  );
}
```

See the [Next.js example](../examples/nextjs/) for a complete setup.
