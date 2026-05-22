# tinyflag-server

Lightweight HTTP server for serving TinyFlag configs over REST and WebSocket.

## Quick Start

```bash
# Start with local flags file
FLAGS_FILE=./flags.yml npx tinyflag-server

# Or with Docker
docker build -t tinyflag-server .
docker run -p 3939:3939 -v $(pwd)/flags.yml:/app/flags.yml tinyflag-server
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/flags` | GET | Returns JSON flag configuration |
| `/health` | GET | Health check |
| `/webhook` | POST | Trigger reload (+ git pull if enabled) |
| `ws://` | WS | Real-time flag updates |

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3939` | Server port |
| `FLAGS_FILE` | `flags.yml` | Path to flags file |
| `GIT_AUTO_PULL` | `false` | Run `git pull` on webhook |
| `CORS_ORIGIN` | `*` | CORS origin header |

## Client Usage

```ts
// REST polling
const ff = new TinyFlag({ source: 'http://localhost:3939/flags', pollInterval: 10000 });

// WebSocket (auto-reconnect)
const ws = new WebSocket('ws://localhost:3939');
ws.onmessage = (e) => {
  const { type, flags } = JSON.parse(e.data);
  if (type === 'flags-updated') ff.reload({ flags });
};
```

## Deploy

### Railway
```bash
railway init && railway up
```

### Fly.io
```bash
fly launch --image tinyflag-server
```

### Render
Create a Web Service pointing to this directory with:
- Build: `npm run build`
- Start: `node dist/index.js`
