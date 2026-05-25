/**
 * Cloudflare Workers adapter for TinyFlag.
 *
 * Provides handleRequest() for Workers with optional HTMLRewriter
 * for DOM-level A/B testing without client JavaScript.
 */
import type { TinyFlag, UserContext } from 'tinyflag';
import { evaluateEdgeFlags, extractContextFromRequest, applyFlagHeaders } from './index.js';
import type { EdgeFlagOptions } from './index.js';

export interface CloudflareOptions extends EdgeFlagOptions {
  /** Origin URL to proxy to (for Workers that sit in front of an origin). */
  origin?: string;
  /** DOM-level A/B test rules: selector -> { flagName, variants: { variantName: html } } */
  htmlRewriteRules?: Array<{
    selector: string;
    flagName: string;
    variants: Record<string, string>;
  }>;
}

/**
 * Handle a Cloudflare Worker request with TinyFlag evaluation.
 *
 * @example
 * ```ts
 * import { handleRequest } from 'tinyflag-edge/cloudflare';
 *
 * export default {
 *   async fetch(request) {
 *     return handleRequest(request, { instance: ff, origin: 'https://example.com' });
 *   }
 * };
 * ```
 */
export async function handleRequest(
  request: Request,
  options: CloudflareOptions,
): Promise<Response> {
  const result = evaluateEdgeFlags(request, options);

  // If no origin, return flag evaluation as JSON
  if (!options.origin) {
    return new Response(JSON.stringify(result.flags), {
      headers: {
        'Content-Type': 'application/json',
        ...result.headers,
      },
    });
  }

  // Proxy to origin
  const url = new URL(request.url);
  url.hostname = new URL(options.origin).hostname;
  url.protocol = new URL(options.origin).protocol;

  const originResponse = await fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
  });

  // Apply flag headers to origin response
  let response = applyFlagHeaders(originResponse, result);

  // DOM-level A/B testing via HTMLRewriter pattern
  // Note: Actual HTMLRewriter is a Cloudflare runtime API.
  // This provides the rewrite rules structure for use with it.
  if (options.htmlRewriteRules && response.headers.get('content-type')?.includes('text/html')) {
    // In a real Cloudflare Worker, you'd do:
    // response = new HTMLRewriter().on(selector, handler).transform(response);
    // Here we attach the rewrite config as a header for instrumentation
    response.headers.set(
      'x-tinyflag-rewrites',
      JSON.stringify(
        options.htmlRewriteRules
          .filter((rule) => {
            const flagResult = result.flags[rule.flagName];
            return flagResult?.variant && rule.variants[flagResult.variant];
          })
          .map((rule) => ({
            selector: rule.selector,
            html: rule.variants[result.flags[rule.flagName]?.variant ?? ''],
          })),
      ),
    );
  }

  return response;
}

export { evaluateEdgeFlags, extractContextFromRequest, applyFlagHeaders };
export type { EdgeFlagOptions, TinyFlag, UserContext };
