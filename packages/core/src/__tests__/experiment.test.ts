import { describe, it, expect } from 'vitest';
import { ExperimentTracker, formatExperimentResults } from '../experiment.js';
import type { FlagDefinition, ExperimentResult, VariantResult } from '../types.js';

function makeFlagDef(overrides: Partial<FlagDefinition> = {}): FlagDefinition {
  return {
    enabled: true,
    variants: [
      { name: 'control', weight: 50 },
      { name: 'treatment', weight: 50 },
    ],
    experiment: {
      metric: 'conversion',
      minimumSampleSize: 10,
      confidenceLevel: 0.95,
      method: 'bayesian',
    },
    ...overrides,
  };
}

describe('ExperimentTracker', () => {
  it('records exposures', () => {
    const tracker = new ExperimentTracker();
    tracker.trackExposure('flag-1', 'control', 'user-1');
    tracker.trackExposure('flag-1', 'control', 'user-2');
    tracker.trackExposure('flag-1', 'treatment', 'user-3');

    const exposures = tracker.getExposures('flag-1');
    expect(exposures.get('control')).toBe(2);
    expect(exposures.get('treatment')).toBe(1);
  });

  it('deduplicates exposures by userId', () => {
    const tracker = new ExperimentTracker();
    tracker.trackExposure('flag-1', 'control', 'user-1');
    tracker.trackExposure('flag-1', 'control', 'user-1');

    const exposures = tracker.getExposures('flag-1');
    expect(exposures.get('control')).toBe(1);
  });

  it('ignores empty parameters', () => {
    const tracker = new ExperimentTracker();
    tracker.trackExposure('', 'control', 'user-1');
    tracker.trackExposure('flag-1', '', 'user-1');
    tracker.trackExposure('flag-1', 'control', '');

    const exposures = tracker.getExposures('flag-1');
    expect(exposures.size).toBe(0);
  });

  it('records conversions', () => {
    const tracker = new ExperimentTracker();
    tracker.trackConversion('flag-1', 'control', 'user-1');
    tracker.trackConversion('flag-1', 'treatment', 'user-2');

    const conversions = tracker.getConversions('flag-1');
    expect(conversions.get('control')?.has('user-1')).toBe(true);
    expect(conversions.get('treatment')?.has('user-2')).toBe(true);
  });

  it('records conversions with values', () => {
    const tracker = new ExperimentTracker();
    tracker.trackConversion('flag-1', 'control', 'user-1', 10.5);
    tracker.trackConversion('flag-1', 'control', 'user-2', 20.0);
    // Values are tracked internally for mean computation
    expect(tracker.getConversions('flag-1').get('control')?.size).toBe(2);
  });

  it('ignores empty conversion parameters', () => {
    const tracker = new ExperimentTracker();
    tracker.trackConversion('', 'control', 'user-1');
    tracker.trackConversion('flag-1', '', 'user-1');
    tracker.trackConversion('flag-1', 'control', '');

    const conversions = tracker.getConversions('flag-1');
    expect(conversions.size).toBe(0);
  });

  it('resets data for a flag', () => {
    const tracker = new ExperimentTracker();
    tracker.trackExposure('flag-1', 'control', 'user-1');
    tracker.trackConversion('flag-1', 'control', 'user-1');
    tracker.reset('flag-1');

    expect(tracker.getExposures('flag-1').size).toBe(0);
    expect(tracker.getConversions('flag-1').size).toBe(0);
  });

  it('returns empty maps for unknown flags', () => {
    const tracker = new ExperimentTracker();
    expect(tracker.getExposures('unknown').size).toBe(0);
    expect(tracker.getConversions('unknown').size).toBe(0);
  });
});

describe('ExperimentTracker.analyze', () => {
  it('returns null when no experiment config', () => {
    const tracker = new ExperimentTracker();
    const flagDef: FlagDefinition = { enabled: true };
    expect(tracker.analyze('flag-1', flagDef)).toBeNull();
  });

  it('returns null when no variants defined', () => {
    const tracker = new ExperimentTracker();
    const flagDef = makeFlagDef({ variants: [] });
    expect(tracker.analyze('flag-1', flagDef)).toBeNull();
  });

  it('analyzes with zero data', () => {
    const tracker = new ExperimentTracker();
    const result = tracker.analyze('flag-1', makeFlagDef());
    expect(result).not.toBeNull();
    expect(result!.totalSamples).toBe(0);
    expect(result!.significant).toBe(false);
    expect(result!.winner).toBeNull();
  });

  it('analyzes bayesian experiment with sufficient data', () => {
    const tracker = new ExperimentTracker();
    const flagDef = makeFlagDef({ experiment: { metric: 'conv', minimumSampleSize: 10 } });

    // Generate enough data with a clear winner
    for (let i = 0; i < 200; i++) {
      tracker.trackExposure('flag-1', 'control', `user-c-${i}`);
      tracker.trackExposure('flag-1', 'treatment', `user-t-${i}`);
    }
    // treatment converts at ~30%, control at ~5%
    for (let i = 0; i < 10; i++) {
      tracker.trackConversion('flag-1', 'control', `user-c-${i}`);
    }
    for (let i = 0; i < 60; i++) {
      tracker.trackConversion('flag-1', 'treatment', `user-t-${i}`);
    }

    const result = tracker.analyze('flag-1', flagDef);
    expect(result).not.toBeNull();
    expect(result!.totalSamples).toBe(400);
    expect(result!.method).toBe('bayesian');
    expect(result!.variants).toHaveLength(2);
    // With such a large difference, treatment should be significant winner
    expect(result!.significant).toBe(true);
    expect(result!.winner).toBe('treatment');
  });

  it('analyzes frequentist experiment', () => {
    const tracker = new ExperimentTracker();
    const flagDef = makeFlagDef({
      experiment: { metric: 'conv', minimumSampleSize: 10, method: 'frequentist' },
    });

    for (let i = 0; i < 200; i++) {
      tracker.trackExposure('flag-1', 'control', `user-c-${i}`);
      tracker.trackExposure('flag-1', 'treatment', `user-t-${i}`);
    }
    for (let i = 0; i < 10; i++) {
      tracker.trackConversion('flag-1', 'control', `user-c-${i}`);
    }
    for (let i = 0; i < 60; i++) {
      tracker.trackConversion('flag-1', 'treatment', `user-t-${i}`);
    }

    const result = tracker.analyze('flag-1', flagDef);
    expect(result).not.toBeNull();
    expect(result!.method).toBe('frequentist');
    expect(result!.significant).toBe(true);
    expect(result!.winner).toBe('treatment');
  });

  it('does not declare winner with insufficient sample size', () => {
    const tracker = new ExperimentTracker();
    const flagDef = makeFlagDef({ experiment: { metric: 'conv', minimumSampleSize: 1000 } });

    for (let i = 0; i < 50; i++) {
      tracker.trackExposure('flag-1', 'control', `user-c-${i}`);
      tracker.trackExposure('flag-1', 'treatment', `user-t-${i}`);
    }

    const result = tracker.analyze('flag-1', flagDef);
    expect(result!.significant).toBe(false);
    expect(result!.winner).toBeNull();
  });

  it('handles zero conversions', () => {
    const tracker = new ExperimentTracker();
    const flagDef = makeFlagDef({ experiment: { metric: 'conv', minimumSampleSize: 5 } });

    for (let i = 0; i < 20; i++) {
      tracker.trackExposure('flag-1', 'control', `user-c-${i}`);
      tracker.trackExposure('flag-1', 'treatment', `user-t-${i}`);
    }

    const result = tracker.analyze('flag-1', flagDef);
    expect(result).not.toBeNull();
    expect(result!.variants[0].conversionRate).toBe(0);
    expect(result!.variants[1].conversionRate).toBe(0);
  });

  it('handles equal performance', () => {
    const tracker = new ExperimentTracker();
    const flagDef = makeFlagDef({ experiment: { metric: 'conv', minimumSampleSize: 10 } });

    for (let i = 0; i < 100; i++) {
      tracker.trackExposure('flag-1', 'control', `user-c-${i}`);
      tracker.trackExposure('flag-1', 'treatment', `user-t-${i}`);
    }
    for (let i = 0; i < 20; i++) {
      tracker.trackConversion('flag-1', 'control', `user-c-${i}`);
      tracker.trackConversion('flag-1', 'treatment', `user-t-${i}`);
    }

    const result = tracker.analyze('flag-1', flagDef);
    expect(result).not.toBeNull();
    // Equal rates = should not be significant
    expect(result!.significant).toBe(false);
  });

  it('computes confidence intervals', () => {
    const tracker = new ExperimentTracker();
    const flagDef = makeFlagDef({ experiment: { metric: 'conv', minimumSampleSize: 5 } });

    for (let i = 0; i < 100; i++) {
      tracker.trackExposure('flag-1', 'control', `user-c-${i}`);
    }
    for (let i = 0; i < 50; i++) {
      tracker.trackConversion('flag-1', 'control', `user-c-${i}`);
    }

    const result = tracker.analyze('flag-1', flagDef);
    const control = result!.variants.find((v) => v.name === 'control')!;
    expect(control.confidenceInterval[0]).toBeGreaterThan(0);
    expect(control.confidenceInterval[1]).toBeLessThanOrEqual(1);
    expect(control.confidenceInterval[0]).toBeLessThan(control.confidenceInterval[1]);
  });

  it('computes meanValue when values are provided', () => {
    const tracker = new ExperimentTracker();
    const flagDef = makeFlagDef({ experiment: { metric: 'revenue', minimumSampleSize: 5 } });

    for (let i = 0; i < 10; i++) {
      tracker.trackExposure('flag-1', 'control', `user-c-${i}`);
    }
    tracker.trackConversion('flag-1', 'control', 'user-c-0', 10);
    tracker.trackConversion('flag-1', 'control', 'user-c-1', 20);
    tracker.trackConversion('flag-1', 'control', 'user-c-2', 30);

    const result = tracker.analyze('flag-1', flagDef);
    const control = result!.variants.find((v) => v.name === 'control')!;
    expect(control.meanValue).toBe(20);
  });
});

describe('formatExperimentResults', () => {
  it('formats results with winner', () => {
    const result: ExperimentResult = {
      flag: 'test-flag',
      metric: 'conversion',
      method: 'bayesian',
      variants: [
        { name: 'control', sampleSize: 100, conversions: 10, conversionRate: 0.1, confidenceInterval: [0.05, 0.17] },
        { name: 'treatment', sampleSize: 100, conversions: 30, conversionRate: 0.3, confidenceInterval: [0.22, 0.39] },
      ],
      winner: 'treatment',
      significant: true,
      confidenceLevel: 0.95,
      totalSamples: 200,
    };
    const output = formatExperimentResults(result);
    expect(output).toContain('test-flag');
    expect(output).toContain('Winner: treatment');
    expect(output).toContain('bayesian');
  });

  it('formats results without winner', () => {
    const result: ExperimentResult = {
      flag: 'flag-a',
      metric: 'clicks',
      method: 'frequentist',
      variants: [
        { name: 'control', sampleSize: 50, conversions: 10, conversionRate: 0.2, confidenceInterval: [0.1, 0.33] },
      ],
      winner: null,
      significant: false,
      confidenceLevel: 0.95,
      totalSamples: 50,
    };
    const output = formatExperimentResults(result);
    expect(output).toContain('Not yet significant');
  });

  it('formats results with zero data', () => {
    const result: ExperimentResult = {
      flag: 'flag-b',
      metric: 'rev',
      method: 'bayesian',
      variants: [],
      winner: null,
      significant: false,
      confidenceLevel: 0.95,
      totalSamples: 0,
    };
    const output = formatExperimentResults(result);
    expect(output).toContain('No data yet');
  });
});
