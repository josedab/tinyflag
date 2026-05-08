# TinyFlag + Cloudflare Workers Example

This example demonstrates using TinyFlag in a Cloudflare Worker with inline flag definitions.

## What It Shows

- Inline flag source (Workers don't have filesystem access)
- Maintenance mode flag (system-level, no user context)
- A/B testing with variant-based landing page selection
- Reading user context from query parameters

## Prerequisites

- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI
- Cloudflare account (for deployment)
- From the repo root, run `pnpm install && pnpm -r build` first

## Run Locally

```bash
npx wrangler dev examples/cloudflare-worker/index.ts
```

Then visit `http://localhost:8787/?userId=user-1`.

## Expected Output

### Terminal

```
⬣ Listening on http://localhost:8787
```

### HTTP Response (`GET /?userId=user-1`)

```json
{
  "message": "Hello from TinyFlag on Cloudflare Workers!",
  "userId": "user-1",
  "landingVariant": "control",
  "flags": {
    "new-landing": true,
    "maintenance-mode": false
  }
}
```

- `new-landing` uses a 25% rollout with weighted variants (`control: 75`, `redesign: 25`)
- `maintenance-mode` is disabled — when enabled, the worker returns a `503` response instead
