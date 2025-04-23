import type { TinyFlagAnalyticsAdapter } from '../index.js';
import type { ExposureEvent } from 'tinyflag';

/**
 * Segment Analytics adapter for TinyFlag.
 * Compatible with @segment/analytics-node v1.x and analytics-next v1.x.
 *
 * @example
 * ```ts
 * import Analytics from '@segment/analytics-node';
 * import { createSegmentAdapter, connectAnalytics } from 'tinyflag-analytics';
 *
 * const analytics = new Analytics({ writeKey: 'YOUR_KEY' });
 * const adapter = createSegmentAdapter(analytics);
 * connectAnalytics(ff, adapter);
 * ```
 */
export function createSegmentAdapter(analytics: {
  track: (params: { userId: string; event: string; properties: Record<string, unknown> }) => void;
}): TinyFlagAnalyticsAdapter {
  return {
    trackExposure(event: ExposureEvent): void {
      analytics.track({
        userId: event.userId,
        event: 'Feature Flag Evaluated',
        properties: {
          flag: event.flag,
          enabled: event.enabled,
          variant: event.variant,
          timestamp: event.timestamp,
        },
      });
    },
  };
}
