# ADR-0006: pnpm Monorepo with Independent Package Versioning

## Status

Accepted

## Context

TinyFlag ships multiple packages: core SDK, framework bindings (React, Vue, Svelte), CLI, dashboard, GitHub Action, server, middleware, edge runtime adapters, and more (19 packages total). These packages share:

- TypeScript configuration
- Build tooling (tsup)
- Testing infrastructure (vitest)
- Linting and formatting (Prettier)
- Release workflow (Changesets)

Options considered:

1. **Separate repositories** — maximum isolation but painful cross-package development
2. **Single package** — simplest but forces consumers to install unnecessary framework bindings
3. **Monorepo with fixed versioning** — all packages share one version number (Lerna-style)
4. **Monorepo with independent versioning** — each package has its own version

## Decision

TinyFlag uses a **pnpm workspace monorepo** with **independently versioned packages** managed by [Changesets](https://github.com/changesets/changesets).

- `pnpm-workspace.yaml` declares `packages/*` as workspace members
- Each package has its own `package.json` with independent `version`
- Framework bindings use `peerDependencies` on `tinyflag: workspace:*`
- Changesets track which packages are affected by each PR

## Consequences

**Positive:**

- Consumers install only what they need (`tinyflag` + `tinyflag-react`, not `tinyflag-vue`)
- Breaking changes in one binding don't force version bumps in others
- Shared dev tooling reduces configuration drift
- `workspace:*` protocol ensures bindings always test against the local core version
- Single CI pipeline tests all packages together

**Negative:**

- Workspace setup has complexity (pnpm-workspace.yaml, per-package tsconfig, per-package tsup config)
- Changesets workflow requires contributors to run `pnpm changeset` for user-facing changes
- Cross-package type changes require coordinated releases
- Dashboard and GitHub Action are excluded from npm publishing (they have different distribution models)

**Release flow:** Merging a changeset PR to `main` triggers the release workflow which creates a "Version Packages" PR. Merging that PR publishes affected packages to npm.
