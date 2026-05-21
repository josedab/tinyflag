# tinyflag-analytics

Analytics adapters for TinyFlag feature flag exposure tracking.

## Installation

```bash
npm install tinyflag-analytics
```

## Quick Start

```ts
import { TinyFlag } from 'tinyflag';
import { connectAnalytics, createSegmentAdapter } from 'tinyflag-analytics';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

// Connect your analytics provider
const adapter = createSegmentAdapter(analyticsInstance);
connectAnalytics(ff, adapter);
```

## Supported Providers

### Segment (`@segment/analytics-node` v1.x)

```ts
import Analytics from '@segment/analytics-node';
import { createSegmentAdapter, connectAnalytics } from 'tinyflag-analytics';

const analytics = new Analytics({ writeKey: 'YOUR_KEY' });
connectAnalytics(ff, createSegmentAdapter(analytics));
```

### PostHog (`posthog-node` v3.x)

```ts
import { PostHog } from 'posthog-node';
import { createPostHogAdapter, connectAnalytics } from 'tinyflag-analytics';

const posthog = new PostHog('YOUR_API_KEY');
connectAnalytics(ff, createPostHogAdapter(posthog));
```

### Mixpanel (`mixpanel-browser` v2.x)

```ts
import mixpanel from 'mixpanel-browser';
import { createMixpanelAdapter, connectAnalytics } from 'tinyflag-analytics';

mixpanel.init('YOUR_TOKEN');
connectAnalytics(ff, createMixpanelAdapter(mixpanel));
```

### Amplitude (`@amplitude/analytics-node` v1.x)

```ts
import * as amplitude from '@amplitude/analytics-node';
import { createAmplitudeAdapter, connectAnalytics } from 'tinyflag-analytics';

amplitude.init('YOUR_API_KEY');
connectAnalytics(ff, createAmplitudeAdapter(amplitude));
```

## Custom Adapter

```ts
import type { TinyFlagAnalyticsAdapter } from 'tinyflag-analytics';

const myAdapter: TinyFlagAnalyticsAdapter = {
  trackExposure(event) {
    console.log(`Flag ${event.flag} evaluated for ${event.userId}:`, event.enabled);
  },
};
connectAnalytics(ff, myAdapter);
```
