# ADR-0007: Dual ESM/CJS Output with tsup

## Status

Accepted

## Context

The JavaScript ecosystem is mid-transition from CommonJS (CJS) to ES Modules (ESM). Consumers of TinyFlag include:

- **ESM-first**: Modern frameworks (Next.js 13+, Vite, SvelteKit), Deno, modern Bun
- **CJS-first**: Legacy Node.js applications, Jest test runners, older build tools
- **Bundler**: Webpack, Rollup, esbuild — these can consume either format but tree-shake better with ESM

Shipping only ESM would break CJS consumers. Shipping only CJS would prevent tree-shaking and produce "dual-package hazard" warnings in ESM environments.

## Decision

All TinyFlag packages use **tsup** (esbuild-based) to produce dual output:

- `dist/index.js` — ESM (for `import`)
- `dist/index.cjs` — CJS (for `require()`)
- `dist/index.d.ts` / `dist/index.d.cts` — TypeScript declarations for both

The `package.json` `exports` map routes consumers to the correct format:

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  }
}
```

Build configuration: minified, sourcemapped, ES2020 target.

## Consequences

**Positive:**

- Works in all JavaScript environments without consumer configuration
- ESM consumers get tree-shaking (unused exports are eliminated by bundlers)
- TypeScript consumers get proper type resolution in both module systems
- Sourcemaps enable debugging through minified code
- < 8KB gzipped (enforced in CI for core package)

**Negative:**

- Dual output doubles the package size on disk (mitigated by minification)
- `.d.cts` files are an additional artifact to maintain
- `tsup` is a dev dependency — its esbuild version must be kept current
- ES2020 target means no support for Node.js < 14 (acceptable — we require Node 18+)

**Subpath export:** The `tinyflag/testing` subpath export uses the same dual-output pattern, with its own entry point in the tsup config.
