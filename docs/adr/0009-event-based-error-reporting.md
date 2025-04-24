# ADR-0009: Event-Based Error Reporting over Exceptions

## Status

Accepted

## Context

TinyFlag needs to communicate several categories of non-fatal issues to developers:

- **Flag not found** — typo or missing definition
- **Load errors** — flag file reload failures (network timeout, parse error)
- **Configuration warnings** — unknown fields, insecure HTTP sources, clamped poll intervals
- **Lifecycle notifications** — sunset flag warnings, circular dependency detection
- **Listener failures** — user-provided event handlers that throw

These are non-fatal because the SDK can continue operating (using last-known-good config or safe defaults). Throwing exceptions would violate the [evaluation-never-throws invariant (ADR-0005)](./0005-evaluation-never-throws.md).

## Decision

TinyFlag uses a **typed event system** for all non-fatal error reporting:

```typescript
ff.on('error', (event) => {
  // event.code: TinyFlagErrorCode (union of known codes)
  // event.message: human-readable description
  // event.flagName?: the flag that caused the error
});
```

Error codes are defined as a TypeScript union type (`TinyFlagErrorCode`) enabling programmatic matching without string parsing:

```typescript
type TinyFlagErrorCode =
  | 'FLAG_NOT_FOUND'
  | 'INVALID_FLAG_NAME'
  | 'LOAD_ERROR'
  | 'UNKNOWN_FIELD'
  | 'INSECURE_SOURCE'
  | 'POLL_INTERVAL_CLAMPED'
  | 'LISTENER_ERROR'
  | 'CIRCULAR_DEPENDENCY'
  | 'PERSONA_NOT_FOUND'
  | 'SUNSET_FLAG'
  | 'PARSE_ERROR'
  | 'FETCH_ERROR'
  | 'WS_ERROR';
```

The event emitter itself is safe: listener errors are caught and re-emitted as `LISTENER_ERROR` events, preventing cascading failures.

## Consequences

**Positive:**

- Non-fatal issues don't crash the application
- Errors are structured and machine-readable (code + message + flag name)
- Users can programmatically route errors (e.g., `LOAD_ERROR` → alerting, `FLAG_NOT_FOUND` → logging)
- Event listeners can be added/removed at runtime
- Multiple consumers can listen to the same error stream

**Negative:**

- If no error listener is attached, errors are silently dropped
- Developers must explicitly opt in to error monitoring
- Event-based errors don't appear in standard `try/catch` flows

**Design invariant:** The event emitter catches listener exceptions and re-emits them as `LISTENER_ERROR`. This prevents a buggy error handler from taking down the evaluation pipeline. Error-event listeners that themselves throw are silently dropped to prevent infinite recursion.
