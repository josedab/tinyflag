---
sidebar_position: 1
title: Getting Started
description: Get your first feature flag running in under 60 seconds.
---

# Getting Started

Get your first feature flag running in under 60 seconds.

## Prerequisites

- [Node.js](https://nodejs.org/) **≥ 18**

## Installation

```bash
npm install tinyflag
```

Or use your preferred package manager:

```bash
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

That's it. No API keys, no servers, no config files.

## Source Options

TinyFlag supports three source types:

### File Source (Node.js, Bun, Deno)

```typescript
const ff = new TinyFlag({ source: './flags.yml' });
```

File sources support automatic hot reload via `fs.watch`. Changes to the flag file are picked up automatically.

### URL Source (All Runtimes)

```typescript
const ff = new TinyFlag({
  source: 'https://cdn.example.com/flags.json',
  headers: { Authorization: 'Bearer <token>' },
  pollInterval: 30_000, // Re-fetch every 30s
});
```

URL sources support polling with ETag and If-Modified-Since headers for efficient updates.

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

Inline sources are perfect for testing, edge workers, and bundled configurations.

## Framework Integrations

TinyFlag ships React, Vue, and Svelte bindings:

```bash
# React
npm install tinyflag tinyflag-react

# Vue
npm install tinyflag tinyflag-vue

# Svelte
npm install tinyflag tinyflag-svelte
```

See the [React](/docs/integrations/react), [Vue](/docs/integrations/vue), and [Svelte](/docs/integrations/svelte) integration guides for details.

## What's Next?

- [Flag File Format](/docs/concepts/flag-format) — Full schema reference
- [Targeting Rules](/docs/concepts/targeting-rules) — Target specific users and segments
- [Flag Evaluation](/docs/concepts/evaluation) — How flags are evaluated
- [API Reference](/docs/reference/api) — Complete SDK API documentation
