import { describe, it, expect } from 'vitest';
import {
  suggestRolloutPercentage,
  detectAnomalies,
  suggestCleanup,
  formatRecommendations,
  formatAnomalies,
  formatCleanupSuggestions,
  type EvalEvent,
} from '../intelligence.js';
import type { FlagConfig, FlagDefinition } from '../types.js';

function makeEvents(flag: string, count: number, overrides: Partial<EvalEvent> = {}): EvalEvent[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    flag,
    enabled: true,
    userId: `user-${i}`,
    timestamp: now - (count - i) * 1000,
    ...overrides,
  }));
}

describe('suggestRolloutPercentage', () => {
  it('recommends conservative rollout with insufficient data', () => {
    const events = makeEvents('flag-1', 10);
    const flagDef: FlagDefinition = { enabled: true, rollout: 50 };
    const rec = suggestRolloutPercentage('flag-1', flagDef, events);

    expect(rec.confidence).toBe(0.2);
    expect(rec.riskLevel).toBe('medium');
    expect(rec.recommendedRollout).toBe(50); // uses current rollout as fallback
  });

  it('recommends reducing rollout on high error rate', () => {
    const events = makeEvents('flag-1', 100, { errorOccurred: true });
    const flagDef: FlagDefinition = { enabled: true, rollout: 80 };
    const rec = suggestRolloutPercentage('flag-1', flagDef, events);

    expect(rec.riskLevel).toBe('high');
    expect(rec.recommendedRollout).toBeLessThan(80);
    expect(rec.confidence).toBeGreaterThan(0.5);
  });

  it('recommends holding on moderate error rate', () => {
    // ~5% error rate
    const events = [
      ...makeEvents('flag-1', 95),
      ...makeEvents('flag-1', 5, { errorOccurred: true }),
    ];
    const flagDef: FlagDefinition = { enabled: true, rollout: 25 };
    const rec = suggestRolloutPercentage('flag-1', flagDef, events);

    expect(rec.riskLevel).toBe('medium');
    expect(rec.recommendedRollout).toBe(25);
  });

  it('recommends increasing rollout on low error rate', () => {
    const events = makeEvents('flag-1', 200);
    const flagDef: FlagDefinition = { enabled: true, rollout: 10 };
    const rec = suggestRolloutPercentage('flag-1', flagDef, events);

    expect(rec.riskLevel).toBe('low');
    expect(rec.recommendedRollout).toBeGreaterThan(10);
  });

  it('recommends 100% when already performing well at max', () => {
    const events = makeEvents('flag-1', 200);
    const flagDef: FlagDefinition = { enabled: true, rollout: 100 };
    const rec = suggestRolloutPercentage('flag-1', flagDef, events);

    expect(rec.recommendedRollout).toBe(100);
    expect(rec.riskLevel).toBe('low');
  });

  it('handles flag with no rollout set', () => {
    const events = makeEvents('flag-1', 200);
    const flagDef: FlagDefinition = { enabled: true };
    const rec = suggestRolloutPercentage('flag-1', flagDef, events);

    expect(rec.currentRollout).toBeUndefined();
    expect(rec.recommendedRollout).toBe(100);
  });
});

describe('detectAnomalies', () => {
  it('detects error spike', () => {
    const now = Date.now();
    const windowMs = 3600000;
    // Before window: low error rate
    const before = Array.from({ length: 100 }, (_, i) => ({
      flag: 'flag-1',
      enabled: true,
      userId: `user-${i}`,
      timestamp: now - windowMs - (100 - i) * 1000,
      errorOccurred: false,
    }));
    // After window: high error rate
    const after = Array.from({ length: 100 }, (_, i) => ({
      flag: 'flag-1',
      enabled: true,
      userId: `user-after-${i}`,
      timestamp: now - (100 - i) * 1000,
      errorOccurred: i < 20, // 20% error rate
    }));

    const anomalies = detectAnomalies('flag-1', [...before, ...after], windowMs);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.some((a) => a.type === 'error-spike')).toBe(true);
  });

  it('detects latency spike', () => {
    const now = Date.now();
    const windowMs = 3600000;
    const before = Array.from({ length: 50 }, (_, i) => ({
      flag: 'flag-1',
      enabled: true,
      userId: `user-${i}`,
      timestamp: now - windowMs - (50 - i) * 1000,
      latencyMs: 50,
    }));
    const after = Array.from({ length: 50 }, (_, i) => ({
      flag: 'flag-1',
      enabled: true,
      userId: `user-after-${i}`,
      timestamp: now - (50 - i) * 1000,
      latencyMs: 500, // 10x increase
    }));

    const anomalies = detectAnomalies('flag-1', [...before, ...after], windowMs);
    expect(anomalies.some((a) => a.type === 'latency-spike')).toBe(true);
  });

  it('returns empty for normal metrics', () => {
    const now = Date.now();
    const events = Array.from({ length: 100 }, (_, i) => ({
      flag: 'flag-1',
      enabled: true,
      userId: `user-${i}`,
      timestamp: now - (100 - i) * 60000,
      errorOccurred: false,
      latencyMs: 50,
    }));

    const anomalies = detectAnomalies('flag-1', events);
    expect(anomalies).toHaveLength(0);
  });

  it('returns empty for insufficient data', () => {
    const events = makeEvents('flag-1', 5);
    const anomalies = detectAnomalies('flag-1', events);
    expect(anomalies).toHaveLength(0);
  });

  it('returns empty when before/after windows have too few events', () => {
    const now = Date.now();
    // All events in the "after" window
    const events = makeEvents('flag-1', 30);
    const anomalies = detectAnomalies('flag-1', events, 1); // 1ms window, so all after
    expect(anomalies).toHaveLength(0);
  });
});

describe('suggestCleanup', () => {
  it('suggests removing archived flags', () => {
    const config: FlagConfig = {
      flags: {
        'old-flag': { enabled: true, lifecycle: { state: 'archived' } } as FlagDefinition,
      },
    };
    const suggestions = suggestCleanup(config, []);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].reason).toBe('archived');
    expect(suggestions[0].suggestedAction).toBe('remove');
  });

  it('suggests removing sunset-expired flags', () => {
    const config: FlagConfig = {
      flags: {
        'sunset-flag': {
          enabled: true,
          lifecycle: { state: 'sunset', sunsetAt: '2020-01-01T00:00:00Z' },
        } as FlagDefinition,
      },
    };
    const suggestions = suggestCleanup(config, []);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].reason).toBe('sunset-expired');
  });

  it('flags stale flags not evaluated recently', () => {
    const config: FlagConfig = {
      flags: {
        'stale-flag': { enabled: true } as FlagDefinition,
      },
    };
    const oldTimestamp = Date.now() - 60 * 24 * 3600 * 1000; // 60 days ago
    const events: EvalEvent[] = [
      { flag: 'stale-flag', enabled: true, userId: 'u1', timestamp: oldTimestamp },
    ];
    const suggestions = suggestCleanup(config, events);
    expect(suggestions.some((s) => s.reason === 'stale')).toBe(true);
  });

  it('suggests review for no-evaluation flags', () => {
    const config: FlagConfig = {
      flags: {
        'unused-flag': { enabled: true } as FlagDefinition,
      },
    };
    const suggestions = suggestCleanup(config, []);
    expect(suggestions.some((s) => s.reason === 'no-evaluations')).toBe(true);
    expect(suggestions[0].suggestedAction).toBe('review');
  });

  it('returns empty when all flags are active', () => {
    const config: FlagConfig = {
      flags: {
        'active-flag': { enabled: true, rollout: 50 } as FlagDefinition,
      },
    };
    const events = makeEvents('active-flag', 200);
    const suggestions = suggestCleanup(config, events);
    // With rollout set, it won't be flagged as always-on
    expect(suggestions).toHaveLength(0);
  });

  it('identifies always-on flags', () => {
    const config: FlagConfig = {
      flags: {
        'always-on': { enabled: true } as FlagDefinition,
      },
    };
    const events = makeEvents('always-on', 200, { enabled: true });
    const suggestions = suggestCleanup(config, events);
    expect(suggestions.some((s) => s.reason === 'always-on')).toBe(true);
  });

  it('identifies always-off flags', () => {
    const config: FlagConfig = {
      flags: {
        'always-off': { enabled: false } as FlagDefinition,
      },
    };
    const events = makeEvents('always-off', 200, { enabled: false });
    const suggestions = suggestCleanup(config, events);
    expect(suggestions.some((s) => s.reason === 'always-off')).toBe(true);
  });

  it('returns suggestions sorted by confidence', () => {
    const config: FlagConfig = {
      flags: {
        'archived': { enabled: true, lifecycle: { state: 'archived' } } as FlagDefinition,
        'no-eval': { enabled: true } as FlagDefinition,
      },
    };
    const suggestions = suggestCleanup(config, []);
    expect(suggestions[0].confidence).toBeGreaterThanOrEqual(suggestions[1].confidence);
  });

  it('handles empty metrics array', () => {
    const config: FlagConfig = { flags: {} };
    const suggestions = suggestCleanup(config, []);
    expect(suggestions).toHaveLength(0);
  });
});

describe('formatting functions', () => {
  it('formatRecommendations produces readable output', () => {
    const output = formatRecommendations([
      {
        flag: 'flag-1',
        currentRollout: 10,
        recommendedRollout: 50,
        confidence: 0.75,
        reason: 'Low error rate',
        riskLevel: 'low',
      },
    ]);
    expect(output).toContain('Rollout Recommendations');
    expect(output).toContain('flag-1');
    expect(output).toContain('50%');
  });

  it('formatAnomalies produces readable output', () => {
    const output = formatAnomalies([
      {
        flag: 'flag-1',
        type: 'error-spike',
        severity: 'critical',
        detectedAt: Date.now(),
        description: 'Error rate increased',
        beforeMetric: 0.01,
        afterMetric: 0.2,
        changePercent: 1900,
        confidence: 0.9,
      },
    ]);
    expect(output).toContain('Anomalies Detected');
    expect(output).toContain('error-spike');
  });

  it('formatAnomalies returns clean message for no anomalies', () => {
    expect(formatAnomalies([])).toContain('No anomalies');
  });

  it('formatCleanupSuggestions produces readable output', () => {
    const output = formatCleanupSuggestions([
      {
        flag: 'old-flag',
        reason: 'stale',
        confidence: 0.8,
        description: 'Not evaluated in 60 days',
        suggestedAction: 'archive',
      },
    ]);
    expect(output).toContain('Cleanup Suggestions');
    expect(output).toContain('old-flag');
  });

  it('formatCleanupSuggestions returns clean message for no suggestions', () => {
    expect(formatCleanupSuggestions([])).toContain('No cleanup');
  });
});
