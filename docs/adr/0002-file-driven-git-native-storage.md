# ADR-0002: File-Driven, Git-Native Flag Storage

## Status

Accepted

## Context

Traditional feature flag systems (LaunchDarkly, Unleash, GrowthBook) require a central server or SaaS platform to store and serve flag definitions. This introduces:

- Infrastructure complexity (database, API server, dashboard)
- Vendor lock-in and recurring costs
- Network dependency for flag evaluation (latency, availability risk)
- A separate change management workflow outside the developer's normal Git-based flow

Many teams already manage configuration as code (Kubernetes manifests, Terraform, environment variables). Feature flags are conceptually configuration — they should follow the same patterns.

## Decision

TinyFlag stores flag definitions in **YAML or JSON files committed to Git**. The SDK reads these files directly — no server, no database, no API keys.

Flag changes follow the same workflow as code changes:
1. Edit `flags.yml` in a branch
2. Open a pull request (CI validates the flag file via `tinyflag validate`)
3. Review the diff (the GitHub Action posts a change summary)
4. Merge to deploy

The SDK supports three source types to accommodate different deployment models:
- **File path** — for server-side applications with filesystem access
- **URL** — for CDN-hosted flags, edge runtimes, or browser-based evaluation
- **Inline object** — for testing, edge workers, and bundled configurations

## Consequences

**Positive:**
- Zero infrastructure to provision or maintain
- Full audit trail via Git history (who changed what, when, and why)
- Changes reviewed in PRs with the same rigor as code changes
- Works offline — no network dependency for evaluation
- Free forever — no per-seat or per-evaluation pricing

**Negative:**
- No real-time dashboard for non-technical stakeholders to toggle flags
- Flag changes require a commit/deploy cycle (minutes, not seconds)
- No built-in analytics or experimentation dashboard (exposure events must be wired to external analytics)
- Multi-environment overrides require file layering (`flags.base.yml` + `flags.production.yml`)

**Mitigation:** The static micro-dashboard (`packages/dashboard`) provides a read-only UI for viewing flag state. The `CachedTinyFlag` client with WebSocket push provides near-real-time updates for teams that need faster propagation.
