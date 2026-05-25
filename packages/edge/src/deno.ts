/**
 * Deno Deploy adapter for TinyFlag.
 *
 * Provides a handler compatible with Deno.serve() / std/http.
 */
import type { TinyFlag, UserContext } from 'tinyflag';
import { evaluateEdgeFlags, extractContextFromRequest, applyFlagHeaders } from './index.js';
import type { EdgeFlagOptions } from './index.js';

export interface DenoOptions extends EdgeFlagOptions {
  /** Handler to call after flag evaluation. Receives the request and flag result. */
  handler?: (
    request: Request,
    flags: Record<string, { enabled: boolean; variant: string | null }>,
  ) => Response | Promise<Response>;
}

/**
 * Create a Deno Deploy request handler with TinyFlag evaluation.
 *
 * @example
 * ```ts
 * import { createDenoHandler } from 'tinyflag-edge/deno';
 *
 * Deno.serve(createDenoHandler({
 *   instance: ff,
 *   handler: (req, flags) => new Response('Hello'),
 * }));
 * ```
 */
export function createDenoHandler(
  options: DenoOptions,
): (request: Request) => Response | Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const result = evaluateEdgeFlags(request, options);

    if (options.handler) {
      const response = await options.handler(request, result.flags);
      return applyFlagHeaders(response, result);
    }

    // Default: return flags as JSON
    return new Response(JSON.stringify(result.flags), {
      headers: {
        'Content-Type': 'application/json',
        ...result.headers,
      },
    });
  };
}

export { evaluateEdgeFlags, extractContextFromRequest, applyFlagHeaders };
export type { EdgeFlagOptions, TinyFlag, UserContext };
