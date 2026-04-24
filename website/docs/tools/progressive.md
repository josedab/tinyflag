---
sidebar_position: 11
title: Progressive Rollouts
description: Multi-stage rollout pipelines with health-check gates and automatic rollback.
---

# Progressive Rollouts

The `RolloutOrchestrator` manages multi-stage rollout pipelines (canary → ring → GA) with health-check gates, automatic rollback on error-rate spikes, and configurable promotion criteria.

## Quick Start

```typescript
import {
  RolloutOrchestrator,
  createPrometheusHealthCheck,
  DEFAULT_STAGES,
  formatRolloutState,
} from 'tinyflag';

const orchestrator = new RolloutOrchestrator(
  {
    flag: 'new-checkout',
    stages: DEFAULT_STAGES, // canary(1%) → ring-1(10%) → ring-2(50%) → ga(100%)
    defaultCriteria: {
      maxErrorRate: 0.05, // Roll back if error rate > 5%
      minHoldTime: 300, // Hold each stage for at least 5 minutes
      requiredPassingChecks: 3,
      minRequestCount: 10,
    },
    healthCheck: createPrometheusHealthCheck('http://prometheus:9090'),
  },
  // Callback when rollout percentage changes
  (flag, percentage) => {
    console.log(`Flag "${flag}" now at ${percentage}%`);
    // Update your flag file or TinyFlag instance here
  },
);

// Start the rollout
await orchestrator.start();

// Run health check cycles (call this on an interval)
const healthy = await orchestrator.check();

// Inspect current state
console.log(formatRolloutState(orchestrator.getState()));
```

## Default Stages

TinyFlag ships a sensible default pipeline:

| Stage    | Percentage | Description           |
| -------- | ---------- | --------------------- |
| `canary` | 1%         | Smallest blast radius |
| `ring-1` | 10%        | Early adopters        |
| `ring-2` | 50%        | Wider audience        |
| `ga`     | 100%       | General availability  |

Override stages for your use case:

```typescript
const stages = [
  { name: 'internal', percentage: 1 },
  { name: 'beta', percentage: 10, criteria: { maxErrorRate: 0.02 } },
  { name: 'ga', percentage: 100 },
];
```

## Promotion Criteria

Each stage must pass all criteria before advancing:

| Criteria                | Type     | Default | Description                               |
| ----------------------- | -------- | ------- | ----------------------------------------- |
| `maxErrorRate`          | `number` | `0.05`  | Maximum error rate (0–1)                  |
| `maxLatencyP99`         | `number` | —       | Maximum P99 latency in ms                 |
| `minRequestCount`       | `number` | `10`    | Minimum requests before metrics are valid |
| `minHoldTime`           | `number` | `300`   | Minimum seconds to hold at each stage     |
| `requiredPassingChecks` | `number` | `3`     | Consecutive passing checks to promote     |

## Health Check Providers

### Prometheus

Queries error rate, P99 latency, and request count from Prometheus:

```typescript
import { createPrometheusHealthCheck } from 'tinyflag';
const hc = createPrometheusHealthCheck('http://prometheus:9090');
```

### HTTP Endpoint

Pings a health endpoint and treats a 2xx response as healthy:

```typescript
import { createHttpHealthCheck } from 'tinyflag';
const hc = createHttpHealthCheck('http://myservice:8080/health');
```

### Custom Provider

Implement the `HealthCheckProvider` interface:

```typescript
import type { HealthCheckProvider, HealthCheckResult } from 'tinyflag';

const myCheck: HealthCheckProvider = {
  name: 'datadog',
  async check(service, window): Promise<HealthCheckResult> {
    const metrics = await fetchDatadogMetrics(service, window);
    return {
      healthy: metrics.errorRate < 0.05,
      errorRate: metrics.errorRate,
      latencyP99: metrics.p99,
      requestCount: metrics.count,
      timestamp: Date.now(),
    };
  },
};
```

## Pipeline Lifecycle

```
pending → running → [check-passed/check-failed] → promoting → running (next stage) → completed
                                                 ↘ rolled-back (on failure)
```

### Pause and Resume

```typescript
orchestrator.pause(); // Freezes rollout at current stage
orchestrator.resume(); // Resumes health checks and promotion
```

### Rollback

Automatic rollback occurs when 3 consecutive health checks fail (configurable). The rollout percentage is set to 0% and the status becomes `'rolled-back'`.

## Rollout State

```typescript
interface RolloutState {
  flag: string;
  status: PipelineStatus; // 'pending'|'running'|'paused'|'promoting'|'rolled-back'|'completed'|'error'
  currentStageIndex: number;
  currentStageName: string;
  currentPercentage: number;
  consecutivePassingChecks: number;
  consecutiveFailingChecks: number;
  stageEnteredAt: number;
  startedAt: number;
  history: RolloutEvent[]; // Full timeline of events
}
```
