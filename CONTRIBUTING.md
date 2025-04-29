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

No environment variables are required for development. All packages work with default settings out of the box.

## Project Structure

```
packages/
  core/              → tinyflag (npm) — flag engine, YAML parser, hashing
  cli/               → tinyflag-cli — CLI tools (validate, generate, diff, lint, etc.)
  react/             → tinyflag-react — React hooks
  vue/               → tinyflag-vue — Vue composables
  svelte/            → tinyflag-svelte — Svelte stores
  server/            → tinyflag-server — Server-side evaluation
  react-native/      → tinyflag-react-native — React Native bindings
  middleware/        → tinyflag-middleware — HTTP middleware (Express, Fastify, etc.)
  edge/              → tinyflag-edge — Edge runtime support (Cloudflare Workers, Vercel Edge)
  analytics/         → tinyflag-analytics — Analytics and event tracking
  otel/              → tinyflag-otel — OpenTelemetry instrumentation
  openfeature/       → tinyflag-openfeature — OpenFeature provider
  vscode/            → tinyflag-vscode — VS Code extension (IntelliSense, diagnostics)
  jetbrains/         → JetBrains IDE plugin (Gradle-based)
  pulumi/            → Pulumi provider for TinyFlag
  terraform-provider/ → Terraform provider (Go-based)
  github-action/     → GitHub Action for CI/CD integration
  dashboard/         → Static HTML dashboard
  playground/        → Interactive flag playground
sdks/
  go/                → Go SDK
  jvm/               → JVM SDK (Kotlin/Java)
  python/            → Python SDK
  rust/              → Rust SDK
examples/            → Example apps
docs/                → Documentation
website/             → Docusaurus documentation site
```

> **Note:** The `sdks/` and `website/` directories are **not** part of the pnpm workspace. They have separate build workflows — see [Non-Workspace Directories](#non-workspace-directories) below.

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

### Changesets

TinyFlag uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing. When your PR includes user-facing changes, create a changeset:

```bash
pnpm changeset
```

This will prompt you to:

1. **Select packages** — choose which packages are affected
2. **Choose bump type** — `major` (breaking changes), `minor` (new features), or `patch` (bug fixes)
3. **Write a summary** — describe the change for the changelog

A `.changeset/*.md` file is created and committed with your PR.

**When to create a changeset:**

- ✅ Bug fixes, new features, breaking changes, dependency updates affecting public API
- ❌ Documentation-only changes, test changes, internal refactors with no public API impact

**Automated release pipeline:** When changeset PRs are merged to `main`, the [release workflow](.github/workflows/release.yml) automatically creates a "Version Packages" PR that bumps versions and updates changelogs. Merging that PR publishes to npm.

**Excluded packages:** The `dashboard` and `github-action` packages are excluded from changesets and are not published to npm.

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

# Watch mode (all packages)
pnpm test:watch

# Single file
cd packages/core && npx vitest run src/__tests__/evaluator.test.ts
```

## Working on a Single Package

Use `pnpm --filter` to run scripts in a specific package without `cd`:

```bash
# Build a single package
pnpm --filter tinyflag build
pnpm --filter tinyflag-react build

# Test a single package
pnpm --filter tinyflag test
pnpm --filter tinyflag-cli test

# Watch tests in a single package
pnpm --filter tinyflag-react test:watch

# Type-check a single package
pnpm --filter tinyflag-server lint

# Build a package and all its workspace dependencies
pnpm --filter tinyflag-react... build
```

> **Tip:** The filter name matches the `"name"` field in each package's `package.json` (e.g., `tinyflag`, `tinyflag-react`, `tinyflag-cli`). Use `...` suffix to include dependencies.

CI enforces ≥90% line and patch coverage via [Codecov](https://codecov.io/). To check coverage locally before pushing:

```bash
cd packages/core && pnpm test:coverage
```

The coverage report is generated in `packages/core/coverage/`.

## Reporting Issues

- Use GitHub Issues
- Include: TinyFlag version, runtime (Node/Bun/Deno/browser), minimal reproduction

## Non-Workspace Directories

The `sdks/` and `website/` directories are **not** included in `pnpm-workspace.yaml`, so `pnpm -r` commands (build, test, lint) do not cover them. They must be built and tested separately:

### SDKs (`sdks/`)

| SDK    | Build                                | Test                                        |
| ------ | ------------------------------------ | ------------------------------------------- |
| Go     | `cd sdks/go && go build ./...`       | `cd sdks/go && go test ./...`               |
| JVM    | `cd sdks/jvm && ./gradlew build`     | `cd sdks/jvm && ./gradlew test`             |
| Python | `cd sdks/python && pip install -e .` | `cd sdks/python && python -m pytest tests/` |
| Rust   | `cd sdks/rust && cargo build`        | `cd sdks/rust && cargo test`                |

### Website (`website/`)

```bash
cd website
npm install
npm start        # dev server
npm run build    # production build
```

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
