# ADR-0008: Framework Bindings as Separate Packages

## Status

Accepted

## Context

TinyFlag supports React, Vue, and Svelte through framework-specific bindings that adapt the core SDK to each framework's reactivity model. These bindings need to:

- Re-render components when flag values change (via the `change` event)
- Provide idiomatic APIs (React hooks, Vue composables, Svelte stores)
- Support server-side rendering (SSR) with pre-initialized instances
- Clean up listeners on component unmount

Options considered:

1. **All-in-one package** — `tinyflag` exports React hooks, Vue composables, and Svelte stores
2. **Subpath exports** — `tinyflag/react`, `tinyflag/vue`, `tinyflag/svelte`
3. **Separate packages** — `tinyflag-react`, `tinyflag-vue`, `tinyflag-svelte`

## Decision

Framework bindings are published as **separate npm packages** (`tinyflag-react`, `tinyflag-vue`, `tinyflag-svelte`), each with `tinyflag` as a `peerDependency`.

Each binding follows a consistent API pattern:

| Concept         | React                   | Vue                        | Svelte                       |
| --------------- | ----------------------- | -------------------------- | ---------------------------- |
| Initialize      | `<TinyFlagProvider>`    | `provideTinyFlag()`        | `createTinyFlag()`           |
| Boolean flag    | `useFlag(name)`         | `useFlag(name)` → `Ref`    | `flag(name)` → `Readable`    |
| Variant         | `useVariant(name)`      | `useVariant(name)` → `Ref` | `variant(name)` → `Readable` |
| Instance access | `useTinyFlagInstance()` | `useTinyFlagInstance()`    | `useTinyFlagInstance()`      |
| SSR             | `instance` prop         | `instance` option          | `instance` option            |

## Consequences

**Positive:**

- Consumers only install the framework they use — no unused framework code in the bundle
- Each binding can version independently (a React-specific fix doesn't bump Vue)
- `peerDependencies` ensure consumers manage their framework version
- Clear separation of concerns: core evaluates, bindings integrate

**Negative:**

- More packages to maintain and publish (3 instead of 1)
- API must be kept consistent across bindings (manual effort, no code generation)
- Contributors adding a new binding must follow the established pattern (documented in CONTRIBUTING.md)

**SSR design:** All bindings accept a pre-initialized `TinyFlag` instance via an `instance` prop/option. This enables server-side rendering: the server initializes TinyFlag once, evaluates flags, and passes the instance to the framework binding. Without this, each binding would need to call `await init()` during rendering, which is problematic in synchronous render contexts.
