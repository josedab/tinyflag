# TinyFlag + Deno Example

This example demonstrates using TinyFlag with the Deno runtime.

## What It Shows

- Deno-compatible TinyFlag usage
- Geo-based targeting rules (`country: { $in: ['US', 'CA', 'UK'] }`)
- A/B testing with weighted variants
- Evaluating flags for multiple users

## Prerequisites

- [Deno](https://deno.land/) v1.x or later

## Run

```bash
deno run --allow-net examples/deno/server.ts
```
