import { describe, it, expect, vi } from 'vitest';
import {
  createSegmentAdapter,
  createPostHogAdapter,
  createMixpanelAdapter,
  createAmplitudeAdapter,
} from '../index.js';
import type { ExposureEvent } from 'tinyflag';

const mockEvent: ExposureEvent = {
  flag: 'test-flag',
  variant: 'control',
  enabled: true,
  userId: 'user-123',
  timestamp: Date.now(),
};

describe('Analytics Adapters', () => {
  it('Segment adapter calls track', () => {
    const track = vi.fn();
    const adapter = createSegmentAdapter({ track });
    adapter.trackExposure(mockEvent);
    expect(track).toHaveBeenCalledWith({
      userId: 'user-123',
      event: 'Feature Flag Evaluated',
      properties: expect.objectContaining({ flag: 'test-flag' }),
    });
  });

  it('PostHog adapter calls capture', () => {
    const capture = vi.fn();
    const adapter = createPostHogAdapter({ capture });
    adapter.trackExposure(mockEvent);
    expect(capture).toHaveBeenCalledWith({
      distinctId: 'user-123',
      event: '$feature_flag_called',
      properties: expect.objectContaining({ $feature_flag: 'test-flag' }),
    });
  });

  it('Mixpanel adapter calls track', () => {
    const track = vi.fn();
    const adapter = createMixpanelAdapter({ track });
    adapter.trackExposure(mockEvent);
    expect(track).toHaveBeenCalledWith(
      'Feature Flag Evaluated',
      expect.objectContaining({ flag: 'test-flag' }),
    );
  });

  it('Amplitude adapter calls track', () => {
    const track = vi.fn();
    const adapter = createAmplitudeAdapter({ track });
    adapter.trackExposure(mockEvent);
    expect(track).toHaveBeenCalledWith(
      'Feature Flag Evaluated',
      expect.objectContaining({ flag: 'test-flag' }),
      { user_id: 'user-123' },
    );
  });
});
