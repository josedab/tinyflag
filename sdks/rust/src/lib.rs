//! TinyFlag — zero-dependency feature flag evaluator for Rust and WebAssembly.
//!
//! Ports the MurmurHash3, rollout bucketing, variant selection, and full flag
//! evaluation logic from the TypeScript core so that results are deterministic
//! across all TinyFlag SDK languages.

#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;

mod hash;
mod evaluator;
mod types;

pub use hash::{murmurhash3, rollout_bucket, select_variant};
pub use evaluator::{evaluate_flag, evaluate_variant, match_rule};
pub use types::*;

#[cfg(feature = "wasm")]
mod wasm;
#[cfg(feature = "wasm")]
pub use wasm::*;

mod wasi;
pub use wasi::{wasi_load_config, wasi_is_enabled, wasi_get_variant, wasi_murmurhash3, wasi_rollout_bucket};
