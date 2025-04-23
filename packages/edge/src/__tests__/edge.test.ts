import { describe, it, expect, vi } from 'vitest';
import { evaluateEdgeFlags, extractContextFromRequest, applyFlagHeaders } from '../index.js';
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

describe('edge middleware', () => {
  it('evaluates flags and generates headers', () => {
    const instance = createMockInstance();
    const request = new Request('https://example.com', {
      headers: { 'x-user-id': 'user-123' },
    });

    const result = evaluateEdgeFlags(request, { instance });
    expect(result.flags['test-flag']).toBeDefined();
    expect(result.headers['x-tinyflag-test-flag']).toBe('1');
    expect(result.headers['x-tinyflag-test-flag-variant']).toBe('control');
  });

  it('extracts context from request headers', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-user-id': 'u-42',
        'x-vercel-ip-country': 'US',
      },
    });

    const ctx = extractContextFromRequest(request);
    expect(ctx.userId).toBe('u-42');
    expect(ctx.country).toBe('US');
  });

  it('extracts context from cookies', () => {
    const request = new Request('https://example.com', {
      headers: { cookie: 'tinyflag-uid=user-99; tinyflag-plan=pro' },
    });

    const ctx = extractContextFromRequest(request);
    expect(ctx.userId).toBe('user-99');
    expect(ctx.plan).toBe('pro');
  });

  it('applies flag headers to response', () => {
    const response = new Response('OK');
    const result = {
      flags: { test: { enabled: true, variant: null } },
      headers: { 'x-tinyflag-test': '1' },
    };

    const newResponse = applyFlagHeaders(response, result);
    expect(newResponse.headers.get('x-tinyflag-test')).toBe('1');
  });

  it('supports custom header prefix', () => {
    const instance = createMockInstance();
    const request = new Request('https://example.com');

    const result = evaluateEdgeFlags(request, { instance, headerPrefix: 'x-ff-' });
    expect(result.headers['x-ff-test-flag']).toBe('1');
  });

  it('evaluates only specified flag names', () => {
    const instance = createMockInstance();
    const request = new Request('https://example.com');

    const result = evaluateEdgeFlags(request, {
      instance,
      flagNames: ['test-flag'],
    });
    expect(instance.isEnabled).toHaveBeenCalledWith('test-flag', expect.any(Object));
    expect(result.flags['test-flag']).toBeDefined();
  });
});
