# TinyFlag Rust/WASM SDK

Zero-dependency feature flag evaluator for Rust and WebAssembly.

Ports the TinyFlag MurmurHash3, rollout bucketing, variant selection, and full
flag evaluation logic to Rust, ensuring deterministic results across all
TinyFlag SDK languages.

## Rust Usage

```rust
use tinyflag::{murmurhash3, rollout_bucket, evaluate_flag, FlagDefinition, UserContext};

let flag = FlagDefinition { enabled: true, rollout: Some(50), ..Default::default() };
let ctx = UserContext { user_id: Some("user-123".into()), ..Default::default() };
let enabled = evaluate_flag("my-flag", &flag, Some(&ctx), None);
```

## WASM / npm Usage

```bash
npm install tinyflag-wasm
```

```js
import init, { murmurhash3, rolloutBucket, isEnabled } from 'tinyflag-wasm';

await init();
const hash = murmurhash3('hello', 0); // 613153351
const bucket = rolloutBucket('flag', 'user-1', 0);
const enabled = isEnabled('flag', flagJson, contextJson, '');
```

## Building

```bash
# Rust tests (all 47 test vectors)
cargo test

# WASM build (requires wasm-pack)
wasm-pack build --target web --out-dir pkg --release
```

## Cross-language Determinism

All test vectors from `sdks/test-vectors.json` pass identically in Rust, Go,
Python, and TypeScript, ensuring consistent flag evaluation across runtimes.
