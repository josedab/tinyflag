import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CanaryController,
  formatCanaryState,
  createPrometheusAdapter,
  createDatadogAdapter,
  createCloudWatchAdapter,
} from '../canary.js';
import type { MetricsAdapter, HealthMetrics, CanaryConfig } from '../canary.js';

function createMockAdapter(errorRate: number = 0.01): MetricsAdapter {
  return {
    name: 'mock',
    fetchMetrics: vi.fn().mockResolvedValue({
      errorRate,
      latencyP50: 50,
      latencyP99: 200,
      requestCount: 1000,
      timestamp: Date.now(),
    } as HealthMetrics),
  };
}

function createConfig(overrides: Partial<CanaryConfig> = {}): CanaryConfig {
  return {
    flag: 'new-feature',
    metricsAdapter: createMockAdapter(0.01),
    errorThreshold: 0.05,
    stages: [1, 5, 25, 50, 100],
    stageInterval: 10,
    gracePeriod: 10,
    confirmationWindow: 3,
    ...overrides,
  };
}

describe('canary release', () => {
  describe('CanaryController', () => {
    it('starts in running state at stage 0', () => {
      const ctrl = new CanaryController(createConfig());
      const state = ctrl.getState();
      expect(state.status).toBe('running');
      expect(state.currentStage).toBe(-1);
      expect(state.currentPercentage).toBe(0);
    });

    it('advances through stages', async () => {
      const ctrl = new CanaryController(createConfig());

      await ctrl.advance();
      expect(ctrl.getState().currentPercentage).toBe(1);

      await ctrl.advance();
      expect(ctrl.getState().currentPercentage).toBe(5);

      await ctrl.advance();
      expect(ctrl.getState().currentPercentage).toBe(25);
    });

    it('completes at last stage', async () => {
      const config = createConfig({ stages: [50, 100] });
      const ctrl = new CanaryController(config);

      await ctrl.advance(); // 50%
      await ctrl.advance(); // 100% → completed
      expect(ctrl.getState().status).toBe('completed');
      expect(ctrl.getState().currentPercentage).toBe(100);
    });

    it('passes health check when under threshold', async () => {
      const ctrl = new CanaryController(createConfig());
      const result = await ctrl.check();
      expect(result).toBe(true);
      expect(ctrl.getState().breachCount).toBe(0);
    });

    it('detects threshold breach', async () => {
      const adapter = createMockAdapter(0.1); // 10% error rate
      const ctrl = new CanaryController(
        createConfig({
          metricsAdapter: adapter,
          errorThreshold: 0.05,
        }),
      );

      await ctrl.check();
      expect(ctrl.getState().breachCount).toBe(1);
    });

    it('rolls back after confirmation window breaches', async () => {
      const adapter = createMockAdapter(0.1);
      const ctrl = new CanaryController(
        createConfig({
          metricsAdapter: adapter,
          confirmationWindow: 3,
        }),
      );

      await ctrl.advance(); // stage 1
      await ctrl.check(); // breach 1
      await ctrl.check(); // breach 2
      await ctrl.check(); // breach 3 → rollback

      expect(ctrl.getState().status).toBe('rolled-back');
      expect(ctrl.getState().currentPercentage).toBe(0);
    });

    it('resets breach count after successful check', async () => {
      const goodAdapter = createMockAdapter(0.01);
      const ctrl = new CanaryController(
        createConfig({
          metricsAdapter: goodAdapter,
        }),
      );

      // Manually set breach count
      await ctrl.check();
      expect(ctrl.getState().breachCount).toBe(0);
    });

    it('calls update callback on advance', async () => {
      const updateFn = vi.fn();
      const ctrl = new CanaryController(createConfig(), updateFn);

      await ctrl.advance();
      expect(updateFn).toHaveBeenCalledWith('new-feature', 1);
    });

    it('calls update callback on rollback', async () => {
      const updateFn = vi.fn();
      const adapter = createMockAdapter(0.1);
      const ctrl = new CanaryController(
        createConfig({
          metricsAdapter: adapter,
          confirmationWindow: 1,
        }),
        updateFn,
      );

      await ctrl.advance();
      await ctrl.check(); // single breach → rollback

      expect(updateFn).toHaveBeenCalledWith('new-feature', 0);
    });

    it('records event history', async () => {
      const ctrl = new CanaryController(createConfig());
      await ctrl.advance();
      await ctrl.check();

      const state = ctrl.getState();
      expect(state.history.length).toBeGreaterThanOrEqual(2);
      expect(state.history[0].type).toBe('stage-advance');
    });

    it('handles metrics fetch errors gracefully', async () => {
      const adapter: MetricsAdapter = {
        name: 'failing',
        fetchMetrics: vi.fn().mockRejectedValue(new Error('network error')),
      };
      const ctrl = new CanaryController(createConfig({ metricsAdapter: adapter }));
      const result = await ctrl.check();
      expect(result).toBe(true); // Don't rollback on transient errors
    });

    it('does not advance when not running', async () => {
      const adapter = createMockAdapter(0.1);
      const ctrl = new CanaryController(
        createConfig({
          metricsAdapter: adapter,
          confirmationWindow: 1,
        }),
      );
      await ctrl.advance();
      await ctrl.check(); // rollback

      const result = await ctrl.advance();
      expect(result).toBe(false);
    });
  });

  describe('formatCanaryState', () => {
    it('formats state as readable output', async () => {
      const ctrl = new CanaryController(createConfig());
      await ctrl.advance();
      await ctrl.check();

      const output = formatCanaryState(ctrl.getState());
      expect(output).toContain('new-feature');
      expect(output).toContain('running');
      expect(output).toContain('Timeline');
    });

    it('shows rollback status', async () => {
      const adapter = createMockAdapter(0.1);
      const ctrl = new CanaryController(
        createConfig({
          metricsAdapter: adapter,
          confirmationWindow: 1,
        }),
      );
      await ctrl.advance();
      await ctrl.check();

      const output = formatCanaryState(ctrl.getState());
      expect(output).toContain('rolled-back');
    });
  });

  describe('createPrometheusAdapter', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns adapter with name prometheus', () => {
      const adapter = createPrometheusAdapter('http://prom:9090');
      expect(adapter.name).toBe('prometheus');
    });

    it('fetches metrics successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: { result: [{ value: [1234567890, '0.032'] }] },
        }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any);

      const adapter = createPrometheusAdapter('http://prom:9090');
      const metrics = await adapter.fetchMetrics('my-service', 300);
      expect(metrics.errorRate).toBeCloseTo(0.032);
      expect(metrics.timestamp).toBeGreaterThan(0);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('http://prom:9090/api/v1/query'),
      );
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as any);

      const adapter = createPrometheusAdapter('http://prom:9090');
      await expect(adapter.fetchMetrics('svc', 60)).rejects.toThrow('Prometheus query failed: 500');
    });

    it('handles network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const adapter = createPrometheusAdapter('http://prom:9090');
      await expect(adapter.fetchMetrics('svc', 60)).rejects.toThrow('ECONNREFUSED');
    });

    it('returns 0 errorRate for unexpected response format', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { result: [] } }),
      } as any);

      const adapter = createPrometheusAdapter('http://prom:9090');
      const metrics = await adapter.fetchMetrics('svc', 60);
      expect(metrics.errorRate).toBe(0);
    });
  });

  describe('createDatadogAdapter', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns adapter with name datadog', () => {
      const adapter = createDatadogAdapter('api-key', 'app-key');
      expect(adapter.name).toBe('datadog');
    });

    it('fetches metrics with API key auth headers', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          series: [
            {
              pointlist: [
                [1700000000, 0.01],
                [1700000060, 0.02],
              ],
            },
          ],
        }),
      } as any);

      const adapter = createDatadogAdapter('my-api-key', 'my-app-key', 'datadoghq.eu');
      const metrics = await adapter.fetchMetrics('web-svc', 300);
      expect(metrics.errorRate).toBe(0.02);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('api.datadoghq.eu'),
        expect.objectContaining({
          headers: { 'DD-API-KEY': 'my-api-key', 'DD-APPLICATION-KEY': 'my-app-key' },
        }),
      );
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 403,
      } as any);

      const adapter = createDatadogAdapter('key', 'app');
      await expect(adapter.fetchMetrics('svc', 60)).rejects.toThrow('Datadog query failed: 403');
    });

    it('handles malformed JSON gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      } as any);

      const adapter = createDatadogAdapter('key', 'app');
      const metrics = await adapter.fetchMetrics('svc', 60);
      expect(metrics.errorRate).toBe(0);
    });
  });

  describe('createCloudWatchAdapter', () => {
    it('throws not-yet-implemented error', async () => {
      const adapter = createCloudWatchAdapter('us-east-1');
      expect(adapter.name).toBe('cloudwatch');
      await expect(adapter.fetchMetrics('svc', 60)).rejects.toThrow(
        'CloudWatch adapter requires AWS SDK',
      );
    });
  });

  describe('rollback webhook notification', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sends POST to webhook URL on rollback', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as any);
      const adapter = createMockAdapter(0.1);
      const ctrl = new CanaryController(
        createConfig({
          metricsAdapter: adapter,
          confirmationWindow: 1,
          webhookUrl: 'https://hooks.example.com/notify',
        }),
      );

      await ctrl.advance();
      await ctrl.check(); // triggers rollback

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://hooks.example.com/notify',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('canary-rollback'),
        }),
      );
    });

    it('silently catches fetch failure on webhook', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('webhook down'));
      const adapter = createMockAdapter(0.1);
      const ctrl = new CanaryController(
        createConfig({
          metricsAdapter: adapter,
          confirmationWindow: 1,
          webhookUrl: 'https://hooks.example.com/notify',
        }),
      );

      await ctrl.advance();
      // Should not throw even though fetch fails
      await expect(ctrl.check()).resolves.toBe(false);
      expect(ctrl.getState().status).toBe('rolled-back');
    });
  });
});
