import { describe, it, expect, vi } from 'vitest';
import {
  RolloutOrchestrator,
  createPrometheusHealthCheck,
  createHttpHealthCheck,
  formatRolloutState,
  DEFAULT_STAGES,
  type RolloutPipeline,
  type HealthCheckProvider,
  type HealthCheckResult,
  type RolloutStage,
} from '../progressive-core.js';

function makeHealthyResult(overrides: Partial<HealthCheckResult> = {}): HealthCheckResult {
  return {
    healthy: true,
    errorRate: 0.01,
    latencyP99: 50,
    requestCount: 100,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeMockHealthCheck(results: HealthCheckResult[]): HealthCheckProvider {
  let callIndex = 0;
  return {
    name: 'mock',
    async check() {
      const result = results[Math.min(callIndex, results.length - 1)];
      callIndex++;
      return result;
    },
  };
}

function makePipeline(
  healthCheck: HealthCheckProvider,
  stages?: RolloutStage[],
  overrides?: Partial<RolloutPipeline>,
): RolloutPipeline {
  return {
    flag: 'test-flag',
    stages: stages ?? DEFAULT_STAGES,
    defaultCriteria: {
      maxErrorRate: 0.05,
      minHoldTime: 0, // no hold time for tests
      requiredPassingChecks: 1,
      minRequestCount: 10,
    },
    healthCheck,
    ...overrides,
  };
}

describe('RolloutOrchestrator', () => {
  it('creates a pipeline and starts at first stage', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const pipeline = makePipeline(hc);
    const orch = new RolloutOrchestrator(pipeline);

    expect(orch.getState().status).toBe('pending');
    await orch.start();
    expect(orch.getState().status).toBe('running');
    expect(orch.getState().currentStageName).toBe('canary');
    expect(orch.getState().currentPercentage).toBe(1);
  });

  it('throws when pipeline has no stages', () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    expect(() => new RolloutOrchestrator({ ...makePipeline(hc), stages: [] })).toThrow(
      'at least one stage',
    );
  });

  it('cannot start twice', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const orch = new RolloutOrchestrator(makePipeline(hc));
    await orch.start();
    await expect(orch.start()).rejects.toThrow('Cannot start');
  });

  it('advances through stages on health check pass + promote', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const pipeline = makePipeline(hc);
    const orch = new RolloutOrchestrator(pipeline);

    await orch.start();
    expect(orch.getState().currentStageName).toBe('canary');

    await orch.check();
    const promoted = await orch.promote();
    expect(promoted).toBe(true);
    expect(orch.getState().currentStageName).toBe('ring-1');
    expect(orch.getState().currentPercentage).toBe(10);
  });

  it('completes rollout after advancing through all stages', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const pipeline = makePipeline(hc);
    const orch = new RolloutOrchestrator(pipeline);

    await orch.start();
    for (let i = 0; i < 4; i++) {
      await orch.check();
      await orch.promote();
    }
    expect(orch.getState().status).toBe('completed');
  });

  it('rolls back after 3 consecutive health check failures', async () => {
    const failResult = makeHealthyResult({ errorRate: 0.2, healthy: false });
    const hc = makeMockHealthCheck([failResult]);
    const updateFn = vi.fn();
    const orch = new RolloutOrchestrator(makePipeline(hc), updateFn);

    await orch.start();
    await orch.check();
    await orch.check();
    expect(orch.getState().status).toBe('running');

    await orch.check(); // 3rd failure triggers rollback
    expect(orch.getState().status).toBe('rolled-back');
    expect(orch.getState().currentPercentage).toBe(0);
    expect(updateFn).toHaveBeenCalledWith('test-flag', 0);
  });

  it('enforces minHoldTime before promotion', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const pipeline = makePipeline(hc);
    pipeline.defaultCriteria.minHoldTime = 99999; // very long hold time
    const orch = new RolloutOrchestrator(pipeline);

    await orch.start();
    await orch.check();
    const promoted = await orch.promote();
    expect(promoted).toBe(false);
  });

  it('enforces requiredPassingChecks before promotion', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const pipeline = makePipeline(hc);
    pipeline.defaultCriteria.requiredPassingChecks = 3;
    const orch = new RolloutOrchestrator(pipeline);

    await orch.start();
    await orch.check();
    const promoted = await orch.promote();
    expect(promoted).toBe(false); // only 1 passing check, need 3

    await orch.check();
    await orch.check();
    const promoted2 = await orch.promote();
    expect(promoted2).toBe(true);
  });

  it('force promote bypasses criteria', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const pipeline = makePipeline(hc);
    pipeline.defaultCriteria.minHoldTime = 99999;
    const orch = new RolloutOrchestrator(pipeline);

    await orch.start();
    const promoted = await orch.promote(true);
    expect(promoted).toBe(true);
  });

  it('passing check resets consecutive failure count', async () => {
    const healthy = makeHealthyResult();
    const failing = makeHealthyResult({ errorRate: 0.2 });
    const hc = makeMockHealthCheck([failing, failing, healthy, failing, failing]);
    const orch = new RolloutOrchestrator(makePipeline(hc));

    await orch.start();
    await orch.check(); // fail 1
    await orch.check(); // fail 2
    await orch.check(); // pass - resets counter
    expect(orch.getState().consecutiveFailingChecks).toBe(0);
    await orch.check(); // fail 1 again
    await orch.check(); // fail 2
    expect(orch.getState().status).toBe('running'); // still running, not 3 consecutive
  });

  it('pause and resume work correctly', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const orch = new RolloutOrchestrator(makePipeline(hc));
    await orch.start();

    orch.pause();
    expect(orch.getState().status).toBe('paused');

    // check returns false when paused
    const checkResult = await orch.check();
    expect(checkResult).toBe(false);

    orch.resume();
    expect(orch.getState().status).toBe('running');
  });

  it('pause is no-op if not running', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const orch = new RolloutOrchestrator(makePipeline(hc));
    orch.pause(); // not started
    expect(orch.getState().status).toBe('pending');
  });

  it('resume is no-op if not paused', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const orch = new RolloutOrchestrator(makePipeline(hc));
    await orch.start();
    orch.resume(); // already running
    expect(orch.getState().status).toBe('running');
  });

  it('calls update callback on stage entry', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const updateFn = vi.fn();
    const orch = new RolloutOrchestrator(makePipeline(hc), updateFn);

    await orch.start();
    expect(updateFn).toHaveBeenCalledWith('test-flag', 1);
  });

  it('handles single-stage pipeline', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult()]);
    const pipeline = makePipeline(hc, [{ name: 'ga', percentage: 100 }]);
    const orch = new RolloutOrchestrator(pipeline);

    await orch.start();
    expect(orch.getState().currentStageName).toBe('ga');

    await orch.check();
    const promoted = await orch.promote();
    expect(promoted).toBe(true);
    expect(orch.getState().status).toBe('completed');
  });

  it('handles health check error gracefully', async () => {
    const hc: HealthCheckProvider = {
      name: 'error',
      async check() {
        throw new Error('connection refused');
      },
    };
    const orch = new RolloutOrchestrator(makePipeline(hc));
    await orch.start();

    const result = await orch.check();
    expect(result).toBe(true); // transient errors don't cause rollback
    expect(orch.getState().status).toBe('running');
  });

  it('respects stage-specific criteria overrides', async () => {
    const hc = makeMockHealthCheck([makeHealthyResult({ latencyP99: 300 })]);
    const pipeline = makePipeline(hc, [
      { name: 'canary', percentage: 1, criteria: { maxLatencyP99: 200 } },
      { name: 'ga', percentage: 100 },
    ]);
    const orch = new RolloutOrchestrator(pipeline);

    await orch.start();
    await orch.check(); // fail due to latency
    expect(orch.getState().consecutiveFailingChecks).toBe(1);
  });
});

describe('createPrometheusHealthCheck', () => {
  it('creates a health check provider with correct name', () => {
    const hc = createPrometheusHealthCheck('http://localhost:9090');
    expect(hc.name).toBe('prometheus');
    expect(typeof hc.check).toBe('function');
  });
});

describe('createHttpHealthCheck', () => {
  it('creates a health check provider with correct name', () => {
    const hc = createHttpHealthCheck('http://localhost:8080/health');
    expect(hc.name).toBe('http');
    expect(typeof hc.check).toBe('function');
  });
});

describe('formatRolloutState', () => {
  it('formats a running rollout', () => {
    const output = formatRolloutState({
      flag: 'test-flag',
      status: 'running',
      currentStageIndex: 0,
      currentStageName: 'canary',
      currentPercentage: 1,
      consecutivePassingChecks: 2,
      consecutiveFailingChecks: 0,
      stageEnteredAt: Date.now() - 5000,
      startedAt: Date.now() - 10000,
      history: [],
    });
    expect(output).toContain('Progressive Rollout: test-flag');
    expect(output).toContain('running');
    expect(output).toContain('canary');
    expect(output).toContain('1%');
  });

  it('formats a completed rollout', () => {
    const output = formatRolloutState({
      flag: 'flag-x',
      status: 'completed',
      currentStageIndex: 3,
      currentStageName: 'ga',
      currentPercentage: 100,
      consecutivePassingChecks: 3,
      consecutiveFailingChecks: 0,
      stageEnteredAt: Date.now(),
      startedAt: Date.now(),
      history: [],
    });
    expect(output).toContain('completed');
    expect(output).toContain('100%');
  });

  it('formats rolled-back state', () => {
    const output = formatRolloutState({
      flag: 'flag-y',
      status: 'rolled-back',
      currentStageIndex: 0,
      currentStageName: 'canary',
      currentPercentage: 0,
      consecutivePassingChecks: 0,
      consecutiveFailingChecks: 3,
      stageEnteredAt: 0,
      startedAt: Date.now(),
      history: [],
    });
    expect(output).toContain('rolled-back');
  });

  it('shows not started for empty stage name', () => {
    const output = formatRolloutState({
      flag: 'flag-z',
      status: 'pending',
      currentStageIndex: -1,
      currentStageName: '',
      currentPercentage: 0,
      consecutivePassingChecks: 0,
      consecutiveFailingChecks: 0,
      stageEnteredAt: 0,
      startedAt: 0,
      history: [],
    });
    expect(output).toContain('(not started)');
  });
});
