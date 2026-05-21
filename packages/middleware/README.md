# tinyflag-middleware

Server middleware for TinyFlag — Express, Fastify, and Hono adapters.

## Installation

```bash
npm install tinyflag tinyflag-middleware
```

## Express

```ts
import express from 'express';
import { TinyFlag } from 'tinyflag';
import { tinyflagExpress } from 'tinyflag-middleware/express';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

const app = express();
app.use(tinyflagExpress({
  instance: ff,
  contextFromRequest: (req) => ({
    userId: req.user?.id,
    plan: req.user?.plan,
  }),
}));

app.get('/', (req, res) => {
  if (req.flags.isEnabled('new-checkout')) {
    res.json({ checkout: 'v2' });
  }
});
```

## Fastify

```ts
import Fastify from 'fastify';
import { TinyFlag } from 'tinyflag';
import { tinyflagFastify } from 'tinyflag-middleware/fastify';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

const app = Fastify();
app.register(tinyflagFastify, {
  instance: ff,
  contextFromRequest: (req) => ({ userId: req.user?.id }),
});
```

## Hono

```ts
import { Hono } from 'hono';
import { TinyFlag } from 'tinyflag';
import { tinyflagHono } from 'tinyflag-middleware/hono';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

const app = new Hono();
app.use(tinyflagHono({
  instance: ff,
  contextFromRequest: (c) => ({ userId: c.get('userId') }),
}));
```

## OpenTelemetry Tracing

Enable tracing spans for flag evaluation:

```ts
tinyflagExpress({ instance: ff, tracing: true })
```
