---
sidebar_position: 9
title: CachedTinyFlag
description: Client with real-time updates via WebSocket push or HTTP polling.
---

# CachedTinyFlag

`CachedTinyFlag` is a client that maintains a local evaluation cache with real-time updates from a TinyFlag server via WebSocket push or HTTP polling.

## When to Use

Use `CachedTinyFlag` instead of `TinyFlag` when:

- You run a centralized TinyFlag server and want clients to receive flag updates in real-time
- You need WebSocket-based push updates for instant flag propagation
- You want automatic fallback from WebSocket to polling

For file-based or URL-based setups, use the standard `TinyFlag` class instead.

## Setup

```typescript
import { CachedTinyFlag } from 'tinyflag';

const client = new CachedTinyFlag({
  serverUrl: 'http://localhost:3939',
  mode: 'push', // 'push' (WebSocket) or 'poll' (HTTP)
  pollInterval: 30_000, // Polling interval (ms), for poll mode
  autoReconnect: true, // Reconnect WebSocket on disconnect
  pollingFallback: true, // Fall back to polling if WebSocket fails
  headers: {
    Authorization: 'Bearer <token>',
  },
});

await client.init();
```

## Evaluating Flags

The API matches `TinyFlag`:

```typescript
client.isEnabled('new-checkout', { userId: 'user-1' }); // boolean
client.getVariant('experiment', { userId: 'user-1' }); // string | null
client.getFlags(); // all flag definitions
client.isConnected(); // connection status
```

## Events

```typescript
client.on('change', (event) => {
  console.log(`Flag ${event.flag} changed`);
});

client.on('error', (event) => {
  console.warn(`Error: ${event.code} — ${event.message}`);
});
```

## Options

| Option            | Type                     | Default  | Description                        |
| ----------------- | ------------------------ | -------- | ---------------------------------- |
| `serverUrl`       | `string`                 | required | TinyFlag server URL                |
| `mode`            | `'push' \| 'poll'`       | `'push'` | Connection mode                    |
| `pollInterval`    | `number`                 | `30000`  | Polling interval (ms)              |
| `autoReconnect`   | `boolean`                | `true`   | Auto-reconnect WebSocket           |
| `pollingFallback` | `boolean`                | `true`   | Fall back to polling on WS failure |
| `headers`         | `Record<string, string>` | —        | Custom HTTP headers                |

## Cleanup

```typescript
client.destroy(); // Closes WebSocket, stops polling, removes listeners
```
