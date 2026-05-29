# TinyFlag JVM SDK (Kotlin/Java)

Zero-dependency feature flag evaluator for the JVM with Kotlin-first API and full Java interop.

## Features

- Deterministic MurmurHash3 bucketing (cross-language compatible)
- Rule-based targeting with operators ($in, $not, glob patterns)
- Percentage rollout and A/B test variant selection
- Thread-safe immutable flag state
- JSON config parsing via Gson

## Kotlin Usage

```kotlin
import io.tinyflag.*

val tf = TinyFlag.fromJson("""{"version":1,"flags":{"dark-mode":{"enabled":true}}}""")

val enabled = tf.isEnabled("dark-mode", UserContext(userId = "user-123"))
val variant = tf.getVariant("ab-test", UserContext(userId = "user-123"))
```

## Java Usage

```java
import io.tinyflag.*;

TinyFlag tf = TinyFlag.fromJson("{\"version\":1,\"flags\":{\"dark-mode\":{\"enabled\":true}}}");
boolean enabled = tf.isEnabled("dark-mode", new UserContext("user-123", Map.of()));
```

## Building

```bash
./gradlew build    # Build and run tests
./gradlew test     # Run tests only
./gradlew publish  # Publish to Maven Local
```

## Cross-language Determinism

All test vectors from `sdks/test-vectors.json` pass identically across
Kotlin, Rust, Go, Python, and TypeScript implementations.
