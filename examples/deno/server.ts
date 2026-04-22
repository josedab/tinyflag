/**
 * TinyFlag — Deno Example
 *
 * Run: deno run --allow-net examples/deno/server.ts
 */
import { TinyFlag } from 'tinyflag';

const ff = new TinyFlag({
  source: {
    version: 1,
    flags: {
      'new-feature': {
        enabled: true,
        rollout: 50,
        description: 'A/B test for new feature',
        variants: [
          { name: 'control', weight: 50 },
          { name: 'experiment', weight: 50 },
        ],
      },
      'geo-feature': {
        enabled: true,
        rules: [
          { conditions: { country: { $in: ['US', 'CA', 'UK'] } }, enabled: true },
        ],
        rollout: 0,
      },
    },
  },
});

await ff.init();

console.log('🚩 TinyFlag — Deno Example\n');

const users = [
  { userId: 'deno-user-1', country: 'US' },
  { userId: 'deno-user-2', country: 'JP' },
  { userId: 'deno-user-3', country: 'CA' },
];

for (const user of users) {
  console.log(`User: ${user.userId} (${user.country})`);
  console.log(`  new-feature: ${ff.isEnabled('new-feature', user)}`);
  console.log(`  new-feature variant: ${ff.getVariant('new-feature', user)}`);
  console.log(`  geo-feature: ${ff.isEnabled('geo-feature', user)}`);
  console.log();
}

ff.destroy();
