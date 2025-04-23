import type { TinyFlagAnalyticsAdapter } from '../index.js';
import type { ExposureEvent } from 'tinyflag';

/**
 * Mixpanel adapter for TinyFlag.
 * Compatible with mixpanel-browser v2.x and mixpanel (Node) v0.x.
 *
 * @example
 * ```ts
 * import mixpanel from 'mixpanel-browser';
 * import { createMixpanelAdapter, connectAnalytics } from 'tinyflag-analytics';
 *
 * mixpanel.init('YOUR_TOKEN');
 * const adapter = createMixpanelAdapter(mixpanel);
 * connectAnalytics(ff, adapter);
 * ```
 */
export function createMixpanelAdapter(mixpanel: {
  track: (event: string, properties: Record<string, unknown>) => void;
}): TinyFlagAnalyticsAdapter {
  return {
    trackExposure(event: ExposureEvent): void {
      mixpanel.track('Feature Flag Evaluated', {
        distinct_id: event.userId,
        flag: event.flag,
        enabled: event.enabled,
        variant: event.variant,
        timestamp: event.timestamp,
      });
    },
  };
}
