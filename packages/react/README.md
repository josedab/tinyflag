# tinyflag-react

React hooks for [TinyFlag](https://www.npmjs.com/package/tinyflag) feature flags.

[![npm version](https://img.shields.io/npm/v/tinyflag-react)](https://www.npmjs.com/package/tinyflag-react)
[![license](https://img.shields.io/npm/l/tinyflag-react)](https://github.com/josedab/tinyflag/blob/main/LICENSE)

## Install

```bash
npm install tinyflag tinyflag-react
```

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

Full documentation is available in the [main repository](https://github.com/josedab/tinyflag).

## License

[MIT](https://github.com/josedab/tinyflag/blob/main/LICENSE)
