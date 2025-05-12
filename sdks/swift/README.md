# TinyFlag Swift SDK

First-class iOS/macOS/watchOS/tvOS SDK for TinyFlag feature flags.

## Installation

### Swift Package Manager

```swift
dependencies: [
    .package(url: "https://github.com/josedab/tinyflag.git", from: "0.1.0")
]
```

## Usage

```swift
import TinyFlag

// Initialize with inline config
let config = FlagConfig(version: 1, flags: [
    "dark-mode": FlagDefinition(enabled: true),
    "new-checkout": FlagDefinition(enabled: true, rollout: 50)
])

let tf = TinyFlag(config: config)

// Evaluate flags
let darkMode = tf.isEnabled("dark-mode")
let checkout = tf.isEnabled("new-checkout", context: ["userId": "user-123"])

// A/B test variant
let variant = tf.getVariant("new-checkout", context: ["userId": "user-123"])

// Background sync from URL
tf.startSync(url: URL(string: "https://cdn.example.com/flags.json")!)

// Register lifecycle observers (iOS)
tf.registerLifecycleObservers()
```

## Features

- ✅ Offline evaluation (no network required)
- ✅ Background sync with configurable interval
- ✅ App lifecycle integration (pause/resume on background/foreground)
- ✅ Cross-language compatible MurmurHash3
- ✅ Rule evaluation with operators ($in, $not, $gt, $gte, $lt, $lte, glob)
- ✅ Percentage rollout with deterministic bucketing
- ✅ A/B test variant selection
- ✅ Prerequisite flag checking
- ✅ Schedule-based flag activation

## Cross-Language Compatibility

Uses the same MurmurHash3 implementation as all other TinyFlag SDKs.
Validated against shared test vectors.
