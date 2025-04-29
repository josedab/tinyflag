import type { TinyFlagMiddlewareOptions, EvaluatedFlags } from './index.js';
import { evaluateForContext } from './index.js';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Express middleware that attaches `req.flags` with pre-evaluated flags.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { TinyFlag } from 'tinyflag';
 * import { tinyflagExpress } from 'tinyflag-middleware/express';
 *
 * const ff = new TinyFlag({ source: './flags.yml' });
 * await ff.init();
 *
 * const app = express();
 * app.use(tinyflagExpress({
 *   instance: ff,
 *   contextFromRequest: (req) => ({ userId: req.user?.id, plan: req.user?.plan }),
 * }));
 *
 * app.get('/', (req, res) => {
 *   if (req.flags.isEnabled('new-feature')) { ... }
 * });
 * ```
 */
export function tinyflagExpress(options: TinyFlagMiddlewareOptions) {
  return (req: IncomingMessage & Record<string, unknown>, _res: ServerResponse, next: (...args: unknown[]) => void) => {
    const context = options.contextFromRequest?.(req);
    (req as IncomingMessage & { flags: EvaluatedFlags }).flags = evaluateForContext(options.instance, context, options.tracing);
    next();
  };
}

// Augment Express Request type
declare global {
  namespace Express {
    interface Request {
      flags: EvaluatedFlags;
    }
  }
}
