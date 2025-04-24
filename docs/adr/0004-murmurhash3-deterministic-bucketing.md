# ADR-0004: MurmurHash3 for Deterministic Bucketing

## Status

Accepted

## Context

Feature flag rollouts and A/B test variant assignment require **deterministic user bucketing**: the same user must always see the same flag value and the same variant, regardless of when or where the evaluation happens. This requires a hash function that:

1. Is deterministic across all JavaScript runtimes (Node.js, Bun, Deno, browsers)
2. Produces uniformly distributed output (no clustering that would skew rollout percentages)
3. Is fast (evaluated on every flag check in hot paths)
4. Is small (must fit within the < 8KB bundle budget)

Cryptographic hashes (SHA-256) are deterministic and uniform but slow and large. Simple hashes (djb2, FNV-1a) are fast but may have poor distribution for short keys.

## Decision

TinyFlag uses **MurmurHash3 (32-bit)** with a custom pure-TypeScript implementation (~54 lines). Two separate concerns use different seeds to ensure independence:

- **Rollout bucketing**: `murmurhash3("flagName:userId", seed=0) % 100` → bucket 0–99
- **Variant assignment**: `murmurhash3("flagName:userId", seed=0x5f3759df) % totalWeight` → weighted variant selection

**The algorithm and seed values are frozen.** They will never change in a way that alters existing assignments. This is a core design invariant: same input → same output, across SDK versions.

## Consequences

**Positive:**

- Deterministic across all runtimes (pure integer arithmetic, no floating point)
- Excellent distribution uniformity for short string keys
- ~200 bytes in the bundle
- Independent rollout and variant bucketing (different seeds prevent correlation)
- No external dependency

**Negative:**

- MurmurHash3 is not cryptographically secure (not needed for bucketing, but worth noting)
- 32-bit output limits to ~4 billion unique buckets (sufficient for `% 100` rollout and typical variant counts)
- Algorithm is permanently frozen — if a distribution flaw is discovered, it cannot be fixed without a major version bump and migration tooling

**Invariant:** The `hash.ts` file is the most stability-critical code in the SDK. Any change to the hashing logic is a breaking change that would reassign users to different buckets/variants.
