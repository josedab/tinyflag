# TinyFlag — Product Requirements Document

## 1. Overview

**Product Name:** TinyFlag
**Tagline:** Feature flags that fit in your pocket.
**Author:** @josedabim
**Created:** 2026-04-22
**Status:** Draft

### 1.1 Problem Statement

Feature flag solutions in 2026 (LaunchDarkly, Unleash, Flagsmith, GrowthBook, Flipt) all require running a dedicated server or subscribing to a SaaS platform. For small-to-mid-sized teams (1–20 devs), solo developers, and open-source projects, this is unnecessary overhead. Developers want to:

- Toggle features for subsets of users
- Do percentage-based rollouts
- Run simple A/B tests
- Review flag changes in pull requests

…without provisioning infrastructure, paying per-seat fees, or adding operational burden.

### 1.2 Vision

TinyFlag is a **serverless, file-driven, zero-dependency feature flag SDK** for JavaScript/TypeScript. Flags are defined in YAML or JSON files committed to your repo (flags-as-code). Evaluation happens entirely client-side or at the edge. No server, no dashboard, no vendor lock-in.

### 1.3 Target Users

| Persona | Description |
|---------|-------------|
| **Indie/Solo Dev** | Ships SaaS products alone, needs flags without infra |
| **Startup Team (1–20)** | Wants rollouts and experiments but not LaunchDarkly pricing |
| **Open-Source Maintainer** | Needs to gate experimental features for contributors |
| **Edge/Serverless Dev** | Deploys on Cloudflare Workers, Vercel Edge, Deno — needs flags that work in these runtimes |

---

## 2. Goals & Success Metrics

### 2.1 Goals

1. **Zero infrastructure** — No server, database, or cloud service required to use feature flags
2. **Git-native** — Flags defined in version-controlled files; changes reviewed in PRs
3. **Tiny footprint** — < 5KB gzipped, zero dependencies
4. **Universal runtime** — Works in Node.js, Bun, Deno, Cloudflare Workers, browsers
5. **Developer joy** — Working flags in under 60 seconds from `npm install`

### 2.2 Success Metrics

| Metric | Target (6 months) |
|--------|-------------------|
| GitHub stars | 2,000+ |
| Weekly npm downloads | 5,000+ |
| Time to first flag (new user) | < 60 seconds |
| Bundle size (core) | < 5KB gzipped |
| Open issues response time | < 48 hours |

---

## 3. Competitive Analysis

| Feature | LaunchDarkly | Unleash | GrowthBook | Flipt | **TinyFlag** |
|---------|-------------|---------|------------|-------|-------------|
| Requires server | ✅ (SaaS) | ✅ | ✅ | ✅ | ❌ **No** |
| Git-native flags | ❌ | ❌ | ❌ | Partial | ✅ |
| Zero dependencies | ❌ | ❌ | ❌ | ❌ | ✅ |
| Edge/serverless compatible | Partial | ❌ | Partial | ❌ | ✅ |
| A/B test variants | ✅ | ✅ | ✅ | ✅ | ✅ |
| Percentage rollout | ✅ | ✅ | ✅ | ✅ | ✅ |
| User targeting rules | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pricing | $$$$ | Free + paid | Free + paid | Free | **Free forever** |

### Unique Differentiator

TinyFlag is the only feature flag SDK where **the flag definition file IS the entire system**. No server to run, no SDK key to configure, no network calls required. Your `flags.yml` in Git is the single source of truth.

---

## 4. Functional Requirements

### 4.1 Core SDK (v0.1)

#### FR-1: Flag Definition Format

- Support YAML and JSON flag definition files
- Schema:

```yaml
flags:
  <flag-name>:
    enabled: boolean
    rollout?: number (0-100)    # percentage rollout
    rules?: Rule[]               # targeting rules
    variants?: Variant[]         # A/B test variants
    description?: string
    tags?: string[]
```

#### FR-2: Flag Evaluation

- `isEnabled(flagName: string, context?: UserContext): boolean`
  - Returns `true`/`false` based on enabled state, rollout %, and rules
  - Deterministic hashing (MurmurHash3) on user ID for consistent rollout bucketing
  - If no context provided, evaluates global state only

#### FR-3: Variant Evaluation

- `getVariant(flagName: string, context?: UserContext): string | null`
  - Returns the assigned variant name based on weighted distribution
  - Deterministic — same user always gets same variant

#### FR-4: Targeting Rules

- Rule engine supporting:
  - Equality: `{ plan: 'pro' }` → user.plan === 'pro'
  - Pattern matching: `{ email: '*@company.com' }` → glob match
  - Comparison: `{ age: { $gte: 18 } }` → user.age >= 18
  - List inclusion: `{ country: { $in: ['US', 'CA'] } }`
- Rules evaluated top-to-bottom, first match wins

#### FR-5: Initialization

```typescript
import { TinyFlag } from 'tinyflag'

const ff = new TinyFlag({
  source: './flags.yml',                    // local file
  // OR source: 'https://cdn.example.com/flags.json'  // remote URL
  // OR source: { flags: { ... } }          // inline object
})
```

- File source: reads from filesystem (Node/Bun/Deno) or bundled (browser)
- URL source: fetches with configurable polling interval
- Object source: in-memory, for testing or dynamic use

#### FR-6: Hot Reload

- File source: watch for file changes, re-evaluate flags automatically
- URL source: configurable polling interval (default: 60s)
- Emit `change` event when flags update

#### FR-7: TypeScript Support

- Full type inference from flag definitions
- CLI tool: `npx tinyflag generate` reads `flags.yml` and outputs a typed interface

```typescript
// Auto-generated from flags.yml
export interface Flags {
  'new-checkout': { variants: 'control' | 'new-flow' }
  'dark-mode': { variants: 'control' | 'dark' }
}
```

### 4.2 Framework Integrations (v0.2)

#### FR-8: React Hook

```tsx
import { useFlag, useVariant } from 'tinyflag/react'

function App() {
  const showCheckout = useFlag('new-checkout')
  const theme = useVariant('dark-mode')
  // ...
}
```

#### FR-9: Vue Composable

```vue
<script setup>
import { useFlag } from 'tinyflag/vue'
const showCheckout = useFlag('new-checkout')
</script>
```

#### FR-10: Svelte Store

```svelte
<script>
import { flag } from 'tinyflag/svelte'
const showCheckout = flag('new-checkout')
</script>

{#if $showCheckout}
  <NewCheckout />
{/if}
```

### 4.3 Event Hooks & Analytics (v0.3)

#### FR-11: Exposure Tracking

```typescript
ff.on('exposure', (event) => {
  // { flag: 'new-checkout', variant: 'new-flow', userId: '123', timestamp: ... }
  analytics.track('feature_exposure', event)
})
```

#### FR-12: Flag Change Events

```typescript
ff.on('change', (event) => {
  // { flag: 'dark-mode', previous: { enabled: false }, current: { enabled: true } }
})
```

### 4.4 CI/CD Integration (v0.3)

#### FR-13: GitHub Action — Flag Validation

- Validates `flags.yml` schema on every PR
- Comments on PR with a diff of flag changes ("🚩 `new-checkout` rollout changed: 10% → 50%")
- Blocks merge if flags are malformed

#### FR-14: CLI Tool

```bash
npx tinyflag validate ./flags.yml       # validate schema
npx tinyflag diff main..HEAD            # show flag changes between branches
npx tinyflag generate ./flags.yml       # generate TypeScript types
```

### 4.5 Optional Micro-Dashboard (v1.0)

#### FR-15: Static Dashboard

- Single HTML file, zero backend
- Reads `flags.yml` from a URL or local file
- Displays all flags, current state, rollout %, rules
- Read-only by default; optional "edit & download" mode that outputs updated YAML
- Can be deployed to GitHub Pages, Vercel, or Netlify

---

## 5. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Bundle size** | < 5KB gzipped (core), < 2KB per framework binding |
| **Zero dependencies** | Core has no npm dependencies |
| **Evaluation speed** | < 0.1ms per flag evaluation |
| **Runtime support** | Node.js 18+, Bun, Deno, Cloudflare Workers, browsers (ES2020+) |
| **Tree-shakeable** | Unused framework bindings excluded from bundle |
| **Test coverage** | > 90% line coverage |
| **License** | MIT |

---

## 6. Architecture

```
tinyflag/
├── packages/
│   ├── core/              # Flag engine, rule evaluator, hashing
│   │   ├── src/
│   │   │   ├── index.ts          # TinyFlag class, main API
│   │   │   ├── evaluator.ts      # Rule matching engine
│   │   │   ├── hash.ts           # MurmurHash3 for deterministic bucketing
│   │   │   ├── loader.ts         # Source loaders (file, URL, object)
│   │   │   ├── schema.ts         # YAML/JSON schema validation
│   │   │   └── types.ts          # TypeScript interfaces
│   │   └── package.json
│   ├── react/             # useFlag, useVariant hooks
│   ├── vue/               # composables
│   ├── svelte/            # stores
│   ├── cli/               # validate, diff, generate commands
│   └── github-action/     # PR validation action
├── examples/
│   ├── nextjs/
│   ├── express/
│   ├── cloudflare-worker/
│   └── deno/
├── flags.schema.json      # JSON Schema for flags.yml validation
└── README.md
```

---

## 7. Rollout Plan

| Phase | Timeline | Deliverables |
|-------|----------|-------------|
| **Alpha** | Weeks 1–2 | Core SDK: `isEnabled`, `getVariant`, YAML/JSON loader, targeting rules, rollout hashing |
| **Beta** | Weeks 3–4 | React/Vue/Svelte bindings, URL source with polling, TypeScript codegen CLI |
| **RC** | Weeks 5–6 | Event hooks, GitHub Action, `tinyflag validate/diff` CLI, 4+ example apps |
| **v1.0** | Weeks 7–8 | Micro-dashboard, docs site, migration guides, launch campaign |

---

## 8. Open Questions

1. Should we support a lightweight server mode (tiny HTTP server serving flags) for teams that want centralized flag management without a full platform?
2. Should variant weights support dynamic adjustment via environment variables?
3. Should we build an official VS Code extension for inline flag previews?