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

## Run

```bash
npx tsx examples/node/index.ts
```
