# TinyFlag Android SDK (Kotlin)

First-class Android SDK for TinyFlag feature flags.

## Installation

### Gradle (Maven Central)

```kotlin
dependencies {
    implementation("io.tinyflag:tinyflag-android:0.1.0")
}
```

## Usage

```kotlin
import io.tinyflag.TinyFlagAndroid
import io.tinyflag.FlagConfig
import io.tinyflag.FlagDefinition

// Initialize with inline config
val config = FlagConfig(
    version = 1,
    flags = mapOf(
        "dark-mode" to FlagDefinition(enabled = true),
        "new-checkout" to FlagDefinition(enabled = true, rollout = 50.0)
    )
)

val tf = TinyFlagAndroid(config)

// Evaluate flags
val darkMode = tf.isEnabled("dark-mode")
val checkout = tf.isEnabled("new-checkout", mapOf("userId" to "user-123"))

// A/B test variant
val variant = tf.getVariant("new-checkout", mapOf("userId" to "user-123"))

// Background sync from URL
tf.startSync("https://cdn.example.com/flags.json")

// Lifecycle integration
override fun onPause() {
    super.onPause()
    tf.onPause()
}

override fun onResume() {
    super.onResume()
    tf.onResume("https://cdn.example.com/flags.json")
}

// Cleanup
override fun onDestroy() {
    super.onDestroy()
    tf.destroy()
}
```

## Features

- ✅ Offline evaluation (no network required)
- ✅ Background sync with coroutines
- ✅ Android lifecycle integration (pause/resume)
- ✅ Cross-language compatible MurmurHash3
- ✅ Kotlin Serialization for config parsing
- ✅ Thread-safe with AtomicReference
- ✅ Rule evaluation with all operators
- ✅ Percentage rollout with deterministic bucketing
