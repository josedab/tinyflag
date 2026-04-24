# TinyFlag + Express.js Example

This example demonstrates using TinyFlag in an Express-style API handler to gate features per user.

## What It Shows

- Feature flags in an API request handler pattern
- Rule-based flags for plan-based access (`pro`, `enterprise`)
- Rollout-based gradual feature release
- Returning flag states as a JSON API response

## Prerequisites

- Node.js >= 18
- [tsx](https://github.com/privatenumber/tsx) (or any TypeScript runner)

## Run

```bash
npx tsx examples/express/server.ts
```
