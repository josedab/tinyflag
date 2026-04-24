---
sidebar_position: 14
title: Flag Intelligence
description: Heuristic-based rollout recommendations, anomaly detection, and cleanup suggestions.
---

# Flag Intelligence

TinyFlag includes heuristic-based analytics that analyze evaluation history to recommend optimal rollout percentages, detect anomalies when flag changes correlate with error spikes, and suggest stale flags for cleanup.

## Rollout Recommendations

Suggest optimal rollout percentages based on evaluation history:

```typescript
import { suggestRolloutPercentage, formatRecommendations } from 'tinyflag';
import type { EvalEvent } from 'tinyflag';

// Collect evaluation events (from your telemetry pipeline)
const events: EvalEvent[] = [
  {
    flag: 'new-checkout',
    enabled: true,
    userId: 'u1',
    timestamp: Date.now(),
    errorOccurred: false,
    latencyMs: 45,
  },
  {
    flag: 'new-checkout',
    enabled: true,
    userId: 'u2',
    timestamp: Date.now(),
    errorOccurred: true,
    latencyMs: 1200,
  },
  // ... more events
];

const flag = ff.getFlags()['new-checkout'];
const recommendation = suggestRolloutPercentage('new-checkout', flag, events);

console.log(recommendation);
// {
//   flag: 'new-checkout',
//   currentRollout: 25,
//   recommendedRollout: 50,
//   confidence: 0.75,
//   reason: 'Low error rate (1.2%) with 5000 evaluations — safe to increase',
//   riskLevel: 'low'
// }

// Format multiple recommendations
const allRecs = Object.entries(ff.getFlags()).map(([name, def]) =>
  suggestRolloutPercentage(name, def, events),
);
console.log(formatRecommendations(allRecs));
```

### Decision Logic

| Error Rate | Evaluation Count | Recommendation           | Risk   |
| ---------- | ---------------- | ------------------------ | ------ |
| Any        | < 50             | Start at 5%              | Medium |
| > 10%      | ≥ 50             | Reduce to 25% of current | High   |
| 3–10%      | ≥ 50             | Hold current rollout     | Medium |
| < 3%       | ≥ 50             | Increase by 10–50%       | Low    |

## Anomaly Detection

Detect when flag changes correlate with unusual patterns:

```typescript
import { detectAnomalies, formatAnomalies } from 'tinyflag';

const anomalies = detectAnomalies(events, ff.getFlags());

console.log(formatAnomalies(anomalies));
// ⚠️ new-checkout: Error rate spike (12.5%) detected in last 5 minutes — flag was enabled 3 minutes ago
```

### Anomaly Types

```typescript
interface FlagAnomaly {
  flag: string;
  type: 'error-spike' | 'latency-spike' | 'traffic-drop' | 'evaluation-gap';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detectedAt: number;
  metrics: Record<string, number>;
}
```

## Cleanup Suggestions

Identify stale or redundant flags that can be removed:

```typescript
import { suggestCleanup, formatCleanupSuggestions } from 'tinyflag';

const suggestions = suggestCleanup(ff.getFlags(), events);

console.log(formatCleanupSuggestions(suggestions));
// 🧹 Cleanup suggestions:
//   dark-mode: Flag is disabled and has 0 evaluations in the last 30 days (confidence: 0.9)
//   legacy-nav: Flag is at 100% rollout — consider removing the flag and hardcoding (confidence: 0.85)
```

### Suggestion Types

```typescript
interface CleanupSuggestion {
  flag: string;
  reason: string;
  confidence: number; // 0–1
  action: 'remove' | 'archive' | 'promote-to-permanent';
  lastEvaluated?: number; // Timestamp of last evaluation
}
```

## Evaluation Event Shape

All intelligence functions consume `EvalEvent` arrays. Collect these from your telemetry or directly from TinyFlag's exposure events:

```typescript
interface EvalEvent {
  flag: string;
  enabled: boolean;
  variant?: string;
  userId: string;
  timestamp: number;
  errorOccurred?: boolean; // Did the request produce an error?
  latencyMs?: number; // Request latency
  converted?: boolean; // Did the user convert?
}
```

### Bridging from TinyFlag Events

```typescript
ff.on('exposure', (event) => {
  events.push({
    flag: event.flag,
    enabled: event.enabled,
    variant: event.variant ?? undefined,
    userId: event.userId,
    timestamp: event.timestamp,
  });
});
```
