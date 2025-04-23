# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the TinyFlag SDK.

ADRs document significant architectural decisions, their context, and consequences. They help new contributors understand *why* the system is built the way it is.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-0001](./0001-zero-runtime-dependencies.md) | Zero Runtime Dependencies | Accepted |
| [ADR-0002](./0002-file-driven-git-native-storage.md) | File-Driven, Git-Native Flag Storage | Accepted |
| [ADR-0003](./0003-custom-yaml-parser.md) | Custom Built-in YAML Parser | Accepted |
| [ADR-0004](./0004-murmurhash3-deterministic-bucketing.md) | MurmurHash3 for Deterministic Bucketing | Accepted |
| [ADR-0005](./0005-evaluation-never-throws.md) | Evaluation Never Throws | Accepted |
| [ADR-0006](./0006-pnpm-monorepo.md) | pnpm Monorepo with Independent Versioning | Accepted |
| [ADR-0007](./0007-dual-esm-cjs-output.md) | Dual ESM/CJS Output with tsup | Accepted |
| [ADR-0008](./0008-framework-bindings-separate-packages.md) | Framework Bindings as Separate Packages | Accepted |
| [ADR-0009](./0009-event-based-error-reporting.md) | Event-Based Error Reporting over Exceptions | Accepted |
| [ADR-0010](./0010-dynamic-fs-import-universal-runtime.md) | Dynamic `fs` Import for Universal Runtime Support | Accepted |

## Format

Each ADR follows this structure:
- **Status**: Accepted, Superseded, or Deprecated
- **Context**: What prompted this decision
- **Decision**: What was decided
- **Consequences**: Tradeoffs and implications
