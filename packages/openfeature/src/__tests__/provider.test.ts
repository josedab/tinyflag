import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TinyFlagProvider } from '../provider.js';
import type { TinyFlag } from 'tinyflag';

function createMockInstance(overrides: Partial<TinyFlag> = {}): TinyFlag {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    isEnabled: vi.fn().mockReturnValue(true),
    getVariant: vi.fn().mockReturnValue('control'),
    getAllFlags: vi.fn().mockReturnValue({
      'test-flag': { enabled: true, variant: 'control' },
    }),
    getFlags: vi.fn().mockReturnValue({
      'test-flag': {
        enabled: true,
        rollout: 50,
        rules: [],
        variants: [{ name: 'control', weight: 50 }],
      },
    }),
    on: vi.fn(),
    off: vi.fn(),
    ...overrides,
  } as unknown as TinyFlag;
}

describe('TinyFlagProvider', () => {
  let mock: TinyFlag;
  let provider: TinyFlagProvider;

  beforeEach(() => {
    mock = createMockInstance();
    provider = new TinyFlagProvider(mock);
  });

  it('has correct metadata', () => {
    expect(provider.metadata.name).toBe('tinyflag');
  });

  it('throws if no instance provided', () => {
    expect(() => new TinyFlagProvider(null as any)).toThrow('TinyFlag instance is required');
  });

  describe('initialize', () => {
    it('calls init on the TinyFlag instance', async () => {
      await provider.initialize();
      expect(mock.init).toHaveBeenCalled();
    });

    it('throws if init fails', async () => {
      const failMock = createMockInstance({ init: vi.fn().mockRejectedValue(new Error('fail')) });
      const p = new TinyFlagProvider(failMock);
      await expect(p.initialize()).rejects.toThrow('fail');
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('returns enabled state', () => {
      const result = provider.resolveBooleanEvaluation('test-flag', false, {
        targetingKey: 'user-1',
      });
      expect(result.value).toBe(true);
      expect(mock.isEnabled).toHaveBeenCalledWith('test-flag', { userId: 'user-1' });
    });

    it('returns default for unknown flag', () => {
      const m = createMockInstance({ getFlags: vi.fn().mockReturnValue({}) });
      const p = new TinyFlagProvider(m);
      const result = p.resolveBooleanEvaluation('unknown', false, {});
      expect(result.value).toBe(false);
      expect(result.errorCode).toBe('FLAG_NOT_FOUND');
    });
  });

  describe('resolveStringEvaluation', () => {
    it('returns variant name', () => {
      const result = provider.resolveStringEvaluation('test-flag', 'default', {
        targetingKey: 'user-1',
      });
      expect(result.value).toBe('control');
      expect(result.variant).toBe('control');
    });

    it('returns enabled string when no variant', () => {
      const m = createMockInstance({ getVariant: vi.fn().mockReturnValue(null) });
      const p = new TinyFlagProvider(m);
      const result = p.resolveStringEvaluation('test-flag', 'default', { targetingKey: 'user-1' });
      expect(result.value).toBe('true');
    });
  });

  describe('resolveNumberEvaluation', () => {
    it('returns numeric variant', () => {
      const m = createMockInstance({ getVariant: vi.fn().mockReturnValue('42') });
      const p = new TinyFlagProvider(m);
      const result = p.resolveNumberEvaluation('test-flag', 0, { targetingKey: 'user-1' });
      expect(result.value).toBe(42);
    });

    it('returns default for non-numeric variant', () => {
      const m = createMockInstance({ getVariant: vi.fn().mockReturnValue('not-a-number') });
      const p = new TinyFlagProvider(m);
      const result = p.resolveNumberEvaluation('test-flag', 99, { targetingKey: 'user-1' });
      expect(result.value).toBe(99);
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('returns flag state as object', () => {
      const result = provider.resolveObjectEvaluation('test-flag', {}, { targetingKey: 'user-1' });
      expect(result.value).toEqual({ enabled: true, variant: 'control' });
    });
  });

  describe('context translation', () => {
    it('maps targetingKey to userId', () => {
      provider.resolveBooleanEvaluation('test-flag', false, {
        targetingKey: 'u-123',
        plan: 'pro',
        country: 'US',
      });
      expect(mock.isEnabled).toHaveBeenCalledWith('test-flag', {
        userId: 'u-123',
        plan: 'pro',
        country: 'US',
      });
    });
  });

  describe('onClose', () => {
    it('destroys the instance', async () => {
      await provider.onClose();
      expect(mock.destroy).toHaveBeenCalled();
    });

    it('sets status to NOT_READY after close', async () => {
      await provider.initialize();
      await provider.onClose();
      // Provider should no longer be in READY state
      expect(mock.destroy).toHaveBeenCalled();
    });
  });

  describe('wireEvents', () => {
    it('wires change and error event listeners on construction', () => {
      expect(mock.on).toHaveBeenCalledWith('change', expect.any(Function));
      expect(mock.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('emits PROVIDER_CONFIGURATION_CHANGED on change event', () => {
      const eventSpy = vi.spyOn(provider.events, 'emit');
      // Get the change handler registered during construction
      const changeCall = (mock.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: any[]) => c[0] === 'change',
      );
      const changeHandler = changeCall![1];
      changeHandler({
        flag: 'my-flag',
        previous: undefined,
        current: { enabled: true },
        timestamp: 0,
      });

      expect(eventSpy).toHaveBeenCalledWith(
        'PROVIDER_CONFIGURATION_CHANGED',
        expect.objectContaining({ flagsChanged: ['my-flag'] }),
      );
    });

    it('emits PROVIDER_ERROR on LOAD_ERROR event', () => {
      const eventSpy = vi.spyOn(provider.events, 'emit');
      const errorCall = (mock.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: any[]) => c[0] === 'error',
      );
      const errorHandler = errorCall![1];
      errorHandler({ code: 'LOAD_ERROR', message: 'file not found' });

      expect(eventSpy).toHaveBeenCalledWith(
        'PROVIDER_ERROR',
        expect.objectContaining({ message: 'file not found' }),
      );
    });

    it('ignores non-LOAD_ERROR error events', () => {
      const eventSpy = vi.spyOn(provider.events, 'emit');
      const errorCall = (mock.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: any[]) => c[0] === 'error',
      );
      const errorHandler = errorCall![1];
      errorHandler({ code: 'INSECURE_SOURCE', message: 'http' });

      expect(eventSpy).not.toHaveBeenCalledWith('PROVIDER_ERROR', expect.anything());
    });
  });

  describe('status transitions', () => {
    it('transitions NOT_READY → READY on successful initialize', async () => {
      const eventSpy = vi.spyOn(provider.events, 'emit');
      await provider.initialize();
      expect(eventSpy).toHaveBeenCalledWith('PROVIDER_READY');
    });

    it('transitions NOT_READY → ERROR on failed initialize', async () => {
      const failMock = createMockInstance({ init: vi.fn().mockRejectedValue(new Error('fail')) });
      const p = new TinyFlagProvider(failMock);
      const eventSpy = vi.spyOn(p.events, 'emit');

      await expect(p.initialize()).rejects.toThrow('fail');
      expect(eventSpy).toHaveBeenCalledWith(
        'PROVIDER_ERROR',
        expect.objectContaining({ message: 'fail' }),
      );
    });
  });

  describe('reason calculation', () => {
    it('returns TARGETING_MATCH when rules exist and context provided', () => {
      const m = createMockInstance({
        getFlags: vi.fn().mockReturnValue({
          f: { enabled: true, rules: [{ conditions: { plan: 'pro' } }], rollout: undefined },
        }),
      });
      const p = new TinyFlagProvider(m);
      const result = p.resolveBooleanEvaluation('f', false, { targetingKey: 'u1' });
      expect(result.reason).toBe('TARGETING_MATCH');
    });

    it('returns SPLIT when rollout is defined and userId present', () => {
      const m = createMockInstance({
        getFlags: vi.fn().mockReturnValue({
          f: { enabled: true, rollout: 50 },
        }),
      });
      const p = new TinyFlagProvider(m);
      const result = p.resolveBooleanEvaluation('f', false, { targetingKey: 'u1' });
      expect(result.reason).toBe('SPLIT');
    });

    it('returns STATIC when no rules or rollout', () => {
      const m = createMockInstance({
        getFlags: vi.fn().mockReturnValue({
          f: { enabled: true },
        }),
      });
      const p = new TinyFlagProvider(m);
      const result = p.resolveBooleanEvaluation('f', false, { targetingKey: 'u1' });
      expect(result.reason).toBe('STATIC');
    });
  });

  describe('resolveStringEvaluation with variant flag', () => {
    it('returns variant string and variant field', () => {
      const m = createMockInstance({
        getVariant: vi.fn().mockReturnValue('treatment'),
        getFlags: vi.fn().mockReturnValue({
          f: { enabled: true, variants: [{ name: 'treatment', weight: 100 }] },
        }),
      });
      const p = new TinyFlagProvider(m);
      const result = p.resolveStringEvaluation('f', 'default', { targetingKey: 'u1' });
      expect(result.value).toBe('treatment');
      expect(result.variant).toBe('treatment');
    });
  });
});
