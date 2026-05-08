# TinyFlag + Node.js Example

This example demonstrates basic TinyFlag usage in a standalone Node.js script.

## What It Shows

- Inline flag definitions with rollout percentages and variants
- Rule-based flags (e.g., beta access for `@company.com` emails)
- Using `isEnabled()` and `getVariant()` with user context
- Handling unknown flags (returns `false`)

## Prerequisites

- Node.js >= 18
- [tsx](https://github.com/privatenumber/tsx) (or any TypeScript runner)
- From the repo root, run `pnpm install && pnpm -r build` first

## Run

```bash
npx tsx examples/node/index.ts
```

## Expected Output

```
🚩 TinyFlag — Node.js Example

User: user-1 (alice@example.com)
  new-checkout: true
  new-checkout variant: new-flow
  dark-mode: false
  beta-features: false

User: user-2 (bob@company.com)
  new-checkout: false
  new-checkout variant: null
  dark-mode: false
  beta-features: true

User: user-3 (charlie@example.com)
  new-checkout: true
  new-checkout variant: control
  dark-mode: false
  beta-features: false

⚠️  FLAG_NOT_FOUND: Flag "unknown-flag" not found
unknown-flag: false
```

- `new-checkout` uses a 50% rollout — results are deterministic per userId
- `dark-mode` is disabled for everyone
- `beta-features` matches only `*@company.com` emails via rules
- Unknown flags return `false` and emit an error event
