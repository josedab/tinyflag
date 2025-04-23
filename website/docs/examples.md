---
sidebar_position: 2
title: Examples
description: Runnable examples for common TinyFlag use cases.
---

# Examples

Practical, copy-paste examples for the most common feature flag scenarios.

## Basic Boolean Flag

```yaml title="flags.yml"
version: 1
flags:
  new-checkout:
    enabled: true
```

```typescript title="app.ts"
import { TinyFlag } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

if (ff.isEnabled('new-checkout')) {
  renderNewCheckout();
} else {
  renderOldCheckout();
}

ff.destroy();
```

## Percentage Rollout

Roll out a feature to 25% of users with deterministic bucketing:

```yaml title="flags.yml"
version: 1
flags:
  new-search:
    enabled: true
    rollout: 25
```

```typescript
// Same userId always gets the same result
ff.isEnabled('new-search', { userId: 'user-123' }); // true or false, consistently
ff.isEnabled('new-search', { userId: 'user-123' }); // same result every time
```

## A/B Test with Variants

Run an experiment with weighted variant assignment:

```yaml title="flags.yml"
version: 1
flags:
  checkout-experiment:
    enabled: true
    variants:
      - name: control
        weight: 50
      - name: new-flow
        weight: 50
```

```typescript
const variant = ff.getVariant('checkout-experiment', { userId: user.id });

switch (variant) {
  case 'control':
    renderOriginalCheckout();
    break;
  case 'new-flow':
    renderNewCheckout();
    break;
}

// Track exposures for analysis
ff.on('exposure', (event) => {
  analytics.track('experiment_exposure', {
    flag: event.flag,
    variant: event.variant,
    userId: event.userId,
  });
});
```

## Targeting Rules

Enable a feature for specific user segments:

```yaml title="flags.yml"
version: 1
flags:
  premium-analytics:
    enabled: false
    rules:
      - conditions:
          plan: enterprise
        enabled: true
      - conditions:
          plan: pro
          country: { $in: [US, CA] }
        rollout: 50
      - conditions:
          email: "*@company.com"
        enabled: true
```

```typescript
// Enterprise users → always enabled
ff.isEnabled('premium-analytics', { userId: 'u1', plan: 'enterprise' }); // true

// Pro users in US/CA → 50% rollout
ff.isEnabled('premium-analytics', { userId: 'u2', plan: 'pro', country: 'US' });

// Internal users → always enabled (glob match)
ff.isEnabled('premium-analytics', { userId: 'u3', email: 'alice@company.com' }); // true

// Everyone else → disabled
ff.isEnabled('premium-analytics', { userId: 'u4', plan: 'free' }); // false
```

## Server-Side Rendering (Next.js)

Pre-evaluate flags on the server and hydrate the client:

```tsx title="app/layout.tsx"
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

```tsx title="app/page.tsx"
'use client';
import { useFlag, useVariant } from 'tinyflag-react';

export default function Page() {
  const showBanner = useFlag('promo-banner');
  const theme = useVariant('theme-experiment');

  return (
    <div data-theme={theme}>
      {showBanner && <PromoBanner />}
      <MainContent />
    </div>
  );
}
```

## Express Middleware

Evaluate flags per-request with user context:

```typescript title="server.ts"
import express from 'express';
import { TinyFlag } from 'tinyflag';
import { tinyflagExpress } from 'tinyflag-middleware/express';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

const app = express();

app.use(tinyflagExpress({
  instance: ff,
  contextFromRequest: (req) => ({
    userId: req.user?.id,
    plan: req.user?.plan,
    country: req.headers['cf-ipcountry'],
  }),
}));

app.get('/api/dashboard', (req, res) => {
  if (req.flags.isEnabled('new-dashboard')) {
    res.json(getNewDashboardData());
  } else {
    res.json(getLegacyDashboardData());
  }
});
```

## Testing with Mocks

Use the testing utilities for unit tests:

```typescript title="checkout.test.ts"
import { createMockTinyFlag } from 'tinyflag/testing';
import { renderCheckout } from './checkout';

describe('Checkout', () => {
  it('shows new checkout when flag is enabled', async () => {
    const ff = await createMockTinyFlag({
      flags: {
        'new-checkout': true,
        'checkout-experiment': {
          enabled: true,
          variants: [
            { name: 'control', weight: 0 },
            { name: 'new-flow', weight: 100 },
          ],
        },
      },
    });

    const result = renderCheckout(ff);
    expect(result).toContain('new-checkout');
    ff.destroy();
  });

  it('uses overrides for deterministic testing', async () => {
    const ff = await createMockTinyFlag({ flags: { 'feature-x': false } });
    ff.override('feature-x', true);
    expect(ff.isEnabled('feature-x')).toBe(true);
    ff.clearOverrides();
    ff.destroy();
  });
});
```

## Environment Variable Overrides

Override flags without code changes:

```bash
# Enable a flag
TINYFLAG_new_checkout=true node app.js

# Set a specific variant
TINYFLAG_checkout_experiment=new-flow node app.js

# Disable a flag
TINYFLAG_new_checkout=false node app.js
```

## CI/CD Validation

Validate flag files in your pipeline:

```yaml title=".github/workflows/flags.yml"
name: Validate Flags
on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: josedab/tinyflag@v1
        with:
          flags-file: flags.yml
```

The action validates the schema and posts a PR comment summarizing changes:

```
## 🚩 Flag changes detected
- **+** `payment-v2` added (enabled: true, rollout: 10%)
- **~** `new-checkout`: rollout: 10% → 50%
- **-** `legacy-nav` removed
```
