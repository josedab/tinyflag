# Architecture & Design Decisions

## Overview

TinyFlag is a pnpm monorepo with independently versioned packages:

```
tinyflag/
├── packages/
│   ├── core/          → tinyflag (npm)
│   ├── react/         → tinyflag-react (npm)
│   ├── vue/           → tinyflag-vue (npm)
│   ├── svelte/        → tinyflag-svelte (npm)
│   ├── cli/           → tinyflag-cli (npm)
│   ├── github-action/ → composite GitHub Action
│   └── dashboard/     → single HTML file
├── examples/          → 7 example apps
├── docs/              → documentation
└── flags.schema.json  → JSON Schema
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Application                         │
└──────────┬──────────────────┬──────────────────┬────────────────┘
           │                  │                  │
     ┌─────▼─────┐     ┌─────▼─────┐     ┌──────▼─────┐
     │  React     │     │  Vue      │     │  Svelte    │
     │  Hooks     │     │  Compos-  │     │  Stores    │
     │            │     │  ables    │     │            │
     └─────┬──────┘     └─────┬─────┘     └──────┬─────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   TinyFlag Core   │
                    │   (tinyflag npm)  │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  ┌─────▼─────┐      ┌───────▼───────┐     ┌───────▼───────┐
  │  Loader   │      │  Evaluator    │     │  Event System │
  │           │      │               │     │               │
  │ • file    │      │ • isEnabled() │     │ • exposure    │
  │ • url     │      │ • getVariant()│     │ • change      │
  │ • inline  │      │ • rules       │     │ • error       │
  └─────┬─────┘      │ • rollout     │     └───────────────┘
        │             │ • overrides   │
  ┌─────▼─────┐      └───────┬───────┘
  │  Parser   │              │
  │           │       ┌──────▼───────┐
  │ • YAML    │       │  MurmurHash3 │
  │   (custom)│       │  (custom)    │
  │ • JSON    │       │              │
  └─────┬─────┘       │ • rollout    │
        │             │   bucketing  │
  ┌─────▼─────┐       │ • variant    │
  │  Schema   │       │   assignment │
  │ Validator │       └──────────────┘
  └───────────┘

  ┌───────────────────────────────────────┐
  │           CLI (tinyflag-cli)          │
  │  • validate  • generate  • diff      │
  └───────────────────────────────────────┘

  ┌───────────────────────────────────────┐
  │     GitHub Action (composite)         │
  │  • validate flags  • PR comments      │
  └───────────────────────────────────────┘
```

### Data Flow

```
flags.yml / URL / inline object
        │
        ▼
    ┌────────┐    ┌──────────┐    ┌──────────────┐
    │ Loader │───▶│  Parser  │───▶│  Validator   │
    └────────┘    │(YAML/JSON)│   │ (schema.ts)  │
                  └──────────┘    └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  FlagConfig   │
                                  │  (in-memory)  │
                                  └──────┬───────┘
                                         │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                   isEnabled()    getVariant()    getAllFlags()
                          │              │              │
                          ▼              ▼              ▼
                   ┌─────────────────────────────────────┐
                   │         Evaluation Pipeline         │
                   │  1. Check overrides                 │
                   │  2. Check enabled flag              │
                   │  3. Evaluate rules (conditions)     │
                   │  4. Rollout check (MurmurHash3)     │
                   │  5. Variant assignment (MurmurHash3)│
                   └─────────────┬───────────────────────┘
                                 │
                                 ▼
                          Emit exposure event
```

## Key Decisions

### Zero Dependencies

The core package has zero npm runtime `dependencies`. This is achieved by:

- Custom built-in YAML parser (~3KB)
- Custom MurmurHash3 implementation (~200B)
- Pure TypeScript with no external libraries

### Deterministic Hashing

MurmurHash3 (32-bit) is used for both rollout bucketing and variant assignment. The algorithm and seed values are frozen — they will never change in a way that alters existing assignments.

- Rollout: `murmurhash3("flagName:userId", seed=0) % 100`
- Variants: `murmurhash3("flagName:userId", seed=0x5f3759df) % totalWeight`

Different seeds ensure rollout and variant assignment are independent.

### Evaluation Never Throws

`isEnabled()` and `getVariant()` never throw exceptions. Errors are emitted via the `error` event. This prevents feature flags from crashing the host application.

### File-Driven, Git-Native

Flag definitions live in YAML/JSON files committed to Git. This means:

- Changes are reviewed in PRs
- History is tracked by Git
- No dashboard or server needed
- No vendor lock-in

### Build & Module Format

- **Build tool**: tsup (esbuild-based)
- **Output**: Dual ESM + CJS via `package.json` `exports` map
- **Target**: ES2020
- **Tree-shaking**: Framework bindings are separate packages — unused ones are never bundled
