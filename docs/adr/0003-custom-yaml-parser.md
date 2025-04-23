# ADR-0003: Custom Built-in YAML Parser

## Status

Accepted

## Context

Flag definition files use YAML as the primary format because YAML is human-friendly for configuration: it supports comments, is less verbose than JSON, and is widely understood by developers.

However, the standard YAML parser for JavaScript (`js-yaml`) is ~60KB minified and would violate the [zero-dependency constraint (ADR-0001)](./0001-zero-runtime-dependencies.md). The full YAML 1.2 specification includes features (anchors, aliases, custom tags, multi-document streams) that are unnecessary for flag definition files.

## Decision

TinyFlag includes a **custom YAML parser** (~334 lines) that supports the subset of YAML needed for flag configuration files:

- Mappings (key-value objects)
- Sequences (arrays), including flow syntax `[a, b, c]`
- Flow mappings `{key: value}`
- Scalars: strings (quoted and unquoted), numbers (int, float, hex, octal), booleans (`true`/`false`/`yes`/`no`/`on`/`off`), null (`~`, `null`)
- Comments (`#`)
- Multiline strings (literal `|` and folded `>` with block chomping `|-`/`>-`)
- Document separators (`---`/`...`)
- BOM handling

**Explicitly not supported:** Anchors (`&`), aliases (`*`), custom tags (`!`), and complex keys. Users needing these features are directed to use JSON format instead.

## Consequences

**Positive:**
- Adds ~3KB to bundle (vs ~60KB for `js-yaml`)
- No dependency supply chain risk
- Parser behavior is fully controlled and tested (100% coverage)
- Can be optimized specifically for the flag file schema

**Negative:**
- Advanced YAML users may be surprised by missing anchor/alias support
- Must maintain the parser in-house — any YAML edge case bugs are our responsibility
- Not a general-purpose YAML parser — cannot be extracted as a standalone library without caveats

**Validation:** JSON format is provided as a fully-supported alternative for users who need features beyond the custom parser's capabilities. A JSON Schema file (`flags.schema.json`) enables IDE autocompletion for both formats.
