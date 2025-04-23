import type { ExposureEvent, TinyFlag } from 'tinyflag';

/** Analytics adapter interface for tracking flag exposures. */
export interface TinyFlagAnalyticsAdapter {
  /** Track a flag exposure event. */
  trackExposure(event: ExposureEvent): void;
}

/** Connect a TinyFlag instance to an analytics adapter. */
export function connectAnalytics(instance: TinyFlag, adapter: TinyFlagAnalyticsAdapter): void {
  instance.on('exposure', (event) => {
    try {
      adapter.trackExposure(event);
    } catch (error) {
      // Log adapter errors in debug mode instead of silently swallowing them
      if (typeof console !== 'undefined' && console.debug) {
        console.debug(
          '[tinyflag-analytics] Adapter error:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  });
}

export { createSegmentAdapter } from './adapters/segment.js';
export { createPostHogAdapter } from './adapters/posthog.js';
export { createMixpanelAdapter } from './adapters/mixpanel.js';
export { createAmplitudeAdapter } from './adapters/amplitude.js';
export type { ExposureEvent } from 'tinyflag';
