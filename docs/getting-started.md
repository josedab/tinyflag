# Getting Started

Get your first feature flag running in under 60 seconds.

## Prerequisites

- [Node.js](https://nodejs.org/) **≥ 18** (see `engines` in `package.json`)

## Installation

```bash
npm install tinyflag
# or
pnpm add tinyflag
# or
yarn add tinyflag
```

## Create Your Flag File

Create `flags.yml` in your project root:

```yaml
version: 1
flags:
  new-checkout:
    enabled: true
    description: New checkout flow
    rollout: 50
  dark-mode:
    enabled: false
    description: Dark mode toggle
```

## Use It

```typescript
import { TinyFlag } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

// Check if a flag is enabled
if (ff.isEnabled('new-checkout', { userId: user.id })) {
  showNewCheckout();
}

// Clean up when done
ff.destroy();
```

## Source Options

TinyFlag supports three source types:

### File Source (Node.js, Bun, Deno)

```typescript
const ff = new TinyFlag({ source: './flags.yml' });
```

### URL Source (All Runtimes)

```typescript
const ff = new TinyFlag({
  source: 'https://cdn.example.com/flags.json',
  headers: { Authorization: 'Bearer <token>' },
  pollInterval: 30_000, // Re-fetch every 30s
});
```

### Inline Source (Testing, Edge Workers)

```typescript
const ff = new TinyFlag({
  source: {
    version: 1,
    flags: {
      'my-flag': { enabled: true, rollout: 50 },
    },
  },
});
```

## What's Next?

- [Flag File Format](./flag-format.md) — Full schema reference
- [Targeting Rules](./targeting-rules.md) — Target specific users
- [Framework Integrations](./integrations/react.md) — React, Vue, Svelte
