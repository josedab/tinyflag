import type { TinyFlagAnalyticsAdapter } from '../index.js';
import type { ExposureEvent } from 'tinyflag';

/**
 * PostHog adapter for TinyFlag.
 * Compatible with posthog-node v3.x and posthog-js v1.x.
 *
 * @example
 * ```ts
 * import { PostHog } from 'posthog-node';
 * import { createPostHogAdapter, connectAnalytics } from 'tinyflag-analytics';
 *
 * const posthog = new PostHog('YOUR_API_KEY');
 * const adapter = createPostHogAdapter(posthog);
 * connectAnalytics(ff, adapter);
 * ```
 */
export function createPostHogAdapter(posthog: {
  capture: (params: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
  }) => void;
}): TinyFlagAnalyticsAdapter {
  return {
    trackExposure(event: ExposureEvent): void {
      posthog.capture({
        distinctId: event.userId,
        event: '$feature_flag_called',
        properties: {
          $feature_flag: event.flag,
          $feature_flag_response: event.enabled,
          variant: event.variant,
          timestamp: event.timestamp,
        },
      });
    },
  };
}
