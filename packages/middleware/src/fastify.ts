import type { TinyFlagMiddlewareOptions } from './index.js';
import { evaluateForContext } from './index.js';
import type { IncomingMessage } from 'http';

/** Minimal Fastify instance interface needed for plugin registration. */
interface FastifyInstance {
  decorateRequest(property: string, value: unknown): void;
  addHook(name: string, handler: (request: IncomingMessage & Record<string, unknown>, reply: unknown, done: () => void) => void): void;
}

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
  fastify: FastifyInstance,
  options: TinyFlagMiddlewareOptions,
  done: (err?: Error) => void,
): void {
  fastify.decorateRequest('flags', null);

  fastify.addHook('onRequest', (request: IncomingMessage & Record<string, unknown>, _reply: unknown, hookDone: () => void) => {
    const context = options.contextFromRequest?.(request);
    (request as IncomingMessage & Record<string, unknown>).flags = evaluateForContext(options.instance, context, options.tracing, options.otelTrace);
    hookDone();
  });

  done();
}
