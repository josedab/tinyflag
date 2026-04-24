# tinyflag

**Feature flags that fit in your pocket.**

Serverless, file-driven, zero-dependency feature flag SDK for JavaScript/TypeScript. Define flags in YAML or JSON, commit to Git, evaluate everywhere — no server, no dashboard, no vendor lock-in.

[![npm version](https://img.shields.io/npm/v/tinyflag)](https://www.npmjs.com/package/tinyflag)
[![bundle size](https://img.shields.io/bundlephobia/minzip/tinyflag)](https://bundlephobia.com/package/tinyflag)
[![license](https://img.shields.io/npm/l/tinyflag)](https://github.com/josedab/tinyflag/blob/main/LICENSE)

## Install

```bash
npm install tinyflag
```

## Quick Start

```typescript
import { TinyFlag } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

if (ff.isEnabled('new-checkout', { userId: user.id })) {
  showNewCheckout();
}
```

## Features

- 🗂️ **File-driven** — YAML or JSON flag files, committed to Git
- 📦 **Zero dependencies** — < 8KB gzipped
- 🎯 **Targeting rules** — user segments, glob patterns, numeric comparisons
- 🎲 **Percentage rollouts** — deterministic bucketing by user ID
- 🧪 **A/B testing** — weighted variants with exposure tracking
- 🌐 **Multiple sources** — file, URL, or inline config
- 🔄 **Live reload** — file watching and URL polling
- 🏗️ **TypeScript-first** — full type safety with codegen

## Documentation

Full documentation, API reference, and framework integration guides are available in the [main repository](https://github.com/josedab/tinyflag).

## License

[MIT](https://github.com/josedab/tinyflag/blob/main/LICENSE)
