# TinyFlag + Deno Example

This example demonstrates using TinyFlag with the Deno runtime.

## What It Shows

- Deno-compatible TinyFlag usage
- Geo-based targeting rules (`country: { $in: ['US', 'CA', 'UK'] }`)
- A/B testing with weighted variants
- Evaluating flags for multiple users

## Prerequisites

- [Deno](https://deno.land/) v1.x or later
- From the repo root, run `pnpm install && pnpm -r build` first

## Run

```bash
deno run --allow-net examples/deno/server.ts
```

## Expected Output

```
🚩 TinyFlag — Deno Example

User: deno-user-1 (US)
  new-feature: true
  new-feature variant: control
  geo-feature: true

User: deno-user-2 (JP)
  new-feature: false
  new-feature variant: null
  geo-feature: false

User: deno-user-3 (CA)
  new-feature: true
  new-feature variant: experiment
  geo-feature: true
```

- `new-feature` uses a 50% rollout with equal-weight variants
- `geo-feature` is enabled only for users in US, CA, or UK via targeting rules
