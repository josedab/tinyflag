import { describe, it, expect, vi } from 'vitest';
import { evaluateForContext } from '../index.js';
import { tinyflagExpress } from '../express.js';
import { tinyflagFastify } from '../fastify.js';
import { tinyflagHono } from '../hono.js';
import type { TinyFlag } from 'tinyflag';

function createMockInstance(): TinyFlag {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    getVariant: vi.fn().mockReturnValue('control'),
    getAllFlags: vi.fn().mockReturnValue({
      'test-flag': { enabled: true, variant: 'control' },
    }),
    getFlags: vi.fn().mockReturnValue({}),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as TinyFlag;
}

describe('evaluateForContext', () => {
  it('returns EvaluatedFlags with isEnabled/getVariant/all', () => {
    const instance = createMockInstance();
    const flags = evaluateForContext(instance);

    expect(flags.isEnabled('test-flag')).toBe(true);
    expect(flags.getVariant('test-flag')).toBe('control');
    expect(flags.all()).toEqual({ 'test-flag': { enabled: true, variant: 'control' } });
  });

  it('passes context to instance methods', () => {
    const instance = createMockInstance();
    const ctx = { userId: 'u-1', plan: 'pro' };
    const flags = evaluateForContext(instance, ctx);

    flags.isEnabled('f');
    expect(instance.isEnabled).toHaveBeenCalledWith('f', ctx);

    flags.getVariant('f');
    expect(instance.getVariant).toHaveBeenCalledWith('f', ctx);

    flags.all();
    expect(instance.getAllFlags).toHaveBeenCalledWith(ctx);
  });

  it('works without tracing enabled', () => {
    const instance = createMockInstance();
    const flags = evaluateForContext(instance, undefined, false);
    expect(flags.isEnabled('f')).toBe(true);
    expect(flags.getVariant('f')).toBe('control');
  });

  it('works with tracing enabled', () => {
    const instance = createMockInstance();
    const flags = evaluateForContext(instance, undefined, true);
    expect(flags.isEnabled('f')).toBe(true);
    expect(flags.getVariant('f')).toBe('control');
  });

  it('tracing calls __OTEL_TRACER__ when available', () => {
    const mockSpan = { end: vi.fn() };
    const mockTracer = { startSpan: vi.fn().mockReturnValue(mockSpan) };
    (globalThis as any).__OTEL_TRACER__ = mockTracer;

    try {
      const instance = createMockInstance();
      const flags = evaluateForContext(instance, undefined, true);
      flags.isEnabled('my-flag');
      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'tinyflag.isEnabled',
        expect.objectContaining({ attributes: { 'tinyflag.flag': 'my-flag' } }),
      );
      expect(mockSpan.end).toHaveBeenCalled();

      mockTracer.startSpan.mockClear();
      mockSpan.end.mockClear();
      flags.getVariant('my-flag');
      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'tinyflag.getVariant',
        expect.objectContaining({ attributes: { 'tinyflag.flag': 'my-flag' } }),
      );
    } finally {
      delete (globalThis as any).__OTEL_TRACER__;
    }
  });

  it('traceSpan handles missing __OTEL_TRACER__ gracefully', () => {
    delete (globalThis as any).__OTEL_TRACER__;
    const instance = createMockInstance();
    const flags = evaluateForContext(instance, undefined, true);
    expect(() => flags.isEnabled('f')).not.toThrow();
  });

  it('traceSpan handles throwing __OTEL_TRACER__ gracefully', () => {
    (globalThis as any).__OTEL_TRACER__ = {
      startSpan: () => { throw new Error('boom'); },
    };
    try {
      const instance = createMockInstance();
      const flags = evaluateForContext(instance, undefined, true);
      expect(() => flags.isEnabled('f')).not.toThrow();
    } finally {
      delete (globalThis as any).__OTEL_TRACER__;
    }
  });
});

describe('tinyflagExpress', () => {
  it('attaches req.flags and calls next()', () => {
    const instance = createMockInstance();
    const middleware = tinyflagExpress({ instance });

    const req: any = {};
    const res: any = {};
    const next = vi.fn();

    middleware(req, res, next);
    expect(req.flags).toBeDefined();
    expect(req.flags.isEnabled('test-flag')).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('uses contextFromRequest when provided', () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn().mockReturnValue({ userId: 'u-42' });
    const middleware = tinyflagExpress({ instance, contextFromRequest });

    const req: any = { user: { id: 'u-42' } };
    const res: any = {};
    const next = vi.fn();

    middleware(req, res, next);
    expect(contextFromRequest).toHaveBeenCalledWith(req);
    expect(req.flags).toBeDefined();
  });

  it('works without contextFromRequest', () => {
    const instance = createMockInstance();
    const middleware = tinyflagExpress({ instance });

    const req: any = {};
    const res: any = {};
    const next = vi.fn();

    middleware(req, res, next);
    expect(instance.isEnabled).not.toHaveBeenCalled();
    expect(req.flags).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it('passes tracing option through', () => {
    const instance = createMockInstance();
    const middleware = tinyflagExpress({ instance, tracing: true });

    const req: any = {};
    const res: any = {};
    const next = vi.fn();

    middleware(req, res, next);
    // isEnabled with tracing should still work
    expect(req.flags.isEnabled('test-flag')).toBe(true);
  });
});

describe('tinyflagFastify', () => {
  it('decorates request and adds onRequest hook', () => {
    const instance = createMockInstance();
    const hooks: Record<string, Function> = {};
    const fastify = {
      decorateRequest: vi.fn(),
      addHook: vi.fn((name: string, handler: Function) => {
        hooks[name] = handler;
      }),
    };
    const done = vi.fn();

    tinyflagFastify(fastify, { instance }, done);

    expect(fastify.decorateRequest).toHaveBeenCalledWith('flags', null);
    expect(fastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    expect(done).toHaveBeenCalled();

    // Simulate a request
    const request: any = {};
    const reply: any = {};
    const hookDone = vi.fn();
    hooks['onRequest'](request, reply, hookDone);

    expect(request.flags).toBeDefined();
    expect(request.flags.isEnabled('test-flag')).toBe(true);
    expect(hookDone).toHaveBeenCalled();
  });

  it('uses contextFromRequest in hook', () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn().mockReturnValue({ userId: 'fast-user' });
    const hooks: Record<string, Function> = {};
    const fastify = {
      decorateRequest: vi.fn(),
      addHook: vi.fn((name: string, handler: Function) => {
        hooks[name] = handler;
      }),
    };
    const done = vi.fn();

    tinyflagFastify(fastify, { instance, contextFromRequest }, done);

    const request: any = { raw: {} };
    hooks['onRequest'](request, {}, vi.fn());

    expect(contextFromRequest).toHaveBeenCalledWith(request);
  });
});

describe('tinyflagHono', () => {
  it('sets flags on context and calls next', async () => {
    const instance = createMockInstance();
    const middleware = tinyflagHono({ instance });

    const setValues: Record<string, any> = {};
    const c: any = {
      set: vi.fn((key: string, val: any) => { setValues[key] = val; }),
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(c, next);

    expect(c.set).toHaveBeenCalledWith('flags', expect.any(Object));
    expect(next).toHaveBeenCalled();
    expect(setValues['flags'].isEnabled('test-flag')).toBe(true);
  });

  it('uses contextFromRequest with Hono context', async () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn().mockReturnValue({ userId: 'hono-user' });
    const middleware = tinyflagHono({ instance, contextFromRequest });

    const c: any = { set: vi.fn() };
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(c, next);

    expect(contextFromRequest).toHaveBeenCalledWith(c);
  });
});
