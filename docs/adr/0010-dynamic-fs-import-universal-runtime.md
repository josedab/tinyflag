# ADR-0010: Dynamic `fs` Import for Universal Runtime Support

## Status

Accepted

## Context

TinyFlag must run in multiple JavaScript runtimes:

- **Node.js** (18+) — full filesystem access, `fs.watch` for hot reload
- **Bun** — Node.js-compatible `fs` module
- **Deno** — Node.js compatibility layer available
- **Browsers** — no filesystem, no `fs` module
- **Cloudflare Workers** — V8 isolate, no filesystem, no Node.js built-ins
- **Vercel Edge Runtime** — subset of Node.js APIs

The core SDK must be **bundlable for all these runtimes** from a single package. Statically importing `import fs from 'fs'` at the module level would:

- Crash in browsers and edge runtimes (module not available)
- Prevent bundlers from tree-shaking the fs dependency
- Make the core package Node.js-only

## Decision

TinyFlag uses **dynamic `import('fs')`** inside the functions that need filesystem access (`loadFromFile`, `startFileWatcher`). The import is wrapped in a try/catch to gracefully degrade in runtimes without `fs`:

```typescript
async function loadFromFile(filePath: string, strict: boolean): Promise<LoadResult> {
  let content: string;
  try {
    const fs = await import('fs');
    content = await fs.promises.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        'File source is not supported in this runtime. Use a URL or inline object instead.',
      );
    }
    throw error;
  }
  // ...
}
```

Similarly, the signing (`crypto`) and sync (`fs`) modules use static Node.js imports because they are inherently server-side features. They are tree-shaken out when not imported by the consumer.

## Consequences

**Positive:**

- Single package works in Node.js, Bun, Deno, browsers, and edge runtimes
- Bundlers can tree-shake `fs` calls when consumers use URL or inline sources
- Clear error messages guide users toward the right source type for their runtime
- No conditional `require()` that would break ESM consumers

**Negative:**

- Dynamic `import()` is asynchronous — `loadFromFile` must be `async` even though reading a file could be synchronous
- Some bundlers may emit warnings about dynamic imports (mitigated by the try/catch)
- File watching (`fs.watch`) silently fails in unsupported runtimes rather than producing an error
- The `signing.ts` and `sync.ts` modules use static `fs`/`crypto` imports and are therefore Node.js-only — they won't work in browsers even if imported

**Runtime detection strategy:** Rather than detecting the runtime explicitly (`typeof window`, `typeof Deno`), the SDK attempts the operation and handles the error. This is more robust than user-agent sniffing because new runtimes don't require SDK changes.
