import type { TinyFlagMiddlewareOptions } from './index.js';
import { evaluateForContext } from './index.js';

/**
 * Fastify plugin that decorates request with `flags`.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { TinyFlag } from 'tinyflag';
 * import { tinyflagFastify } from 'tinyflag-middleware/fastify';
 *
 * const ff = new TinyFlag({ source: './flags.yml' });
 * await ff.init();
 *
 * const app = Fastify();
 * app.register(tinyflagFastify, {
 *   instance: ff,
 *   contextFromRequest: (req) => ({ userId: (req as any).user?.id }),
 * });
 *
 * app.get('/', (req, reply) => {
 *   if (req.flags.isEnabled('new-feature')) { ... }
 * });
 * ```
 */
export function tinyflagFastify(
  fastify: any,
  options: TinyFlagMiddlewareOptions,
  done: (err?: Error) => void,
): void {
  fastify.decorateRequest('flags', null);

  fastify.addHook('onRequest', (request: any, _reply: any, hookDone: () => void) => {
    const context = options.contextFromRequest?.(request);
    request.flags = evaluateForContext(options.instance, context, options.tracing);
    hookDone();
  });

  done();
}
