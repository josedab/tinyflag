import type { TinyFlagAnalyticsAdapter } from '../index.js';
import type { ExposureEvent } from 'tinyflag';

/**
 * Amplitude adapter for TinyFlag.
 * Compatible with @amplitude/analytics-node v1.x and @amplitude/analytics-browser v2.x.
 *
 * @example
 * ```ts
 * import * as amplitude from '@amplitude/analytics-node';
 * import { createAmplitudeAdapter, connectAnalytics } from 'tinyflag-analytics';
 *
 * amplitude.init('YOUR_API_KEY');
 * const adapter = createAmplitudeAdapter(amplitude);
 * connectAnalytics(ff, adapter);
 * ```
 */
export function createAmplitudeAdapter(amplitude: {
  track: (
    event: string,
    properties: Record<string, unknown>,
    options?: { user_id?: string },
  ) => void;
}): TinyFlagAnalyticsAdapter {
  return {
    trackExposure(event: ExposureEvent): void {
      amplitude.track(
        'Feature Flag Evaluated',
        {
          flag: event.flag,
          enabled: event.enabled,
          variant: event.variant,
          timestamp: event.timestamp,
        },
        { user_id: event.userId },
      );
    },
  };
}
