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

## Run Locally

```bash
npx wrangler dev examples/cloudflare-worker/index.ts
```

Then visit `http://localhost:8787/?userId=user-1`.
