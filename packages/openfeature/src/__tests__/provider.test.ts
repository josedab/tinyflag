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
      'test-flag': { enabled: true, rollout: 50, rules: [], variants: [{ name: 'control', weight: 50 }] },
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
      const result = provider.resolveBooleanEvaluation('test-flag', false, { targetingKey: 'user-1' });
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
      const result = provider.resolveStringEvaluation('test-flag', 'default', { targetingKey: 'user-1' });
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
  });
});
