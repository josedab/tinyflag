# ADR-0005: Evaluation Never Throws

## Status

Accepted

## Context

Feature flags are evaluated in application hot paths — request handlers, rendering pipelines, middleware chains. If a flag evaluation throws an exception, it can crash the entire request or render cycle. This is unacceptable: **feature flags should reduce risk, not introduce it.**

Common failure modes in flag evaluation:

- Flag name typo (flag not found)
- Flag file fails to reload (network error, parse error)
- Context is null/undefined
- Variant weights are misconfigured
- Circular prerequisite dependencies

## Decision

The two core evaluation methods — `isEnabled()` and `getVariant()` — **never throw exceptions**, regardless of input:

- `isEnabled()` returns `false` for any error case (unknown flags, empty names, evaluation failures)
- `getVariant()` returns `null` for any error case

Errors are reported via the event system instead:

```typescript
ff.on('error', (event) => {
  // { code: 'FLAG_NOT_FOUND', message: '...', flagName: '...' }
});
```

The only method that throws is `init()` on initial load — this is intentional because failing to load flags at startup is a fatal configuration error that should be caught early.

## Consequences

**Positive:**

- Feature flags never crash the host application
- Safe to use in try-free code paths (middleware, React render, Vue computed)
- Developers get a sensible default (feature disabled) without explicit error handling
- Error events provide structured, typed error codes (`TinyFlagErrorCode`) for monitoring

**Negative:**

- Silent failures can hide configuration issues if no error listener is attached
- Developers must remember to attach an `error` listener to catch issues
- `false` for unknown flags may mask typos if the developer doesn't check error events

**Mitigation:** The CLI `validate` command and GitHub Action catch flag file errors at CI time, before they reach production. Debug logging (`setDebug(true)`) traces every evaluation step for local debugging.
