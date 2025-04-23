# ADR-0001: Zero Runtime Dependencies

## Status

Accepted

## Context

Feature flag SDKs are embedded in application code and evaluated on every request in hot paths. Any dependency added to the SDK becomes a dependency of every consumer application. Third-party dependencies introduce:

- **Bundle size bloat** — YAML parsers like `js-yaml` are 60KB+, hashing libraries add weight
- **Supply chain risk** — each transitive dependency is an attack surface (cf. `event-stream`, `colors.js` incidents)
- **Version conflicts** — consumers may pin different versions of shared dependencies, causing resolution issues
- **Update burden** — security patches in dependencies require SDK releases even when SDK code hasn't changed

Competing SDKs (LaunchDarkly ~50KB, Unleash ~30KB, GrowthBook ~20KB) all carry significant dependency trees.

## Decision

The TinyFlag core package (`tinyflag`) has **zero npm runtime `dependencies`**. Every capability is implemented from scratch in pure TypeScript:

- **YAML parsing**: Custom parser (~334 lines) supporting the YAML subset needed for flag files
- **Hashing**: Custom MurmurHash3 32-bit implementation (~92 lines)
- **Event system**: Custom typed event emitter (~52 lines)
- **HTTP**: Uses the platform-native `fetch()` API (available in Node 18+, Bun, Deno, browsers)

All tooling dependencies (`tsup`, `vitest`, `typescript`) are `devDependencies` only.

## Consequences

**Positive:**
- Core bundle is < 8KB gzipped (enforced in CI)
- Zero supply chain attack surface at runtime
- No version conflict risk for consumers
- SDK can be audited as a self-contained unit

**Negative:**
- Custom YAML parser doesn't support anchors, aliases, or custom tags (acceptable — flag files don't need them)
- Custom hashing must be proven equivalent to reference implementations (verified via test vectors)
- New capabilities (e.g., cryptographic signing) must use Node.js built-ins rather than popular libraries
- Higher maintenance burden — bugs in parsers or hash functions must be fixed in-house

**Trade-off accepted:** The YAML parser intentionally omits advanced YAML features (anchors `&`, aliases `*`, custom tags `!`). Users needing these features can use JSON format instead. This keeps the parser simple and the bundle small.
