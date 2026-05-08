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
- From the repo root, run `pnpm install && pnpm -r build` first

## Run

```bash
npx tsx examples/express/server.ts
```

## Expected Output

```
🚩 TinyFlag — Express.js Example

Free user: {
  "userId": "user-1",
  "features": {
    "new-api": true,
    "premium-features": false
  }
}

Pro user: {
  "userId": "user-2",
  "features": {
    "new-api": false,
    "premium-features": true
  }
}
```

The `new-api` flag uses a 30% rollout, so results vary by userId. The `premium-features` flag is only enabled for users with `plan: "pro"` or `plan: "enterprise"`.

### HTTP Response Example

If adapted into a real Express server (e.g., `GET /api/features?userId=user-2&plan=pro`):

```json
{
  "userId": "user-2",
  "features": {
    "new-api": false,
    "premium-features": true
  }
}
```
