# Contributing to TinyFlag

Thanks for your interest in contributing to TinyFlag! 🚩

## Development Setup

```bash
git clone https://github.com/josedab/tinyflag.git
cd tinyflag
pnpm install
pnpm -r build
pnpm -r test
```

Run `pnpm doctor` to verify your environment is configured correctly. It checks Node.js ≥18, pnpm installation, built packages, git setup, and husky hooks.

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
4. Run `pnpm -r build && pnpm -r test && pnpm format:check && pnpm -r lint` to verify
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` new feature
   - `fix:` bug fix
   - `test:` test changes
   - `docs:` documentation
   - `chore:` tooling/dependencies
6. Open a PR against `main`

### Git Hooks

Running `pnpm install` automatically sets up [husky](https://typicode.github.io/husky/) git hooks:

- **commitlint** validates your commit messages follow the Conventional Commits format above. Non-conforming commits are rejected.
- **lint-staged** auto-formats staged files with Prettier on commit.

No manual setup is needed — hooks are installed automatically.

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

CI enforces ≥90% line and patch coverage via [Codecov](https://codecov.io/). To check coverage locally before pushing:

```bash
cd packages/core && pnpm test:coverage
```

The coverage report is generated in `packages/core/coverage/`.

## Reporting Issues

- Use GitHub Issues
- Include: TinyFlag version, runtime (Node/Bun/Deno/browser), minimal reproduction

## Creating a New Framework Integration

TinyFlag ships React, Vue, and Svelte bindings. They all follow the same pattern—adapt TinyFlag's core to the framework's reactivity model.

### 1. Scaffold the Package

```bash
mkdir packages/<framework>
```

Create `packages/<framework>/package.json` following the existing bindings:

```jsonc
{
  "name": "tinyflag-<framework>",
  "version": "0.1.0",
  "type": "module",
  "peerDependencies": {
    "<framework>": ">=<minimum-version>",
    "tinyflag": "workspace:*",
  },
  "devDependencies": {
    "<framework>": "^<version>",
    "tinyflag": "workspace:*",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "dev": "vitest --watch",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist",
  },
}
```

Add a `tsconfig.json` and `tsup.config.ts` matching any existing binding (e.g., `packages/react/`).

### 2. Required Exports

Every integration must export:

| Export                  | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| Provider / `provide*`   | Initialize TinyFlag and share it with the tree     |
| `useFlag(name)`         | Returns reactive boolean for a flag                |
| `useVariant(name)`      | Returns reactive string or null for a variant      |
| `useTinyFlagInstance()` | Escape hatch to access the raw `TinyFlag` instance |

### 3. Implementation Checklist

- **Accept a pre-initialized `instance`** — this enables SSR (e.g., Next.js server components, Nuxt plugins, SvelteKit hooks)
- **Accept a `context` object** — user context for targeting / rollout
- **Listen to `'change'` events** — trigger re-renders when flags are reloaded
- **Clean up on unmount** — remove listeners and call `destroy()` if the integration created the instance
- **Never throw** — follow core's convention: `isEnabled` returns `false`, `getVariant` returns `null` on error

### 4. Testing

Add tests in `packages/<framework>/src/__tests__/`. Test at minimum:

- Provider renders children
- `useFlag` returns correct boolean
- `useVariant` returns correct variant
- Throws when used outside the provider
- Re-renders on flag change events

### 5. Add to Workspace

Ensure the package directory is picked up by `pnpm-workspace.yaml` (the existing `packages/*` glob should cover it automatically).
