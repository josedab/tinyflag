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

  it('tracing calls otelTrace when provided', () => {
    const mockSpan = { end: vi.fn() };
    const mockTracer = { startSpan: vi.fn().mockReturnValue(mockSpan) };
    const otelTrace = { getTracer: vi.fn().mockReturnValue(mockTracer) };

    const instance = createMockInstance();
    const flags = evaluateForContext(instance, undefined, true, otelTrace);
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
  });

  it('traceSpan handles missing otelTrace gracefully', () => {
    const instance = createMockInstance();
    const flags = evaluateForContext(instance, undefined, true);
    expect(() => flags.isEnabled('f')).not.toThrow();
  });

  it('traceSpan handles throwing otelTrace gracefully', () => {
    const otelTrace = {
      getTracer: () => ({
        startSpan: () => {
          throw new Error('boom');
        },
      }),
    };
    const instance = createMockInstance();
    const flags = evaluateForContext(instance, undefined, true, otelTrace);
    expect(() => flags.isEnabled('f')).not.toThrow();
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

  it('contextFromRequest throwing → error propagated to next(err)', () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn(() => {
      throw new Error('context extraction failed');
    });
    const middleware = tinyflagExpress({ instance, contextFromRequest });

    const req: any = {};
    const res: any = {};
    const next = vi.fn();

    expect(() => middleware(req, res, next)).toThrow('context extraction failed');
  });

  it('handles request with missing fields (no headers, no body)', () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn().mockReturnValue(undefined);
    const middleware = tinyflagExpress({ instance, contextFromRequest });

    const req: any = {};
    const res: any = {};
    const next = vi.fn();

    middleware(req, res, next);
    expect(req.flags).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it('null context return from contextFromRequest', () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn().mockReturnValue(null);
    const middleware = tinyflagExpress({ instance, contextFromRequest });

    const req: any = {};
    const res: any = {};
    const next = vi.fn();

    middleware(req, res, next);
    expect(req.flags).toBeDefined();
    expect(next).toHaveBeenCalled();
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

  it('contextFromRequest throwing → hookDone still called with error', () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn(() => {
      throw new Error('fastify ctx error');
    });
    const hooks: Record<string, Function> = {};
    const fastify = {
      decorateRequest: vi.fn(),
      addHook: vi.fn((name: string, handler: Function) => {
        hooks[name] = handler;
      }),
    };
    const done = vi.fn();

    tinyflagFastify(fastify, { instance, contextFromRequest }, done);
    expect(done).toHaveBeenCalled();

    const request: any = {};
    const hookDone = vi.fn();
    expect(() => hooks['onRequest'](request, {}, hookDone)).toThrow('fastify ctx error');
  });

  it('handles request with missing fields', () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn().mockReturnValue(null);
    const hooks: Record<string, Function> = {};
    const fastify = {
      decorateRequest: vi.fn(),
      addHook: vi.fn((name: string, handler: Function) => {
        hooks[name] = handler;
      }),
    };
    const done = vi.fn();

    tinyflagFastify(fastify, { instance, contextFromRequest }, done);

    const request: any = {};
    const hookDone = vi.fn();
    hooks['onRequest'](request, {}, hookDone);
    expect(request.flags).toBeDefined();
    expect(hookDone).toHaveBeenCalled();
  });
});

describe('tinyflagHono', () => {
  it('sets flags on context and calls next', async () => {
    const instance = createMockInstance();
    const middleware = tinyflagHono({ instance });

    const setValues: Record<string, any> = {};
    const c: any = {
      set: vi.fn((key: string, val: any) => {
        setValues[key] = val;
      }),
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

  it('contextFromRequest throwing → error propagated', async () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn(() => {
      throw new Error('hono ctx error');
    });
    const middleware = tinyflagHono({ instance, contextFromRequest });

    const c: any = { set: vi.fn() };
    const next = vi.fn().mockResolvedValue(undefined);

    await expect(middleware(c, next)).rejects.toThrow('hono ctx error');
  });

  it('next() rejection → error propagated', async () => {
    const instance = createMockInstance();
    const middleware = tinyflagHono({ instance });

    const c: any = { set: vi.fn() };
    const next = vi.fn().mockRejectedValue(new Error('downstream error'));

    await expect(middleware(c, next)).rejects.toThrow('downstream error');
  });

  it('handles null context return', async () => {
    const instance = createMockInstance();
    const contextFromRequest = vi.fn().mockReturnValue(null);
    const middleware = tinyflagHono({ instance, contextFromRequest });

    const setValues: Record<string, any> = {};
    const c: any = {
      set: vi.fn((k: string, v: any) => {
        setValues[k] = v;
      }),
    };
    const next = vi.fn().mockResolvedValue(undefined);

    await middleware(c, next);
    expect(setValues['flags']).toBeDefined();
    expect(next).toHaveBeenCalled();
  });
});
