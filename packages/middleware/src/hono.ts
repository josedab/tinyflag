import type { TinyFlagMiddlewareOptions, EvaluatedFlags } from './index.js';
import { evaluateForContext } from './index.js';

/** Minimal Hono context interface needed for middleware. */
interface HonoContext {
  set(key: string, value: unknown): void;
  get(key: string): unknown;
  [key: string]: unknown;
}

/**
 * Hono middleware that attaches flags to the context.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { TinyFlag } from 'tinyflag';
 * import { tinyflagHono } from 'tinyflag-middleware/hono';
 *
 * const ff = new TinyFlag({ source: './flags.yml' });
 * await ff.init();
 *
 * const app = new Hono();
 * app.use(tinyflagHono({
 *   instance: ff,
 *   contextFromRequest: (c) => ({ userId: (c as HonoContext).get('userId') as string }),
 * }));
 *
 * app.get('/', (c) => {
 *   const flags = c.get('flags') as EvaluatedFlags;
 *   if (flags.isEnabled('new-feature')) { ... }
 * });
 * ```
 */
export function tinyflagHono(options: TinyFlagMiddlewareOptions) {
  return async (c: HonoContext, next: () => Promise<void>) => {
    const context = options.contextFromRequest?.(c);
    c.set('flags', evaluateForContext(options.instance, context, options.tracing, options.otelTrace));
    await next();
  };
}

export type { EvaluatedFlags };
