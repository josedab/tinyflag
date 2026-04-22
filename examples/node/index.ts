/**
 * TinyFlag — Node.js Example
 *
 * Run: npx tsx examples/node/index.ts
 */
import { TinyFlag } from 'tinyflag';

async function main() {
  const ff = new TinyFlag({
    source: {
      version: 1,
      flags: {
        'new-checkout': {
          enabled: true,
          rollout: 50,
          description: 'New checkout flow',
          variants: [
            { name: 'control', weight: 50 },
            { name: 'new-flow', weight: 50 },
          ],
        },
        'dark-mode': {
          enabled: false,
          description: 'Dark mode toggle',
        },
        'beta-features': {
          enabled: true,
          description: 'Beta for company emails',
          rules: [
            { conditions: { email: '*@company.com' }, enabled: true },
          ],
          rollout: 0,
        },
      },
    },
  });

  await ff.init();

  // Listen for errors
  ff.on('error', (e) => console.warn(`⚠️  ${e.code}: ${e.message}`));

  // Simulate different users
  const users = [
    { userId: 'user-1', email: 'alice@example.com', plan: 'free' },
    { userId: 'user-2', email: 'bob@company.com', plan: 'pro' },
    { userId: 'user-3', email: 'charlie@example.com', plan: 'pro' },
  ];

  console.log('🚩 TinyFlag — Node.js Example\n');

  for (const user of users) {
    console.log(`User: ${user.userId} (${user.email})`);
    console.log(`  new-checkout: ${ff.isEnabled('new-checkout', user)}`);
    console.log(`  new-checkout variant: ${ff.getVariant('new-checkout', user)}`);
    console.log(`  dark-mode: ${ff.isEnabled('dark-mode', user)}`);
    console.log(`  beta-features: ${ff.isEnabled('beta-features', user)}`);
    console.log();
  }

  // Unknown flag returns false
  console.log(`unknown-flag: ${ff.isEnabled('unknown-flag')}`);

  ff.destroy();
}

main().catch(console.error);
