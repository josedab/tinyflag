#!/usr/bin/env node

/**
 * tinyflag doctor — checks that the development environment is set up correctly.
 */

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { resolve } = require('path');

const ROOT = resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`  ✅ ${label}`);
      passed++;
    } else {
      console.log(`  ❌ ${label} — ${result}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ❌ ${label} — ${err.message}`);
    failed++;
  }
}

function cmd(command) {
  return execSync(command, {
    encoding: 'utf-8',
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

console.log('\n🩺 TinyFlag Doctor\n');

// Node.js version
console.log('Environment:');
check('Node.js >= 18', () => {
  const version = process.versions.node;
  const major = parseInt(version.split('.')[0], 10);
  if (major < 18) return `found v${version}, need >= 18`;
  console.log(`     Node.js v${version}`);
  return true;
});

check('pnpm installed', () => {
  const version = cmd('pnpm --version');
  console.log(`     pnpm v${version}`);
  return true;
});

check('node_modules present', () => {
  if (!existsSync(resolve(ROOT, 'node_modules'))) return 'run "pnpm install"';
  return true;
});

// Built packages
console.log('\nBuilt packages:');
const packages = [
  { name: 'core', dist: 'packages/core/dist/index.js' },
  { name: 'cli', dist: 'packages/cli/dist/index.js' },
  { name: 'react', dist: 'packages/react/dist/index.js' },
  { name: 'vue', dist: 'packages/vue/dist/index.js' },
  { name: 'svelte', dist: 'packages/svelte/dist/index.js' },
  { name: 'server', dist: 'packages/server/dist/index.js' },
  { name: 'middleware', dist: 'packages/middleware/dist/index.js' },
  { name: 'edge', dist: 'packages/edge/dist/index.js' },
  { name: 'analytics', dist: 'packages/analytics/dist/index.js' },
  { name: 'otel', dist: 'packages/otel/dist/index.js' },
  { name: 'openfeature', dist: 'packages/openfeature/dist/index.js' },
  { name: 'react-native', dist: 'packages/react-native/dist/index.js' },
];

for (const pkg of packages) {
  check(`${pkg.name} built`, () => {
    if (!existsSync(resolve(ROOT, pkg.dist))) return 'run "pnpm -r build"';
    return true;
  });
}

// Git
console.log('\nGit:');
check('git repository', () => {
  cmd('git rev-parse --git-dir');
  return true;
});

check('husky hooks installed', () => {
  if (!existsSync(resolve(ROOT, '.husky'))) return '.husky directory not found';
  return true;
});

// Summary
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  console.log('Run "pnpm install && pnpm -r build" to fix most issues.\n');
  process.exit(1);
}
