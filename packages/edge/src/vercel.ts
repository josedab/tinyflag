/**
 * Vercel Edge Middleware adapter for TinyFlag.
 *
 * Intercepts requests, evaluates flags from headers/cookies,
 * and injects x-tinyflag-* response headers with A/B routing.
 */
import type { TinyFlag, UserContext } from 'tinyflag';
import { evaluateEdgeFlags, extractContextFromRequest, applyFlagHeaders } from './index.js';
import type { EdgeFlagOptions } from './index.js';

export interface VercelEdgeOptions extends EdgeFlagOptions {
  /** Route rewrites based on variant assignments: flagName -> { variant: path } */
  rewrites?: Record<string, Record<string, string>>;
}

/**
 * Create a Vercel Edge Middleware handler.
 *
 * @example
 * ```ts
 * import { createVercelMiddleware } from 'tinyflag-edge/vercel';
 *
 * export default createVercelMiddleware({
 *   instance: ff,
 *   rewrites: { 'new-checkout': { 'new-flow': '/checkout-v2' } },
 * });
 * ```
 */
export function createVercelMiddleware(options: VercelEdgeOptions) {
  return async function middleware(request: Request): Promise<Response> {
    const result = evaluateEdgeFlags(request, options);

    // Check for rewrites based on variant
    if (options.rewrites) {
      for (const [flagName, variantPaths] of Object.entries(options.rewrites)) {
        const flagResult = result.flags[flagName];
        if (flagResult?.variant && variantPaths[flagResult.variant]) {
          const url = new URL(request.url);
          url.pathname = variantPaths[flagResult.variant];
          const rewriteResponse = new Response(null, {
            status: 200,
            headers: {
              'x-middleware-rewrite': url.toString(),
              ...result.headers,
            },
          });
          return rewriteResponse;
        }
      }
    }

    // No rewrite — pass through with flag headers
    const response = new Response(null, { status: 200, headers: result.headers });
    return response;
  };
}

export { evaluateEdgeFlags, extractContextFromRequest, applyFlagHeaders };
export type { EdgeFlagOptions, TinyFlag, UserContext };
