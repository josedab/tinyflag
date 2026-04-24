#!/usr/bin/env node

const commands = {
  // Development
  build: 'Build all packages (pnpm -r build)',
  dev: 'Start dev/watch mode for all packages in parallel',
  'dev:core': 'Watch-mode tests for packages/core only',

  // Testing
  test: 'Run tests across all packages',
  'test:watch': 'Watch-mode tests across all packages in parallel',
  'test:coverage': 'Run core tests with coverage report',

  // Code quality
  lint: 'Type-check all packages and check formatting',
  typecheck: 'Type-check all packages (tsc --noEmit)',
  format: 'Auto-format all files with Prettier',
  'format:check': 'Check formatting without writing changes',

  // CLI tools
  validate: 'Validate example flags file (examples/flags.yml)',
  doctor: 'Check dev environment (Node, pnpm, git, husky)',

  // Release
  changeset: 'Create a changeset for versioning',
  'version-packages': 'Bump versions from pending changesets',
  release: 'Build all packages and publish to npm',

  // Maintenance
  clean: 'Remove dist/ from all packages',
  prepare: 'Install husky git hooks (runs on pnpm install)',
};

console.log('\n📋 TinyFlag Monorepo — Available Scripts\n');
console.log('Usage: pnpm <script>\n');

const maxLen = Math.max(...Object.keys(commands).map((k) => k.length));
for (const [cmd, desc] of Object.entries(commands)) {
  console.log(`  ${cmd.padEnd(maxLen + 2)} ${desc}`);
}

console.log('\nFor single-package commands, use: pnpm --filter <package-name> <script>');
console.log('Example: pnpm --filter tinyflag-react build\n');
