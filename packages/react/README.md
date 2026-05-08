# tinyflag-react

React hooks for [TinyFlag](https://www.npmjs.com/package/tinyflag) feature flags.

[![npm version](https://img.shields.io/npm/v/tinyflag-react)](https://www.npmjs.com/package/tinyflag-react)
[![license](https://img.shields.io/npm/l/tinyflag-react)](https://github.com/josedab/tinyflag/blob/main/LICENSE)

## Compatibility

- **React** 18+ (hooks API required)
- **Next.js** 13+ (App Router supported)
- **Remix** 1.x+

## Install

```bash
npm install tinyflag tinyflag-react
```

> **Note:** `tinyflag` is a required peer dependency and must be installed alongside `tinyflag-react`.

## Usage

```tsx
import { TinyFlagProvider, useFlag, useVariant } from 'tinyflag-react';

function App() {
  return (
    <TinyFlagProvider source="./flags.yml" context={{ userId: '123' }}>
      <Dashboard />
    </TinyFlagProvider>
  );
}

function Dashboard() {
  const showCheckout = useFlag('new-checkout');
  const theme = useVariant('dark-mode');
  return showCheckout ? <NewCheckout /> : <OldCheckout />;
}
```

## SSR (Next.js / Remix)

```tsx
import { TinyFlag } from 'tinyflag';
import { TinyFlagProvider } from 'tinyflag-react';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

export default function Layout({ children }) {
  return (
    <TinyFlagProvider instance={ff} context={{ userId: getUser().id }}>
      {children}
    </TinyFlagProvider>
  );
}
```

## Documentation

- [React Integration Guide](https://github.com/josedab/tinyflag/blob/main/docs/integrations/react.md) — Full setup, SSR, and advanced usage
- [API Reference](https://github.com/josedab/tinyflag/blob/main/docs/api-reference.md) — Core SDK API
- [Flag Format](https://github.com/josedab/tinyflag/blob/main/docs/flag-format.md) — YAML/JSON configuration reference
- [Troubleshooting](https://github.com/josedab/tinyflag/blob/main/docs/troubleshooting.md) — Common issues and solutions

## License

[MIT](https://github.com/josedab/tinyflag/blob/main/LICENSE)
