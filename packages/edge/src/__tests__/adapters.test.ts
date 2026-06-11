import { describe, it, expect, vi } from 'vitest';
import { createVercelMiddleware } from '../vercel.js';
import { handleRequest } from '../cloudflare.js';
import { createDenoHandler } from '../deno.js';
import { extractContextFromRequest, evaluateEdgeFlags } from '../index.js';
import type { TinyFlag } from 'tinyflag';

function createMockInstance(overrides?: Partial<Record<string, any>>): TinyFlag {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    getVariant: vi.fn().mockReturnValue('new-flow'),
    getAllFlags: vi.fn().mockReturnValue({
      'test-flag': { enabled: true, variant: 'new-flow' },
      'other-flag': { enabled: false, variant: null },
    }),
    getFlags: vi.fn().mockReturnValue({}),
    on: vi.fn(),
    off: vi.fn(),
    ...overrides,
  } as unknown as TinyFlag;
}

describe('createVercelMiddleware', () => {
  it('returns a pass-through Response with flag headers', async () => {
    const instance = createMockInstance();
    const middleware = createVercelMiddleware({ instance });
    const request = new Request('https://example.com/page');

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-tinyflag-test-flag')).toBe('1');
    expect(response.headers.get('x-tinyflag-other-flag')).toBe('0');
  });

  it('rewrites URL on variant match', async () => {
    const instance = createMockInstance();
    const middleware = createVercelMiddleware({
      instance,
      rewrites: {
        'test-flag': { 'new-flow': '/checkout-v2' },
      },
    });

    const request = new Request('https://example.com/checkout');
    const response = await middleware(request);

    expect(response.headers.get('x-middleware-rewrite')).toContain('/checkout-v2');
  });

  it('does not rewrite when variant does not match rewrite map', async () => {
    const instance = createMockInstance({
      getVariant: vi.fn().mockReturnValue('control'),
      getAllFlags: vi.fn().mockReturnValue({
        'test-flag': { enabled: true, variant: 'control' },
      }),
    });

    const middleware = createVercelMiddleware({
      instance,
      rewrites: { 'test-flag': { 'new-flow': '/v2' } },
    });

    const request = new Request('https://example.com/page');
    const response = await middleware(request);

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('does not rewrite when flag has no variant', async () => {
    const instance = createMockInstance({
      getVariant: vi.fn().mockReturnValue(null),
      getAllFlags: vi.fn().mockReturnValue({
        'test-flag': { enabled: true, variant: null },
      }),
    });

    const middleware = createVercelMiddleware({
      instance,
      rewrites: { 'test-flag': { 'new-flow': '/v2' } },
    });

    const request = new Request('https://example.com/page');
    const response = await middleware(request);

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });
});

describe('handleRequest (Cloudflare)', () => {
  it('returns JSON flags when no origin is specified', async () => {
    const instance = createMockInstance();
    const request = new Request('https://example.com/api');

    const response = await handleRequest(request, { instance });

    expect(response.headers.get('Content-Type')).toBe('application/json');
    const body = await response.json();
    expect(body['test-flag']).toBeDefined();
    expect(body['test-flag'].enabled).toBe(true);
  });

  it('proxies to origin when origin is specified', async () => {
    const instance = createMockInstance();
    const originBody = '<html>OK</html>';

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(originBody, {
        headers: { 'content-type': 'text/html' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    try {
      const request = new Request('https://cdn.example.com/page');
      const response = await handleRequest(request, {
        instance,
        origin: 'https://origin.example.com',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchedUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchedUrl).toContain('origin.example.com');
      expect(response.headers.get('x-tinyflag-test-flag')).toBe('1');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('attaches x-tinyflag-rewrites header for HTML with matching rules', async () => {
    const instance = createMockInstance();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<html></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    try {
      const request = new Request('https://cdn.example.com/page');
      const response = await handleRequest(request, {
        instance,
        origin: 'https://origin.example.com',
        htmlRewriteRules: [
          {
            selector: '#cta',
            flagName: 'test-flag',
            variants: { 'new-flow': '<button>New CTA</button>' },
          },
        ],
      });

      const rewrites = response.headers.get('x-tinyflag-rewrites');
      expect(rewrites).toBeTruthy();
      const parsed = JSON.parse(rewrites!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].selector).toBe('#cta');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('filters htmlRewriteRules with no matching variant', async () => {
    const instance = createMockInstance({
      getVariant: vi.fn().mockReturnValue(null),
      getAllFlags: vi.fn().mockReturnValue({
        'test-flag': { enabled: true, variant: null },
      }),
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response('<html></html>', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    try {
      const request = new Request('https://cdn.example.com/page');
      const response = await handleRequest(request, {
        instance,
        origin: 'https://origin.example.com',
        htmlRewriteRules: [
          {
            selector: '#cta',
            flagName: 'test-flag',
            variants: { 'new-flow': '<button>New</button>' },
          },
        ],
      });

      const rewrites = response.headers.get('x-tinyflag-rewrites');
      expect(rewrites).toBeTruthy();
      expect(JSON.parse(rewrites!)).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('createDenoHandler', () => {
  it('returns flags as JSON by default', async () => {
    const instance = createMockInstance();
    const handler = createDenoHandler({ instance });
    const request = new Request('https://example.com/flags');

    const response = await handler(request);

    expect(response.headers.get('Content-Type')).toBe('application/json');
    const body = await response.json();
    expect(body['test-flag'].enabled).toBe(true);
  });

  it('delegates to custom handler when provided', async () => {
    const instance = createMockInstance();
    const customHandler = vi.fn().mockReturnValue(new Response('Custom'));
    const handler = createDenoHandler({ instance, handler: customHandler });

    const request = new Request('https://example.com/flags');
    const response = await handler(request);

    expect(customHandler).toHaveBeenCalledWith(request, expect.any(Object));
    expect(response.headers.get('x-tinyflag-test-flag')).toBe('1');
  });

  it('applies flag headers to custom handler response', async () => {
    const instance = createMockInstance();
    const customHandler = vi.fn().mockReturnValue(
      new Response('OK', { headers: { 'x-custom': 'yes' } }),
    );
    const handler = createDenoHandler({ instance, handler: customHandler });

    const request = new Request('https://example.com');
    const response = await handler(request);

    expect(response.headers.get('x-custom')).toBe('yes');
    expect(response.headers.get('x-tinyflag-test-flag')).toBe('1');
  });
});

describe('edge context extraction edge cases', () => {
  it('returns empty context for request with no headers or cookies', () => {
    const request = new Request('https://example.com');
    const ctx = extractContextFromRequest(request);
    expect(ctx.userId).toBeUndefined();
    expect(ctx.plan).toBeUndefined();
    expect(ctx.country).toBeUndefined();
  });

  it('extracts userId from x-tinyflag-user-id header', () => {
    const request = new Request('https://example.com', {
      headers: { 'x-tinyflag-user-id': 'u-alt' },
    });
    const ctx = extractContextFromRequest(request);
    expect(ctx.userId).toBe('u-alt');
  });

  it('extracts country from cf-ipcountry header', () => {
    const request = new Request('https://example.com', {
      headers: { 'cf-ipcountry': 'DE' },
    });
    const ctx = extractContextFromRequest(request);
    expect(ctx.country).toBe('DE');
  });

  it('cookie userId overrides header userId', () => {
    const request = new Request('https://example.com', {
      headers: {
        'x-user-id': 'header-user',
        'cookie': 'tinyflag-uid=cookie-user',
      },
    });
    const ctx = extractContextFromRequest(request);
    expect(ctx.userId).toBe('cookie-user');
  });
});

describe('variant header handling', () => {
  it('does not set variant header when variant is null', () => {
    const instance = createMockInstance({
      getVariant: vi.fn().mockReturnValue(null),
      getAllFlags: vi.fn().mockReturnValue({
        'test-flag': { enabled: true, variant: null },
      }),
    });

    const request = new Request('https://example.com');
    const result = evaluateEdgeFlags(request, { instance });

    expect(result.headers['x-tinyflag-test-flag']).toBe('1');
    expect(result.headers['x-tinyflag-test-flag-variant']).toBeUndefined();
  });
});

describe('Cloudflare adapter edge cases', () => {
  it('JSON response includes flag headers when no origin', async () => {
    const instance = createMockInstance();
    const request = new Request('https://example.com/api', {
      headers: { 'x-user-id': 'u-1' },
    });

    const response = await handleRequest(request, { instance });
    expect(response.headers.get('x-tinyflag-test-flag')).toBe('1');
  });

  it('skips htmlRewriteRules for non-HTML responses', async () => {
    const instance = createMockInstance();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{"data":true}', {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    try {
      const request = new Request('https://cdn.example.com/api');
      const response = await handleRequest(request, {
        instance,
        origin: 'https://origin.example.com',
        htmlRewriteRules: [
          { selector: '#cta', flagName: 'test-flag', variants: { 'new-flow': '<b>CTA</b>' } },
        ],
      });

      expect(response.headers.get('x-tinyflag-rewrites')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Vercel middleware edge cases', () => {
  it('passes flag headers even without rewrites config', async () => {
    const instance = createMockInstance();
    const middleware = createVercelMiddleware({ instance });
    const request = new Request('https://example.com/page');

    const response = await middleware(request);
    expect(response.headers.get('x-tinyflag-test-flag')).toBe('1');
    expect(response.headers.get('x-tinyflag-test-flag-variant')).toBe('new-flow');
  });

  it('includes flag headers on rewrite response', async () => {
    const instance = createMockInstance();
    const middleware = createVercelMiddleware({
      instance,
      rewrites: { 'test-flag': { 'new-flow': '/checkout-v2' } },
    });
    const request = new Request('https://example.com/checkout');
    const response = await middleware(request);

    expect(response.headers.get('x-tinyflag-test-flag')).toBe('1');
    expect(response.headers.get('x-middleware-rewrite')).toContain('/checkout-v2');
  });
});

describe('Deno handler edge cases', () => {
  it('default handler includes flag headers', async () => {
    const instance = createMockInstance();
    const handler = createDenoHandler({ instance });
    const request = new Request('https://example.com');
    const response = await handler(request);

    expect(response.headers.get('x-tinyflag-test-flag')).toBe('1');
    expect(response.headers.get('x-tinyflag-test-flag-variant')).toBe('new-flow');
  });
});
