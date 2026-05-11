# TinyFlag Documentation

Welcome to the TinyFlag documentation. TinyFlag is a serverless, file-driven, zero-dependency feature flag SDK for JavaScript/TypeScript.

## Table of Contents

### Getting Started

- [Quick Start](./getting-started.md) — Your first flag in under 60 seconds
- [Installation](./getting-started.md#installation)
- [Flag File Format](./flag-format.md)

### Core Concepts

- [Flag Evaluation](./evaluation.md) — How `isEnabled` and `getVariant` work
- [Targeting Rules](./targeting-rules.md) — Target specific user segments
- [Percentage Rollouts](./evaluation.md#percentage-rollouts) — Gradual feature rollout
- [A/B Testing](./evaluation.md#ab-testing) — Weighted variant assignment

### Framework Integrations

- [React](./integrations/react.md) — Hooks + Next.js SSR
- [Vue](./integrations/vue.md) — Composables + Nuxt SSR
- [Svelte](./integrations/svelte.md) — Stores + SvelteKit SSR

### Tools

- [CLI Reference](./cli.md) — validate, generate, diff
- [GitHub Action](./github-action.md) — PR validation
- [Dashboard](./dashboard.md) — Visual flag overview
- [JSON Schema](./flag-format.md#json-schema) — IDE autocompletion
- [Troubleshooting](./troubleshooting.md) — Error codes, common issues, debug logging

### API Reference

- [TinyFlag Class](./api-reference.md)
- [Event Types](./api-reference.md#events)
- [TypeScript Types](./api-reference.md#types)

### Migration

- [From LaunchDarkly](./migration.md#from-launchdarkly)
- [From Unleash](./migration.md#from-unleash)

### Contributing

- [Contributing Guide](../CONTRIBUTING.md) — Development setup, code standards, PR workflow

### Architecture

- [Design Decisions](./architecture.md)
- [Security Model](./security.md)
