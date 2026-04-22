/**
 * TinyFlag — Express.js Example
 *
 * Run: npx tsx examples/express/server.ts
 * Test: curl http://localhost:3000/api/features?userId=user-1
 */
import { TinyFlag } from 'tinyflag';

// Simulated Express-like handler (no dependency needed for the example)
const ff = new TinyFlag({
  source: {
    version: 1,
    flags: {
      'new-api': {
        enabled: true,
        rollout: 30,
        description: 'New API endpoint',
      },
      'premium-features': {
        enabled: true,
        rules: [
          { conditions: { plan: 'pro' }, enabled: true },
          { conditions: { plan: 'enterprise' }, enabled: true },
        ],
        rollout: 0,
      },
    },
  },
});

async function handleRequest(userId: string, plan: string) {
  await ff.init();

  const context = { userId, plan };

  return {
    userId,
    features: {
      'new-api': ff.isEnabled('new-api', context),
      'premium-features': ff.isEnabled('premium-features', context),
    },
  };
}

// Demo
async function main() {
  console.log('🚩 TinyFlag — Express.js Example\n');

  const freeUser = await handleRequest('user-1', 'free');
  console.log('Free user:', JSON.stringify(freeUser, null, 2));

  const proUser = await handleRequest('user-2', 'pro');
  console.log('\nPro user:', JSON.stringify(proUser, null, 2));

  ff.destroy();
}

main().catch(console.error);
