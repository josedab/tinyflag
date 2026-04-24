# TinyFlag — Enhanced Product Requirements Document

> **Enhanced from:** PRD-TinyFlag_Version3.md  
> **Enhanced on:** 2026-04-22  
> **Status:** Draft — Stakeholder decisions applied (2026-04-22)  
> **Legend:** [INFERRED] = inferred by analyst, validate with author · [DECIDED] = resolved by stakeholder

---

## GAP ANALYSIS

The following gaps were identified in the original PRD and resolved in this enhanced version.

| #   | Gap                                                                                             | Category                    | Severity     | Proposed Resolution                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Zero dependencies" contradicts YAML parsing requirement — YAML parsers are non-trivial         | Contradiction               | **Blocking** | [DECIDED] Support full YAML spec with a built-in parser. Bundle size target may need to be relaxed to ~8KB gzipped to accommodate a full YAML parser (~3–4KB).                                                                                                                            |
| 2   | "File source: reads from filesystem" claimed for browsers — browsers cannot access local files  | Contradiction               | **Blocking** | Clarify: browser source must be URL, inline object, or bundled import. File source is Node/Bun/Deno only.                                                                                                                                                                                 |
| 3   | "Hot reload: watch for file changes" — not possible in browsers                                 | Contradiction               | **Major**    | Hot reload via file watching is server-runtime only. Browsers use URL polling or manual `reload()` call.                                                                                                                                                                                  |
| 4   | No acceptance criteria for any of the 15 functional requirements                                | Missing acceptance criteria | **Blocking** | Added Given/When/Then acceptance criteria for every FR.                                                                                                                                                                                                                                   |
| 5   | No error handling strategy — what happens when flag not found, file malformed, URL unreachable? | Undefined edge cases        | **Blocking** | Defined default behaviors: return `false` for unknown flags, `null` for unknown variants, emit `error` event, never throw in evaluation path.                                                                                                                                             |
| 6   | No edge case definitions (missing context fields, invalid rollout %, variant weight mismatch)   | Undefined edge cases        | **Major**    | Documented edge cases per FR with expected behavior.                                                                                                                                                                                                                                      |
| 7   | No explicit "out of scope" list                                                                 | Missing scope boundaries    | **Major**    | Added explicit out-of-scope list for v1.                                                                                                                                                                                                                                                  |
| 8   | No MoSCoW prioritization within versions                                                        | Missing prioritization      | **Major**    | Added Must/Should/Nice-to-have labels per FR.                                                                                                                                                                                                                                             |
| 9   | No user stories attached to FRs                                                                 | Missing user stories        | **Major**    | Added "As a [persona]…" story per FR.                                                                                                                                                                                                                                                     |
| 10  | FR-7 CLI `generate` appears in v0.1 but FR-14 CLI in v0.3 — unclear split                       | Contradiction               | **Minor**    | Clarified: `generate` is v0.1 (core SDK). `validate` and `diff` are v0.3 (CI/CD).                                                                                                                                                                                                         |
| 11  | No security considerations (flag file tampering, exposure tracking PII, URL source auth)        | Missing NFRs                | **Major**    | Added security section: integrity checks, PII handling, URL auth.                                                                                                                                                                                                                         |
| 12  | No data retention/privacy policy for exposure tracking events                                   | Missing NFRs                | **Major**    | Clarified: SDK emits events, does NOT store data. Consumer is responsible for GDPR compliance.                                                                                                                                                                                            |
| 13  | No accessibility requirements for the micro-dashboard                                           | Missing NFRs                | **Minor**    | Added WCAG 2.1 AA target for dashboard.                                                                                                                                                                                                                                                   |
| 14  | "Developer joy" is vague                                                                        | Vague requirements          | **Minor**    | Replaced with measurable criteria: time-to-first-flag < 60s, API surface ≤ 5 methods, zero config file required.                                                                                                                                                                          |
| 15  | No data model defined — entities and relationships are implicit                                 | Missing data model          | **Major**    | Added conceptual data model with entities: Flag, Rule, Variant, UserContext.                                                                                                                                                                                                              |
| 16  | No integration points documented beyond GitHub Action                                           | Missing integration         | **Minor**    | Added integration points: analytics adapters, CI systems, CDN sources.                                                                                                                                                                                                                    |
| 17  | No UX/UI spec for dashboard (loading/empty/error states)                                        | Missing UX                  | **Minor**    | Added dashboard wireframe descriptions and state definitions.                                                                                                                                                                                                                             |
| 18  | No rollback or migration strategy                                                               | Missing release plan        | **Minor**    | Added rollback criteria and semantic versioning policy.                                                                                                                                                                                                                                   |
| 19  | Bundle size < 5KB including built-in YAML parser + rule engine + hash may be unrealistic        | Vague requirements          | **Major**    | [DECIDED] Full YAML spec parser is included. Revised target: < 8KB gzipped for core (including full YAML parser ~3–4KB, MurmurHash3 ~200B, rule engine ~1KB, core logic ~1KB). If a compliant full-spec parser can be written under 2KB, the original 5KB target may still be achievable. |
| 20  | Multi-environment support (dev/staging/prod) not addressed                                      | Missing scope               | **Minor**    | [INFERRED] Out of scope for v1 — users can manage via separate flag files per environment. Documented as future consideration.                                                                                                                                                            |
| 21  | Flag schema versioning not defined — what happens when schema evolves?                          | Implicit assumption         | **Major**    | Added `version` field to flag schema. SDK validates and provides clear migration errors.                                                                                                                                                                                                  |
| 22  | ESM vs CJS module format not specified                                                          | Implicit assumption         | **Minor**    | [INFERRED] Dual ESM/CJS build with ESM as primary. Package.json `exports` map.                                                                                                                                                                                                            |
| 23  | Package manager and build toolchain not specified                                               | Implicit assumption         | **Minor**    | [INFERRED] pnpm workspace monorepo, tsup for building. Documented as implementation notes.                                                                                                                                                                                                |
| 24  | Success metrics are mostly vanity (stars, downloads) — no product quality metrics               | Missing metrics             | **Minor**    | Added SDK reliability metrics: zero-crash evaluation, <0.1ms p99 latency, deterministic consistency.                                                                                                                                                                                      |

---

## 1. Overview

- **Product name:** TinyFlag
- **One-line description:** Serverless, file-driven, zero-dependency feature flag SDK for JavaScript/TypeScript.
- **Problem statement:** Feature flag solutions in 2026 (LaunchDarkly, Unleash, Flagsmith, GrowthBook, Flipt) all require running a dedicated server or subscribing to a SaaS platform. For small-to-mid-sized teams (1–20 devs), solo developers, and open-source projects, this creates unnecessary operational overhead and cost. Developers want to toggle features, do percentage rollouts, and run A/B tests — without provisioning infrastructure, paying per-seat fees, or managing another service.
- **Proposed solution:** TinyFlag is a serverless, file-driven, zero-dependency feature flag SDK. Flags are defined in YAML or JSON files committed to Git (flags-as-code). Evaluation happens entirely in-process — no server, no dashboard, no vendor lock-in. The flag definition file IS the entire system.
- **Success metrics:**

| Metric                        | Target (6 months)                                       | Measurement Method                        |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| GitHub stars                  | 2,000+                                                  | GitHub API                                |
| Weekly npm downloads          | 5,000+                                                  | npm registry                              |
| Time to first flag (new user) | < 60 seconds                                            | Measured via quickstart guide walkthrough |
| Bundle size (core)            | < 8KB gzipped [DECIDED — revised for full YAML parser]  | CI build step                             |
| Evaluation reliability        | Zero thrown exceptions in evaluation path               | Unit tests + fuzzing                      |
| Deterministic consistency     | Same (flagName, userId) → same result, 100% of the time | Property-based tests                      |

---

## 2. Users & Personas

### 2.1 Indie/Solo Developer

- **Goals:** Ship SaaS product features incrementally with toggles; run A/B tests without a third-party service.
- **Pain points:** LaunchDarkly pricing is overkill; self-hosted solutions (Unleash, Flipt) require running a server; environment variables are too blunt for rollout control.
- **Tech comfort level:** High — comfortable with CLI tools, TypeScript, and reading SDK docs.

### 2.2 Startup Team (1–20 devs)

- **Goals:** Coordinate feature rollouts across the team; gate features for beta users; review flag changes in PRs like any other code change.
- **Pain points:** Per-seat SaaS pricing scales poorly; self-hosted solutions add DevOps burden the team can't afford; ad-hoc `if` statements and env vars become unmanageable.
- **Tech comfort level:** High — uses CI/CD, TypeScript, modern frameworks.

### 2.3 Open-Source Maintainer

- **Goals:** Gate experimental features behind flags so contributors can test them without affecting stable users; enable features for specific contributor groups.
- **Pain points:** Cannot require contributors to set up a SaaS flag service; needs flags that work without any account or API key.
- **Tech comfort level:** High — familiar with build tools and configuration.

### 2.4 Edge/Serverless Developer

- **Goals:** Use feature flags in Cloudflare Workers, Vercel Edge Functions, or Deno Deploy where traditional SDKs with network dependencies won't work.
- **Pain points:** Existing SDKs assume long-lived server processes with persistent connections; cold start latency matters; no filesystem access in some runtimes.
- **Tech comfort level:** High — works with edge runtimes and understands their constraints.

---

## 3. Scope

### 3.1 In Scope (v1)

| Version          | What Ships                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v0.1 (Alpha)** | Core SDK: `isEnabled`, `getVariant`, YAML/JSON loader, targeting rules, rollout hashing, TypeScript type generation CLI (`generate`), inline/file/URL sources |
| **v0.2 (Beta)**  | React hooks, Vue composables, Svelte stores, URL source polling, hot reload (file watcher), SSR support for all framework bindings [DECIDED]                  |
| **v0.3 (RC)**    | Exposure tracking events, flag change events, GitHub Action (validate/diff), CLI (`validate`, `diff`), 4+ example apps                                        |
| **v1.0 (GA)**    | Static micro-dashboard (read-only + download), documentation site, migration guides                                                                           |

### 3.2 Out of Scope (v1)

| Item                                                        | Reason                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Server mode / centralized flag management                   | Contradicts the core "no server" value proposition. Revisit post-v1 based on user feedback. |
| Multi-environment merging (dev/staging/prod in one file)    | Users can manage separate flag files per environment. Too complex for v1.                   |
| Flag lifecycle management (archiving, deprecation warnings) | Nice-to-have. Users can delete flags from the file.                                         |
| VS Code extension                                           | Open question #3. Deferred post-v1 based on community demand.                               |
| Dynamic variant weight adjustment via environment variables | Open question #2. Deferred — users can modify the flag file instead.                        |
| Realtime sync (WebSocket/SSE)                               | Conflicts with "no server" philosophy. URL polling is sufficient for v1.                    |
| Role-based access control on flag edits                     | Flags are files in Git — Git permissions provide access control.                            |
| Mobile SDKs (React Native, Flutter, Swift, Kotlin)          | JavaScript/TypeScript only in v1. [INFERRED]                                                |

### 3.3 Future Considerations (v2+)

- **Lightweight server mode** — optional tiny HTTP server for teams wanting centralized management
- **VS Code extension** — inline flag previews, autocomplete, go-to-definition
- **Environment variable overrides** — allow `TINYFLAG_<FLAG_NAME>=true` to override file values
- **Flag dependencies** — flag A requires flag B to be enabled
- **Scheduled flags** — enable/disable flags at specific timestamps
- **Audit log** — track who changed what flag and when (via git log integration)
- **Multi-environment file merging** — base flags + environment overrides

---

## 4. Functional Requirements

### FR-001: Flag Definition Format

- **Priority:** Must-have
- **User story:** As a developer, I want to define feature flags in a YAML or JSON file in my repo so that flag configuration is version-controlled and reviewable in PRs.
- **Description:** Support YAML and JSON flag definition files with a well-defined schema. The file is the single source of truth for all flag state.
- **Schema (v1):**

```yaml
version: 1 # Schema version [INFERRED]
flags:
  <flag-name>: # kebab-case, alphanumeric + hyphens, 1-128 chars
    enabled: boolean # Required. Global on/off switch
    description?: string # Optional. Human-readable purpose
    tags?: string[] # Optional. Categorization labels
    rollout?: number # Optional. 0-100 integer, percentage of users
    rules?: Rule[] # Optional. Targeting rules (evaluated top-to-bottom)
    variants?: Variant[] # Optional. A/B test variants with weights
```

```yaml
# Rule schema
Rule:
  conditions: Record<string, any> # Key-value conditions on UserContext
  enabled?: boolean # Override enabled state (default: true)
  rollout?: number # Override rollout % for matched users
  variant?: string # Force a specific variant for matched users

# Variant schema
Variant:
  name: string # Variant identifier (alphanumeric + hyphens)
  weight: number # Relative weight (positive integer)
```

- **Acceptance criteria:**
  1. Given a valid YAML file, When the SDK loads it, Then all flags are accessible via `isEnabled()` and `getVariant()`.
  2. Given a valid JSON file, When the SDK loads it, Then behavior is identical to the equivalent YAML file.
  3. Given a flag name with invalid characters (spaces, special chars), When the file is validated, Then a descriptive error is returned listing the invalid flag name and allowed characters.
  4. Given a flag missing the required `enabled` field, When the file is loaded, Then a validation error is thrown at initialization (not at evaluation time).
  5. Given a `version` field with an unsupported value, When the file is loaded, Then a clear error message is thrown indicating the expected version(s).

- **Edge cases:**
  - Empty `flags:` object → valid, SDK initializes with no flags
  - Duplicate flag names → YAML/JSON parsers keep last value; SDK should warn via `error` event [INFERRED]
  - Flag name is empty string → validation error
  - `rollout` value of 0 → flag is effectively disabled for rollout even if `enabled: true`
  - `rollout` value of 100 → flag is enabled for all users (rollout has no effect)
  - `rollout` value outside 0–100 → validation error at load time
  - Variant weights are all zero → validation error at load time
  - File is empty → validation error ("no flags defined")
  - File contains unknown/extra fields → [DECIDED] lenient mode: ignore unknown fields and emit a warning via the `error` event. Strict mode available as opt-in via `strict: true` config option.

- **Dependencies:** None (foundational)

---

### FR-002: Flag Evaluation

- **Priority:** Must-have
- **User story:** As a developer, I want to check if a feature flag is enabled for a specific user so that I can conditionally show features.
- **Description:**

```typescript
isEnabled(flagName: string, context?: UserContext): boolean
```

Evaluation logic (in order):

1. If flag does not exist → return `false`, emit `error` event with `FLAG_NOT_FOUND`
2. If `enabled` is `false` → return `false`
3. If `rules` exist and context is provided → evaluate rules top-to-bottom; first matching rule's `enabled` value wins (default `true`)
4. If `rollout` is defined and context has a `userId` → hash `flagName + userId` with MurmurHash3, bucket into 0–99, return `true` if bucket < rollout
5. If `rollout` is defined but no `userId` in context → skip rollout, fall through to global `enabled` state [DECIDED]
6. Otherwise → return `enabled` value

- **Acceptance criteria:**
  1. Given a flag with `enabled: true` and no rules/rollout, When `isEnabled('flag')` is called, Then it returns `true`.
  2. Given a flag with `enabled: false`, When `isEnabled('flag', anyContext)` is called, Then it returns `false` regardless of rules or rollout.
  3. Given a flag with `rollout: 50`, When called 10,000 times with sequential user IDs, Then approximately 50% (±5%) return `true`.
  4. Given the same `(flagName, userId)` pair, When `isEnabled` is called multiple times, Then it always returns the same result.
  5. Given a flag name that does not exist, When `isEnabled('nonexistent')` is called, Then it returns `false` and emits an `error` event.
  6. Given `isEnabled` is called with no context on a flag with `enabled: true` and `rollout: 50`, When evaluated, Then rollout is skipped and `true` is returned (falls through to global `enabled` state). [DECIDED]

- **Edge cases:**
  - `context` is `null` or `undefined` → treat as no context
  - `context.userId` is empty string → treat as no userId [INFERRED]
  - Flag name is empty string → return `false`, emit error
  - Flag name has trailing/leading whitespace → trim before lookup [INFERRED]

- **Dependencies:** FR-001

---

### FR-003: Variant Evaluation

- **Priority:** Must-have
- **User story:** As a developer, I want to assign users to A/B test variants deterministically so that I can run experiments without a third-party service.
- **Description:**

```typescript
getVariant(flagName: string, context?: UserContext): string | null
```

Evaluation logic:

1. If flag does not exist → return `null`, emit `error` event
2. If `enabled` is `false` → return `null`
3. If no `variants` defined → return `null`
4. If rules match and rule specifies a `variant` → return that variant
5. Hash `flagName + userId` (different seed than rollout hash) → map to weighted variant distribution
6. If no `userId` in context → return `null` [INFERRED]

- **Acceptance criteria:**
  1. Given variants `[{name: 'control', weight: 50}, {name: 'test', weight: 50}]`, When called 10,000 times with sequential user IDs, Then approximately 50/50 split (±5%).
  2. Given the same `(flagName, userId)`, When `getVariant` is called multiple times, Then the same variant is always returned.
  3. Given a flag with no variants, When `getVariant` is called, Then it returns `null`.
  4. Given a disabled flag with variants, When `getVariant` is called, Then it returns `null`.
  5. Given variants `[{name: 'a', weight: 1}, {name: 'b', weight: 99}]`, When called 10,000 times, Then ~1% get 'a' and ~99% get 'b' (±2%).

- **Edge cases:**
  - Variant weights are `[100, 0]` → all users get first variant
  - Only one variant defined → all users get that variant
  - Variant name is empty string → validation error at load time
  - Context has no userId → return `null`

- **Dependencies:** FR-001, FR-002

---

### FR-004: Targeting Rules

- **Priority:** Must-have
- **User story:** As a developer, I want to target specific user segments (by plan, email domain, country, etc.) so that I can roll out features to specific groups.
- **Description:** Rule engine supporting conditions on `UserContext` fields:

| Operator       | Syntax                                   | Example                              | Behavior                                |
| -------------- | ---------------------------------------- | ------------------------------------ | --------------------------------------- |
| Equality       | `{ field: value }`                       | `{ plan: 'pro' }`                    | Strict equality (`===`)                 |
| Pattern        | `{ field: 'glob*' }`                     | `{ email: '*@company.com' }`         | Glob-style matching (only `*` wildcard) |
| Greater/Less   | `{ field: { $gt, $gte, $lt, $lte: n } }` | `{ age: { $gte: 18 } }`              | Numeric comparison                      |
| List inclusion | `{ field: { $in: [...] } }`              | `{ country: { $in: ['US', 'CA'] } }` | Value is one of the list items          |
| Negation       | `{ field: { $not: value } }`             | `{ plan: { $not: 'free' } }`         | Inverted match [INFERRED]               |

Rules are evaluated top-to-bottom. First matching rule wins. If no rule matches, fall through to global flag state.

A rule matches when ALL conditions in its `conditions` object are satisfied (AND logic). [INFERRED]

- **Acceptance criteria:**
  1. Given a rule `{ conditions: { plan: 'pro' } }` and context `{ plan: 'pro' }`, When evaluated, Then the rule matches.
  2. Given a rule with `{ email: '*@company.com' }` and context `{ email: 'alice@company.com' }`, When evaluated, Then the rule matches.
  3. Given a rule with `{ age: { $gte: 18 } }` and context `{ age: 17 }`, When evaluated, Then the rule does NOT match.
  4. Given two rules where both match, When evaluated, Then only the FIRST rule's effect is applied.
  5. Given a rule referencing `plan` and context with no `plan` field, When evaluated, Then the rule does NOT match (missing field ≠ match).
  6. Given `{ $in: ['US', 'CA'] }` and context `{ country: 'MX' }`, When evaluated, Then the rule does NOT match.

- **Edge cases:**
  - Context field is `undefined` → condition does not match
  - Context field is `null` → condition does not match (null ≠ any value)
  - Comparison operator on non-numeric field → condition does not match, emit warning
  - Empty `conditions` object `{}` → rule always matches (vacuous truth) [INFERRED]
  - Glob pattern with no `*` → treated as equality match
  - `$in` with empty array → never matches

- **Dependencies:** FR-001

---

### FR-005: Initialization

- **Priority:** Must-have
- **User story:** As a developer, I want to initialize TinyFlag with minimal configuration so that I can start using feature flags in under 60 seconds.
- **Description:**

```typescript
import { TinyFlag } from 'tinyflag';

// Source options:
const ff = new TinyFlag({
  source: './flags.yml', // File (Node/Bun/Deno only)
  // OR source: 'https://cdn.example.com/flags.json'  // URL (all runtimes)
  // OR source: { version: 1, flags: { ... } }        // Inline object (all runtimes)
  headers: { Authorization: 'Bearer <token>' }, // Optional: custom headers for URL source [DECIDED]
});
```

| Source Type   | Detection                                    | Runtimes           | Notes                              |
| ------------- | -------------------------------------------- | ------------------ | ---------------------------------- |
| File path     | String ending in `.yml`, `.yaml`, or `.json` | Node.js, Bun, Deno | Uses `fs.readFileSync` at init     |
| URL           | String starting with `http://` or `https://` | All                | Fetches once at init, then polls   |
| Inline object | Plain object with `flags` property           | All                | For testing, bundled configs, edge |

- **Acceptance criteria:**
  1. Given a valid file path, When `new TinyFlag({ source: './flags.yml' })` is called in Node.js, Then flags are loaded synchronously and available immediately.
  2. Given a URL source, When initialized, Then flags are fetched and available after the returned promise resolves. [INFERRED — async init for URL]
  3. Given an inline object, When initialized, Then flags are available immediately with no I/O.
  4. Given a file path in a browser environment, When initialized, Then a clear error is thrown: "File source is not supported in browsers. Use a URL or inline object."
  5. Given a URL that returns a non-200 status, When initialized, Then an error is thrown with the HTTP status code.
  6. Given a URL that returns invalid YAML/JSON, When initialized, Then a validation error is thrown.

- **Edge cases:**
  - File does not exist → throw `Error` with descriptive message including the path
  - File exists but is not readable (permissions) → throw with descriptive message
  - URL times out → throw after configurable timeout (default: 5 seconds) [INFERRED]
  - Source is `null`/`undefined` → throw `Error("source is required")`
  - Source is a string but not a recognized format → throw `Error("unrecognized source format")`

- **Dependencies:** FR-001

---

### FR-006: Hot Reload

- **Priority:** Should-have
- **User story:** As a developer, I want flag changes to be picked up automatically so that I don't need to restart my application when I modify the flag file.
- **Description:**
  - **File source (Node/Bun/Deno only):** Uses `fs.watch` to detect file changes. On change, re-reads and re-validates the file. If valid, updates internal state and emits `change` event. If invalid, emits `error` event and keeps previous valid state.
  - **URL source (all runtimes):** Polls at a configurable interval. Default: 60 seconds. Minimum: 5 seconds. Uses `If-Modified-Since` / `ETag` headers when available to minimize bandwidth.
  - **Inline object source:** No auto-reload. Provide a `reload(newSource)` method for manual updates. [INFERRED]

```typescript
const ff = new TinyFlag({
  source: 'https://cdn.example.com/flags.json',
  pollInterval: 30_000, // 30 seconds (URL source only)
  watch: true, // Enable file watching (file source only, default: true)
});
```

- **Acceptance criteria:**
  1. Given a file source with `watch: true`, When the file is modified, Then flags are re-evaluated within 1 second.
  2. Given a URL source with `pollInterval: 30000`, When the remote file changes, Then flags update within 30 seconds + fetch time.
  3. Given a file change that introduces a schema error, When the watcher detects it, Then the previous valid configuration is retained and an `error` event is emitted.
  4. Given `watch: false` on a file source, When the file changes, Then flags are NOT automatically updated.
  5. Given a URL source where the server returns 304 Not Modified, When polled, Then no re-processing occurs.

- **Edge cases:**
  - File is deleted while being watched → emit `error` event, retain last valid state
  - File is replaced (delete + create, as some editors do) → re-watch the new file [INFERRED]
  - `pollInterval` set below 5 seconds → clamp to 5 seconds and emit warning [INFERRED]
  - URL becomes unreachable after initial load → retain last valid state, emit `error`, continue polling

- **Dependencies:** FR-005

---

### FR-007: TypeScript Type Generation

- **Priority:** Should-have
- **User story:** As a TypeScript developer, I want auto-generated type definitions from my flag file so that I get compile-time safety and autocomplete for flag names and variant values.
- **Description:**

```bash
npx tinyflag generate ./flags.yml        # Output to stdout
npx tinyflag generate ./flags.yml -o ./src/flags.d.ts  # Output to file
```

Generates:

```typescript
// Auto-generated by tinyflag — do not edit
export interface TinyFlagDefinitions {
  'new-checkout': { variants: 'control' | 'new-flow' };
  'dark-mode': { variants: never }; // no variants defined
}
```

- **Acceptance criteria:**
  1. Given a flags file with variants, When `generate` is run, Then the output interface includes variant literal types.
  2. Given a flags file with no variants on a flag, When `generate` is run, Then that flag's variants type is `never`.
  3. Given an invalid flags file, When `generate` is run, Then it exits with code 1 and prints the validation errors to stderr.
  4. Given the `-o` flag, When `generate` is run, Then the output is written to the specified file path.

- **Edge cases:**
  - Output file already exists → overwrite without prompt [INFERRED]
  - Output directory doesn't exist → error with suggestion to create it
  - Flags file is empty → generate empty interface

- **Dependencies:** FR-001

---

### FR-008: React Hook Integration

- **Priority:** Must-have (v0.2)
- **User story:** As a React developer, I want hooks for feature flags so that my components re-render when flags change.
- **Description:**

```tsx
import { TinyFlagProvider, useFlag, useVariant } from 'tinyflag/react';

function App() {
  return (
    <TinyFlagProvider source="./flags.yml" context={{ userId: '123', plan: 'pro' }}>
      <Dashboard />
    </TinyFlagProvider>
  );
}

function Dashboard() {
  const showCheckout = useFlag('new-checkout'); // boolean
  const theme = useVariant('dark-mode'); // string | null
  // re-renders when flag values change (hot reload / poll)
}
```

- **Acceptance criteria:**
  1. Given `<TinyFlagProvider>` wrapping the app, When a child calls `useFlag('x')`, Then it returns the current boolean value.
  2. Given a flag change (via hot reload/poll), When the flag value updates, Then components using that flag re-render.
  3. Given `useFlag` called outside of `<TinyFlagProvider>`, When the component renders, Then a descriptive error is thrown.
  4. Given a `context` prop on `TinyFlagProvider`, When flags are evaluated, Then the context is used for all evaluations.
  5. [DECIDED] Given a Next.js/Remix app using SSR, When `useFlag` is called during server-side rendering, Then it evaluates flags using the server-provided context and hydrates correctly on the client.

- **Edge cases:**
  - Provider unmounts → cleanup file watcher / polling
  - Multiple providers nested → innermost wins [INFERRED]
  - Context updates → re-evaluate all flags

- **Priority:** Must-have
- **Dependencies:** FR-002, FR-003, FR-005

---

### FR-009: Vue Composable Integration

- **Priority:** Should-have (v0.2)
- **User story:** As a Vue developer, I want composables for feature flags so that my components are reactive to flag changes.
- **Description:**

```vue
<script setup>
import { useFlag, useVariant, provideTinyFlag } from 'tinyflag/vue';

provideTinyFlag({ source: './flags.yml', context: { userId: '123' } });

const showCheckout = useFlag('new-checkout'); // Ref<boolean>
const theme = useVariant('dark-mode'); // Ref<string | null>
</script>
```

- **Acceptance criteria:**
  1. Given `provideTinyFlag` called in a parent component, When a child calls `useFlag('x')`, Then it returns a reactive `Ref<boolean>`.
  2. Given a flag change, When the flag value updates, Then the Ref updates and the component re-renders.
  3. Given `useFlag` called without `provideTinyFlag`, When the component mounts, Then a descriptive error is thrown.
  4. [DECIDED] Given a Nuxt app using SSR, When `useFlag` is called during server-side rendering, Then it evaluates flags using the server-provided context and hydrates correctly on the client.

- **Edge cases:** Same as FR-008 (provider cleanup, context updates).
- **Dependencies:** FR-002, FR-003, FR-005

---

### FR-010: Svelte Store Integration

- **Priority:** Should-have (v0.2)
- **User story:** As a Svelte developer, I want a Svelte store for feature flags so that I can use `$` syntax for reactive flag values.
- **Description:**

```svelte
<script>
import { createTinyFlag, flag, variant } from 'tinyflag/svelte'

createTinyFlag({ source: './flags.yml', context: { userId: '123' } })

const showCheckout = flag('new-checkout')     // Readable<boolean>
const theme = variant('dark-mode')            // Readable<string | null>
</script>

{#if $showCheckout}
  <NewCheckout />
{/if}
```

- **Acceptance criteria:**
  1. Given `createTinyFlag` called, When `flag('x')` is called, Then it returns a Svelte `Readable<boolean>` store.
  2. Given a flag change, When the store updates, Then `$store` reflects the new value.
  3. [DECIDED] Given a SvelteKit app using SSR, When `flag()` is called during server-side rendering, Then it evaluates flags using the server-provided context and hydrates correctly on the client.

- **Edge cases:** Same as FR-008.
- **Dependencies:** FR-002, FR-003, FR-005

---

### FR-011: Exposure Tracking

- **Priority:** Should-have (v0.3)
- **User story:** As a developer running A/B tests, I want to track which users were exposed to which variants so that I can analyze experiment results in my analytics tool.
- **Description:**

```typescript
ff.on('exposure', (event: ExposureEvent) => {
  // Emitted every time isEnabled() or getVariant() is called with a userId
  // {
  //   flag: string,
  //   variant: string | null,
  //   enabled: boolean,
  //   userId: string,
  //   timestamp: number (Unix ms)
  // }
  analytics.track('feature_exposure', event);
});
```

The SDK emits events but does NOT store, persist, or transmit any data. The consumer is responsible for handling events according to their privacy policy.

[INFERRED] Deduplication: by default, emit only once per `(flag, userId)` pair per session. Provide `deduplicate: false` option to emit every call.

- **Acceptance criteria:**
  1. Given an `exposure` listener registered, When `isEnabled('x', { userId: '1' })` is called, Then the listener receives an event with `{ flag: 'x', userId: '1', enabled: true/false }`.
  2. Given deduplication is enabled (default), When the same flag/user pair is evaluated twice, Then the event fires only once.
  3. Given no `exposure` listener, When flags are evaluated, Then no performance overhead from event construction. [INFERRED]
  4. Given `isEnabled` called without a userId, When evaluated, Then no exposure event is emitted.

- **Edge cases:**
  - Listener throws an error → catch and emit on `error` event, do not break evaluation [INFERRED]
  - Many listeners registered → all are called in registration order

- **Dependencies:** FR-002, FR-003

---

### FR-012: Flag Change Events

- **Priority:** Should-have (v0.3)
- **User story:** As a developer, I want to be notified when flag values change so that I can log changes or trigger side effects.
- **Description:**

```typescript
ff.on('change', (event: ChangeEvent) => {
  // {
  //   flag: string,
  //   previous: FlagDefinition,
  //   current: FlagDefinition,
  //   timestamp: number
  // }
});
```

- **Acceptance criteria:**
  1. Given a file watcher detects a change, When the flag file is re-loaded, Then a `change` event is emitted for each flag whose definition changed.
  2. Given a flag was added, When the change event fires, Then `previous` is `undefined` and `current` is the new definition.
  3. Given a flag was removed, When the change event fires, Then `previous` is the old definition and `current` is `undefined`.
  4. Given the file was modified but no flag values changed, When re-loaded, Then no `change` events are emitted.

- **Edge cases:**
  - Many flags change at once → one event per changed flag, all emitted in the same tick [INFERRED]
  - Listener throws → catch and emit on `error` event

- **Dependencies:** FR-006

---

### FR-013: GitHub Action — Flag Validation

- **Priority:** Should-have (v0.3)
- **User story:** As a team lead, I want flag file changes validated automatically in PRs so that malformed flags never reach production.
- **Description:**

```yaml
# .github/workflows/flags.yml
- uses: tinyflag/validate-action@v1
  with:
    flags-file: ./flags.yml
```

Behavior:

1. Validates `flags.yml` against the JSON Schema
2. If invalid → fail the check with descriptive errors
3. If valid and flags changed → post a PR comment summarizing changes:
   ```
   🚩 Flag changes detected:
   - `new-checkout` rollout: 10% → 50%
   - `dark-mode` enabled: false → true
   + `payment-v2` added (enabled: false, rollout: 0%)
   ```

- **Acceptance criteria:**
  1. Given a PR modifying `flags.yml` with valid changes, When the action runs, Then it passes and posts a summary comment.
  2. Given a PR with an invalid flags file, When the action runs, Then it fails the check with validation errors in the output.
  3. Given a PR that does not modify `flags.yml`, When the action runs, Then it passes silently (no comment).

- **Edge cases:**
  - `flags.yml` does not exist in the repo → action fails with helpful error
  - PR has merge conflicts in `flags.yml` → action fails with parse error

- **Dependencies:** FR-001

---

### FR-014: CLI Tool

- **Priority:** Should-have (v0.3)
- **User story:** As a developer, I want CLI commands to validate flag files and see diffs so that I can catch errors before committing.
- **Description:**

```bash
npx tinyflag validate ./flags.yml       # Validate schema, exit 0 on success, 1 on failure
npx tinyflag diff main..HEAD            # Show flag changes between git refs
npx tinyflag generate ./flags.yml       # Generate TypeScript types (see FR-007)
```

`validate` output (on failure):

```
❌ flags.yml validation failed:
  - flags.new-checkout.rollout: must be 0-100, got 150
  - flags.dark-mode: missing required field "enabled"
```

`diff` output:

```
🚩 Flag changes (main → HEAD):
  ~ new-checkout.rollout: 10% → 50%
  ~ dark-mode.enabled: false → true
  + payment-v2 (enabled: false)
  - legacy-nav (removed)
```

- **Acceptance criteria:**
  1. Given a valid flags file, When `validate` is run, Then it exits with code 0 and prints "✅ flags.yml is valid".
  2. Given an invalid flags file, When `validate` is run, Then it exits with code 1 and prints each error with field path.
  3. Given two git refs with flag changes, When `diff` is run, Then it shows added/removed/modified flags.
  4. Given two git refs with no flag changes, When `diff` is run, Then it prints "No flag changes."

- **Edge cases:**
  - Git ref does not exist → error with "ref not found"
  - Not inside a git repo → `diff` command fails with helpful error
  - `diff` on a renamed flags file → detect via `--flags-file` CLI option; default is `flags.yml` [INFERRED]

- **Dependencies:** FR-001

---

### FR-015: Static Micro-Dashboard

- **Priority:** Nice-to-have (v1.0)
- **User story:** As a team lead, I want a visual overview of all feature flags so that I can quickly see what's enabled, rollout percentages, and targeting rules without reading YAML.
- **Description:**
  - Single HTML file (self-contained, zero backend)
  - Reads flags from a URL, file upload, or pasted YAML/JSON
  - Displays: flag name, enabled state (visual toggle), description, rollout %, rules summary, tags
  - Search and filter by name, tag, or enabled state
  - Read-only by default
  - Optional "edit & download" mode: modify values in the UI, then download the updated YAML/JSON file
  - Deployable to GitHub Pages, Vercel, Netlify, or opened locally

- **Acceptance criteria:**
  1. Given a valid flags URL, When the dashboard loads, Then all flags are displayed with their current state.
  2. Given a flag with rollout 50%, When viewed in the dashboard, Then a visual progress bar shows 50%.
  3. Given the search box, When a user types a flag name, Then the list filters in real-time.
  4. Given "edit & download" mode is enabled, When a user toggles a flag and clicks download, Then a valid YAML/JSON file is downloaded with the change applied.
  5. Given no flags URL is configured, When the dashboard loads, Then it shows a file upload prompt and a paste area.

- **Edge cases:**
  - URL returns 404 → show error with retry button
  - Flags file is very large (1000+ flags) → paginate or virtualize the list [INFERRED]
  - Browser has no internet → show file upload / paste mode

- **Dependencies:** FR-001

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Metric                              | Target                                                 | Measurement           |
| ----------------------------------- | ------------------------------------------------------ | --------------------- |
| Flag evaluation latency             | < 0.1ms (p99) per call                                 | Benchmark suite in CI |
| SDK initialization (file source)    | < 10ms for a 100-flag file                             | Benchmark             |
| SDK initialization (URL source)     | < network RTT + 10ms                                   | Benchmark             |
| Memory footprint                    | < 1MB for 1,000 flags                                  | Memory profiling      |
| Bundle size (core)                  | < 8KB gzipped [DECIDED — revised for full YAML parser] | CI build step         |
| Bundle size (per framework binding) | < 2KB gzipped                                          | CI build step         |

### 5.2 Reliability

| Metric                    | Target                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Evaluation never throws   | `isEnabled` and `getVariant` never throw exceptions. Errors are emitted via `error` event and safe defaults are returned (`false` / `null`). |
| Deterministic consistency | Same `(flagName, userId)` pair → identical result. Always. Across SDK versions.                                                              |
| Hot reload safety         | Invalid config changes never break running evaluation. Last valid config is retained.                                                        |

### 5.3 Compatibility

| Runtime            | Minimum Version                                                    |
| ------------------ | ------------------------------------------------------------------ |
| Node.js            | 18+                                                                |
| Bun                | 1.0+ [INFERRED]                                                    |
| Deno               | 1.28+ [INFERRED]                                                   |
| Cloudflare Workers | Current                                                            |
| Browsers           | ES2020+ (Chrome 80+, Firefox 80+, Safari 14+, Edge 80+) [INFERRED] |

| Build Target      | Requirement                                        |
| ----------------- | -------------------------------------------------- |
| Module format     | ESM (primary) + CJS (via `exports` map) [INFERRED] |
| Tree-shaking      | Unused framework bindings excluded from bundle     |
| Zero dependencies | Core package has zero npm `dependencies`           |

### 5.4 Security

- **Flag file integrity:** The SDK trusts the flag file. If using URL source over HTTP (not HTTPS), emit a warning at initialization. [INFERRED]
- **No secrets in flags:** Flag files are designed to be committed to Git. Documentation must warn against storing secrets (API keys, tokens) in flag definitions or rule conditions.
- **Exposure event PII:** The SDK emits events containing `userId`. The SDK does not store, persist, or transmit this data. Documentation must advise consumers to handle PII per their privacy policy (GDPR, CCPA, etc.).
- **URL source authentication:** [DECIDED] The SDK supports custom headers for URL sources via a `headers` config option. This enables `Authorization` headers for authenticated endpoints. Header values must never be logged or included in error messages. Example:
  ```typescript
  const ff = new TinyFlag({
    source: 'https://api.example.com/flags.json',
    headers: { Authorization: 'Bearer <token>' },
  });
  ```

### 5.5 Accessibility (Dashboard Only)

- WCAG 2.1 AA compliance for the micro-dashboard
- Keyboard navigable
- Screen reader compatible
- Sufficient color contrast for flag status indicators

### 5.6 Testing

| Metric               | Target                                                      |
| -------------------- | ----------------------------------------------------------- |
| Line coverage        | > 90%                                                       |
| Branch coverage      | > 85% [INFERRED]                                            |
| Property-based tests | Required for hash distribution and deterministic evaluation |
| Cross-runtime tests  | CI matrix: Node.js 18/20/22, Bun, Deno [INFERRED]           |

### 5.7 Documentation

- README with quickstart (< 60 seconds to first flag)
- Full API reference
- Examples for each framework integration
- Migration guide from LaunchDarkly/Unleash (conceptual mapping)
- `flags.schema.json` published for IDE autocompletion

### 5.8 License

- MIT

---

## 6. User Flows

### 6.1 First-Time Setup (Happy Path)

1. Developer runs `npm install tinyflag`
2. Creates `flags.yml` in project root:
   ```yaml
   version: 1
   flags:
     new-checkout:
       enabled: true
       rollout: 50
   ```
3. Imports and initializes:
   ```typescript
   import { TinyFlag } from 'tinyflag';
   const ff = new TinyFlag({ source: './flags.yml' });
   ```
4. Evaluates a flag:
   ```typescript
   if (ff.isEnabled('new-checkout', { userId: user.id })) {
     showNewCheckout();
   }
   ```
5. Total time: < 60 seconds.

**Error path:** Step 2 has a typo in YAML → Step 3 throws with a validation error including the line number and expected format.

### 6.2 A/B Test Experiment

1. Developer defines variants in `flags.yml`:
   ```yaml
   flags:
     checkout-flow:
       enabled: true
       variants:
         - name: control
           weight: 50
         - name: new-flow
           weight: 50
   ```
2. Evaluates variant: `const variant = ff.getVariant('checkout-flow', { userId })`
3. Registers exposure listener: `ff.on('exposure', (e) => analytics.track(e))`
4. Ships code. Users are deterministically bucketed.
5. Analyzes experiment results in their analytics tool.

**Error path:** Variant weights are `[50, 30]` (don't sum to 100) → Weights are treated as relative proportions (50/80 = 62.5%, 30/80 = 37.5%). This is by design — weights are relative, not absolute percentages.

### 6.3 Gradual Rollout

1. Developer sets `rollout: 10` for a flag.
2. Commits and pushes. 10% of users see the feature.
3. No issues reported. Updates to `rollout: 50`, commits.
4. Hot reload picks up the change. Now 50% of users see it.
5. All good. Sets `rollout: 100`, removes rollout field.

**Error path:** At step 3, an editor saves a temp file that corrupts the YAML → hot reload emits `error` event, retains `rollout: 10` state until a valid file is saved.

### 6.4 PR-Based Flag Review

1. Developer creates a branch, modifies `flags.yml` to change `new-checkout.rollout` from 10 to 50.
2. Opens a PR.
3. GitHub Action runs `tinyflag validate`, passes.
4. Action posts a comment: "🚩 `new-checkout` rollout: 10% → 50%"
5. Team reviews the flag change alongside the code change.
6. PR is merged. Production picks up new flag values.

**Error path:** Developer introduces a schema error → Action fails the check, PR cannot be merged until fixed.

### 6.5 Edge Runtime Usage

1. Developer building a Cloudflare Worker.
2. Flags are defined inline (no filesystem):
   ```typescript
   const ff = new TinyFlag({
     source: { version: 1, flags: { 'new-feature': { enabled: true, rollout: 20 } } },
   });
   ```
3. Or fetched from a KV store / R2 bucket via URL source.
4. Evaluates flags in the request handler with zero cold-start penalty.

**Error path:** URL source times out on cold start → initialization fails, worker returns 500. Developer should pre-warm or use inline source for critical flags.

---

## 7. Data Model (Conceptual)

### 7.1 Entities

```
┌─────────────────┐      ┌──────────────────┐
│   FlagConfig     │      │   UserContext     │
│─────────────────│      │──────────────────│
│ version: number  │      │ userId?: string   │
│ flags: Map<name, │──┐   │ [key]: any        │
│   FlagDefinition>│  │   └──────────────────┘
└─────────────────┘  │            │
                     │            │ (passed at evaluation time)
                     ▼            ▼
           ┌──────────────────┐
           │  FlagDefinition   │
           │──────────────────│
           │ enabled: boolean  │
           │ description?: str │
           │ tags?: string[]   │
           │ rollout?: number  │
           │ rules?: Rule[]    │───── ┌──────────────┐
           │ variants?:        │      │    Rule       │
           │   Variant[]       │──┐   │──────────────│
           └──────────────────┘  │   │ conditions:   │
                                 │   │  Record<>     │
                                 │   │ enabled?: bool│
                                 │   │ rollout?: num │
                                 │   │ variant?: str │
                                 │   └──────────────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │   Variant    │
                          │──────────────│
                          │ name: string │
                          │ weight: number│
                          └──────────────┘
```

### 7.2 Data Ownership & Access

- **Flag definitions** are owned by the repository (Git). Anyone with repo access can read; write access is controlled by Git branch permissions.
- **UserContext** is provided at runtime by the consuming application. The SDK does not persist or transmit context data.
- **Exposure events** are emitted to consumer-registered listeners. The SDK has no storage layer.

### 7.3 Sensitive Fields

- `UserContext.userId` — PII. Consumers must handle per their privacy policy.
- `UserContext.email` — PII if used in targeting rules.
- Flag definitions themselves should NOT contain secrets (documented warning).

---

## 8. Integration Points

### 8.1 Analytics Adapters (Consumer-Side)

The SDK emits events. Consumers integrate with their analytics tool:

| Analytics Tool | Integration Pattern                                                    |
| -------------- | ---------------------------------------------------------------------- |
| Segment        | `ff.on('exposure', (e) => analytics.track('Flag Exposure', e))`        |
| PostHog        | `ff.on('exposure', (e) => posthog.capture('$feature_flag_called', e))` |
| Mixpanel       | `ff.on('exposure', (e) => mixpanel.track('Feature Exposure', e))`      |
| Custom         | `ff.on('exposure', yourHandler)`                                       |

No built-in analytics integration. This is by design (zero dependencies).

### 8.2 CI/CD Systems

| System         | Integration                                         |
| -------------- | --------------------------------------------------- |
| GitHub Actions | Official `tinyflag/validate-action@v1` (FR-013)     |
| Other CI       | `npx tinyflag validate ./flags.yml` (exit code 0/1) |

### 8.3 CDN / Remote Sources

The URL source can fetch from:

- GitHub raw URLs (`https://raw.githubusercontent.com/...`)
- CDN-hosted flag files
- Custom API endpoints returning YAML/JSON
- Authenticated endpoints via `headers` config option (e.g., `Authorization: Bearer <token>`) [DECIDED]

### 8.4 Internal Systems

- **Git** — `tinyflag diff` uses `git show` to compare flag files across refs
- **File system** — `fs.watch` for hot reload, `fs.readFileSync` for loading

---

## 9. UX/UI Requirements (Micro-Dashboard)

### 9.1 Layout

```
┌────────────────────────────────────────────────────────────┐
│  🚩 TinyFlag Dashboard                    [Source: URL ▼]  │
├────────────────────────────────────────────────────────────┤
│  🔍 Search flags...          [All ▼] [Enabled ▼] [Tag ▼]  │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ● new-checkout                              ENABLED  │  │
│  │   Rollout: ████████░░░░░░░░ 50%                      │  │
│  │   Tags: checkout, experiment                         │  │
│  │   2 rules · 2 variants                    [Details ▶]│  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ ○ dark-mode                                DISABLED  │  │
│  │   No rollout                                         │  │
│  │   Tags: ui                                           │  │
│  │   0 rules · 0 variants                   [Details ▶] │  │
│  └──────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────┤
│  Total: 12 flags · 8 enabled · 4 disabled                 │
└────────────────────────────────────────────────────────────┘
```

### 9.2 States

| State                      | Display                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Loading**                | Centered spinner with "Loading flags..." text                                        |
| **Empty** (no flags)       | Illustration + "No flags defined. Create a flags.yml to get started." + link to docs |
| **Error** (invalid source) | Red banner with error message + retry button                                         |
| **Loaded**                 | Flag list as shown above                                                             |
| **No results** (search)    | "No flags match your search." with clear filter button                               |

### 9.3 Design Constraints

- Single HTML file (inline CSS/JS, no external assets)
- Light and dark mode (prefers-color-scheme) [INFERRED]
- Mobile responsive (min-width: 320px) [INFERRED]
- No framework dependency (vanilla JS) [INFERRED]

---

## 10. Release & Rollout

### 10.1 Rollout Strategy

| Phase            | Timeline  | Deliverables                                                                    | Exit Criteria                                                                                            |
| ---------------- | --------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Alpha (v0.1)** | Weeks 1–2 | Core SDK, YAML/JSON loader, targeting rules, rollout hashing, `generate` CLI    | All FR-001–FR-005, FR-007 acceptance criteria pass. 90%+ test coverage.                                  |
| **Beta (v0.2)**  | Weeks 3–4 | React/Vue/Svelte bindings with SSR support, URL source with polling, hot reload | All FR-006, FR-008–FR-010 acceptance criteria pass (including SSR). 3+ framework examples including SSR. |
| **RC (v0.3)**    | Weeks 5–6 | Event hooks, GitHub Action, `validate`/`diff` CLI, 4+ example apps              | All FR-011–FR-014 acceptance criteria pass. Beta user feedback incorporated.                             |
| **GA (v1.0)**    | Weeks 7–8 | Micro-dashboard, docs site, migration guides                                    | FR-015 acceptance criteria pass. Docs complete. Launch campaign ready.                                   |

### 10.2 Versioning

- Semantic versioning (semver) from v0.1.0
- Pre-1.0 releases: minor version bumps may include breaking changes (documented in CHANGELOG)
- Post-1.0: breaking changes only in major versions
- [INFERRED] Each package in the monorepo is versioned independently

### 10.3 Rollback Criteria

- If a release introduces evaluation inconsistency (same input → different output), issue a patch within 24 hours
- If bundle size exceeds 8KB gzipped, block release until resolved
- If any runtime in the compatibility matrix fails tests, block release

### 10.4 Migration

TinyFlag is a new product — no migration from a previous version. Migration guides from competing products (LaunchDarkly, Unleash) will be conceptual mappings, not automated tools. [INFERRED]

---

## 11. Open Questions

| #   | Question                                                                     | Resolution                                                                                                                                              |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Should we support a lightweight server mode for centralized flag management? | **No for v1.** Defer to v2+ based on user demand. The "no server" philosophy is the core differentiator.                                                |
| 2   | Should variant weights support dynamic adjustment via environment variables? | **No for v1.** Users can modify the flag file. Env var overrides are a v2+ feature.                                                                     |
| 3   | Should we build a VS Code extension for inline flag previews?                | **No for v1.** Defer based on community demand (GitHub issue tracking).                                                                                 |
| 4   | ~~Should the SDK support `Authorization` headers for URL sources?~~          | **[DECIDED] Yes.** Add `headers` option to config. Header values must never be logged.                                                                  |
| 5   | ~~How should unknown/extra fields in the flag file be handled?~~             | **[DECIDED] Lenient.** Ignore unknown fields and emit a warning. Strict mode available as opt-in via `strict: true`.                                    |
| 6   | ~~When `rollout` is set but no `userId` in context, what should happen?~~    | **[DECIDED] Fall through to global `enabled` state.** Rollout without a userId is skipped; the flag's `enabled` value is returned.                      |
| 7   | ~~Should the YAML parser support the full YAML spec or a minimal subset?~~   | **[DECIDED] Full YAML spec.** Built-in parser supports the complete YAML 1.2 specification. Bundle size target revised to < 8KB gzipped to accommodate. |
| 8   | ~~Should SSR be supported in v1 for React/Vue/Svelte?~~                      | **[DECIDED] Yes.** SSR support included in v0.2 alongside framework bindings. React (Next.js/Remix), Vue (Nuxt), Svelte (SvelteKit).                    |
| 9   | Should the monorepo use pnpm workspaces and tsup for building?               | **Yes.** pnpm for workspace management, tsup for zero-config TypeScript bundling with ESM + CJS output.                                                 |

---

## Implementation Notes [INFERRED]

These are architectural decisions inferred from the PRD. Validate with the author.

- **Monorepo structure:** pnpm workspaces with `packages/core`, `packages/react`, `packages/vue`, `packages/svelte`, `packages/cli`, `packages/github-action`
- **Build tool:** tsup (zero-config, supports ESM + CJS, tree-shaking)
- **Test framework:** vitest (fast, ESM-native, good TypeScript support)
- **MurmurHash3:** Custom implementation (~200 bytes) for zero dependencies
- **YAML parser:** [DECIDED] Custom full-spec YAML 1.2 parser built in-house (zero dependencies). Supports anchors, aliases, multiline blocks, tags, and all YAML 1.2 features. Bundle size target relaxed to < 8KB gzipped to accommodate.
- **Package publishing:** Each package published independently to npm
- **CI:** GitHub Actions matrix testing Node.js 18/20/22, Bun, Deno
