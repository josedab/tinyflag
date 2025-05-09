/// WASI-compatible interface for universal WASM evaluation.
///
/// Provides a stable ABI that can be consumed by any language runtime
/// via wasmer/wasmtime host bindings.
///
/// All functions operate on JSON strings to maintain language-agnostic compatibility.

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;
use alloc::string::String;
use alloc::vec::Vec;
use alloc::collections::BTreeMap;

use crate::hash;
use crate::types::*;
use crate::evaluator;

/// Initialize the evaluator with a full flag config JSON.
/// Returns a handle ID for subsequent calls.
static mut CONFIGS: Option<Vec<BTreeMap<String, FlagDefinition>>> = None;

/// Load a flag configuration from JSON.
/// Returns a config handle (index) or -1 on error.
pub fn wasi_load_config(config_json: &str) -> i32 {
    let parsed: BTreeMap<String, FlagDefinition> = match serde_json::from_str(config_json) {
        Ok(c) => c,
        Err(_) => return -1,
    };

    unsafe {
        if CONFIGS.is_none() {
            CONFIGS = Some(Vec::new());
        }
        let configs = CONFIGS.as_mut().unwrap();
        configs.push(parsed);
        (configs.len() - 1) as i32
    }
}

/// Evaluate a flag using a previously loaded config.
/// Returns 1 for enabled, 0 for disabled, -1 for error.
pub fn wasi_is_enabled(handle: i32, flag_name: &str, context_json: &str) -> i32 {
    let flags = unsafe {
        match &CONFIGS {
            Some(configs) => match configs.get(handle as usize) {
                Some(c) => c,
                None => return -1,
            },
            None => return -1,
        }
    };

    let flag = match flags.get(flag_name) {
        Some(f) => f,
        None => return -1,
    };

    let context: Option<UserContext> = if context_json.is_empty() {
        None
    } else {
        serde_json::from_str(context_json).ok()
    };

    if evaluator::evaluate_flag(flag_name, flag, context.as_ref(), Some(flags)) {
        1
    } else {
        0
    }
}

/// Get variant assignment for a flag.
/// Returns variant name JSON string or empty string.
pub fn wasi_get_variant(handle: i32, flag_name: &str, context_json: &str) -> String {
    let flags = unsafe {
        match &CONFIGS {
            Some(configs) => match configs.get(handle as usize) {
                Some(c) => c,
                None => return String::new(),
            },
            None => return String::new(),
        }
    };

    let flag = match flags.get(flag_name) {
        Some(f) => f,
        None => return String::new(),
    };

    let context: Option<UserContext> = if context_json.is_empty() {
        None
    } else {
        serde_json::from_str(context_json).ok()
    };

    let result = evaluator::evaluate_variant(flag_name, flag, context.as_ref(), Some(flags));
    result.variant.unwrap_or_default()
}

/// Pure hash function — no state needed.
pub fn wasi_murmurhash3(key: &str, seed: u32) -> u32 {
    hash::murmurhash3(key.as_bytes(), seed)
}

/// Pure rollout bucket function.
pub fn wasi_rollout_bucket(flag_name: &str, user_id: &str, seed: u32) -> u32 {
    hash::rollout_bucket(flag_name, user_id, seed)
}
