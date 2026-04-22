# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-04-22

### Added

- **Core SDK** (`tinyflag`)
  - `isEnabled()` — boolean flag evaluation (never throws)
  - `getVariant()` — deterministic A/B test variant assignment
  - Targeting rules: equality, glob pattern, `$gt`/`$gte`/`$lt`/`$lte`, `$in`, `$not`
  - Percentage rollouts with MurmurHash3 deterministic bucketing
  - YAML and JSON flag file support with built-in parser
  - File, URL, and inline source loading
  - URL source with `headers` option for authenticated endpoints
  - Hot reload: file watching (`fs.watch`) and URL polling (ETag + If-Modified-Since)
  - Event system: `exposure`, `change`, `error` events
  - Exposure event deduplication (configurable via `deduplicate` option)
  - Schema validation with strict and lenient modes
  - Zero runtime dependencies, < 6KB gzipped

- **Framework Integrations**
  - `tinyflag-react` — `TinyFlagProvider`, `useFlag`, `useVariant` hooks with SSR support
  - `tinyflag-vue` — `provideTinyFlag`, `useFlag`, `useVariant` composables with SSR support
  - `tinyflag-svelte` — `createTinyFlag`, `flag`, `variant` stores with SSR support

- **CLI** (`tinyflag-cli`)
  - `tinyflag validate` — schema validation
  - `tinyflag generate` — TypeScript type generation
  - `tinyflag diff` — flag changes between git refs

- **GitHub Action** — PR validation with change summary comments

- **Dashboard** — static HTML micro-dashboard with search, filter, edit mode, download, WCAG 2.1 AA

- **Documentation** — 15-page docs site, API reference, migration guides, 8 example apps
