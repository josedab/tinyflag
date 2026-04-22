# Contributing to TinyFlag

Thanks for your interest in contributing to TinyFlag! 🚩

## Development Setup

```bash
git clone https://github.com/your-org/tinyflag.git
cd tinyflag
pnpm install
pnpm -r build
pnpm -r test
```

## Project Structure

```
packages/
  core/       → tinyflag (npm) — flag engine, YAML parser, hashing
  react/      → tinyflag-react — React hooks
  vue/        → tinyflag-vue — Vue composables
  svelte/     → tinyflag-svelte — Svelte stores
  cli/        → tinyflag-cli — CLI tools
  github-action/ → GitHub Action
  dashboard/  → Static HTML dashboard
examples/     → Example apps
docs/         → Documentation
```

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Write or update tests — we target 90%+ coverage
4. Run `pnpm -r build && pnpm -r test` to verify
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` new feature
   - `fix:` bug fix
   - `test:` test changes
   - `docs:` documentation
   - `chore:` tooling/dependencies
6. Open a PR against `main`

## Code Standards

- TypeScript strict mode
- No runtime dependencies in `packages/core`
- Bundle size must stay under 8KB gzipped
- `isEnabled` and `getVariant` must never throw
- All public APIs need JSDoc comments

## Running Tests

```bash
# All tests
pnpm -r test

# Core tests with coverage
cd packages/core && pnpm test:coverage

# Single file
cd packages/core && npx vitest run src/__tests__/evaluator.test.ts
```

## Reporting Issues

- Use GitHub Issues
- Include: TinyFlag version, runtime (Node/Bun/Deno/browser), minimal reproduction
