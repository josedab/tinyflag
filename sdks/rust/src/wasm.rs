use wasm_bindgen::prelude::*;
use alloc::collections::BTreeMap;
use alloc::string::String;
use alloc::vec::Vec;

use crate::hash;
use crate::types::*;
use crate::evaluator;

#[wasm_bindgen(js_name = murmurhash3)]
pub fn wasm_murmurhash3(key: &str, seed: u32) -> u32 {
    hash::murmurhash3(key.as_bytes(), seed)
}

#[wasm_bindgen(js_name = rolloutBucket)]
pub fn wasm_rollout_bucket(flag_name: &str, user_id: &str, seed: u32) -> u32 {
    hash::rollout_bucket(flag_name, user_id, seed)
}

#[wasm_bindgen(js_name = selectVariant)]
pub fn wasm_select_variant(flag_name: &str, user_id: &str, variants_json: &str) -> Option<String> {
    let parsed: Vec<Variant> = match serde_json::from_str(variants_json) {
        Ok(v) => v,
        Err(_) => return None,
    };
    let tuples: Vec<(&str, u32)> = parsed.iter().map(|v| (v.name.as_str(), v.weight)).collect();
    hash::select_variant(flag_name, user_id, &tuples).map(|idx| parsed[idx].name.clone())
}

#[wasm_bindgen(js_name = isEnabled)]
pub fn wasm_is_enabled(
    flag_name: &str,
    flag_json: &str,
    context_json: &str,
    all_flags_json: &str,
) -> bool {
    let flag: FlagDefinition = match serde_json::from_str(flag_json) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let context: Option<UserContext> = if context_json.is_empty() {
        None
    } else {
        serde_json::from_str(context_json).ok()
    };
    let all_flags: Option<BTreeMap<String, FlagDefinition>> = if all_flags_json.is_empty() {
        None
    } else {
        serde_json::from_str(all_flags_json).ok()
    };

    evaluator::evaluate_flag(
        flag_name,
        &flag,
        context.as_ref(),
        all_flags.as_ref(),
    )
}

#[wasm_bindgen(js_name = getVariant)]
pub fn wasm_get_variant(
    flag_name: &str,
    flag_json: &str,
    context_json: &str,
) -> Option<String> {
    let flag: FlagDefinition = match serde_json::from_str(flag_json) {
        Ok(f) => f,
        Err(_) => return None,
    };
    let context: Option<UserContext> = if context_json.is_empty() {
        None
    } else {
        serde_json::from_str(context_json).ok()
    };

    let result = evaluator::evaluate_variant(flag_name, &flag, context.as_ref(), None);
    result.variant
}
