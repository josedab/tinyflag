import type { TinyFlagMiddlewareOptions, EvaluatedFlags } from './index.js';
import { evaluateForContext } from './index.js';

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
 *   contextFromRequest: (c) => ({ userId: (c as any).get('userId') }),
 * }));
 *
 * app.get('/', (c) => {
 *   const flags = c.get('flags') as EvaluatedFlags;
 *   if (flags.isEnabled('new-feature')) { ... }
 * });
 * ```
 */
export function tinyflagHono(options: TinyFlagMiddlewareOptions) {
  return async (c: any, next: () => Promise<void>) => {
    const context = options.contextFromRequest?.(c);
    c.set('flags', evaluateForContext(options.instance, context, options.tracing));
    await next();
  };
}

export type { EvaluatedFlags };
