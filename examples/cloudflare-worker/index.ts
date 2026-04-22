/**
 * TinyFlag — Cloudflare Worker Example
 *
 * Deploy to Cloudflare Workers. Flags are defined inline
 * since Workers don't have filesystem access.
 */
import { TinyFlag } from 'tinyflag';

const ff = new TinyFlag({
  source: {
    version: 1,
    flags: {
      'new-landing': {
        enabled: true,
        rollout: 25,
        description: 'New landing page design',
        variants: [
          { name: 'control', weight: 75 },
          { name: 'redesign', weight: 25 },
        ],
      },
      'maintenance-mode': {
        enabled: false,
        description: 'Enable maintenance page',
      },
    },
  },
});

export default {
  async fetch(request: Request): Promise<Response> {
    await ff.init();

    const url = new URL(request.url);

    // Check maintenance mode (no user context needed)
    if (ff.isEnabled('maintenance-mode')) {
      return new Response('🔧 Under maintenance. Please try again later.', {
        status: 503,
      });
    }

    // Get user ID from header or query param
    const userId = url.searchParams.get('userId') ?? 'anonymous';
    const context = { userId };

    // Get landing page variant
    const variant = ff.getVariant('new-landing', context);

    return Response.json({
      message: `Hello from TinyFlag on Cloudflare Workers!`,
      userId,
      landingVariant: variant,
      flags: {
        'new-landing': ff.isEnabled('new-landing', context),
        'maintenance-mode': ff.isEnabled('maintenance-mode'),
      },
    });
  },
};
