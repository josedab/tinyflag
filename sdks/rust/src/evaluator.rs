use alloc::collections::BTreeMap;
use alloc::string::String;
use alloc::vec::Vec;

use crate::hash::{rollout_bucket, select_variant as hash_select_variant};
use crate::types::*;

/// Match a single condition value against the expected pattern.
fn match_condition(context_value: &serde_json::Value, expected: &serde_json::Value) -> bool {
    if context_value.is_null() {
        return false;
    }

    // Operator objects: { $in, $not, $gt, $gte, $lt, $lte }
    if let Some(obj) = expected.as_object() {
        if let Some(list) = obj.get("$in") {
            if let Some(arr) = list.as_array() {
                if arr.is_empty() {
                    return false;
                }
                return arr.iter().any(|v| v == context_value);
            }
            return false;
        }

        if let Some(not_val) = obj.get("$not") {
            return !match_condition(context_value, not_val);
        }

        // Numeric comparisons
        if let Some(cv) = context_value.as_f64() {
            if let Some(gt) = obj.get("$gt").and_then(|v| v.as_f64()) {
                if !(cv > gt) {
                    return false;
                }
            }
            if let Some(gte) = obj.get("$gte").and_then(|v| v.as_f64()) {
                if !(cv >= gte) {
                    return false;
                }
            }
            if let Some(lt) = obj.get("$lt").and_then(|v| v.as_f64()) {
                if !(cv < lt) {
                    return false;
                }
            }
            if let Some(lte) = obj.get("$lte").and_then(|v| v.as_f64()) {
                if !(cv <= lte) {
                    return false;
                }
            }
            return obj.keys().all(|k| k.starts_with('$'));
        }
        return false;
    }

    // Glob pattern matching
    if let Some(pattern) = expected.as_str() {
        if pattern.contains('*') {
            if let Some(val) = context_value.as_str() {
                return glob_match(pattern, val);
            }
            return false;
        }
    }

    // Strict equality
    context_value == expected
}

/// Simple glob matching: only the `*` wildcard is supported.
fn glob_match(pattern: &str, value: &str) -> bool {
    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 1 {
        return pattern == value;
    }

    let mut pos = 0;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        match value[pos..].find(part) {
            Some(idx) => {
                if i == 0 && idx != 0 {
                    return false;
                }
                pos += idx + part.len();
            }
            None => return false,
        }
    }

    if let Some(last) = parts.last() {
        if !last.is_empty() && !value.ends_with(last) {
            return false;
        }
    }
    true
}

/// Evaluate whether all conditions in a rule match the context.
pub fn match_rule(rule: &Rule, context: &UserContext) -> bool {
    if rule.conditions.is_empty() {
        return true;
    }

    for (field, expected) in &rule.conditions {
        let context_value = if field == "userId" || field == "user_id" {
            context
                .user_id
                .as_ref()
                .map(|s| serde_json::Value::String(s.clone()))
                .unwrap_or(serde_json::Value::Null)
        } else {
            context
                .attributes
                .get(field)
                .cloned()
                .unwrap_or(serde_json::Value::Null)
        };

        if !match_condition(&context_value, expected) {
            return false;
        }
    }
    true
}

/// Core flag evaluation: determines if a flag is enabled for a given context.
/// Never panics — returns false for any error case.
pub fn evaluate_flag(
    flag_name: &str,
    flag: &FlagDefinition,
    context: Option<&UserContext>,
    all_flags: Option<&BTreeMap<String, FlagDefinition>>,
) -> bool {
    // Lifecycle checks
    if let Some(ref lc) = flag.lifecycle {
        if lc.state == FlagLifecycleState::Archived {
            return false;
        }
        if lc.state == FlagLifecycleState::Draft {
            return false;
        }
    }

    // Prerequisite check
    if let (Some(requires), Some(flags)) = (&flag.requires, all_flags) {
        for req_name in requires {
            if let Some(req_flag) = flags.get(req_name.as_str()) {
                if !evaluate_flag(req_name, req_flag, context, all_flags) {
                    return false;
                }
            } else {
                return false;
            }
        }
    }

    if !flag.enabled {
        return false;
    }

    // Rules evaluation
    if let (Some(rules), Some(ctx)) = (&flag.rules, context) {
        for rule in rules {
            if match_rule(rule, ctx) {
                let rule_enabled = rule.enabled.unwrap_or(true);
                if rule_enabled {
                    if let (Some(rollout), Some(ref uid)) = (rule.rollout, &ctx.user_id) {
                        let bucket = rollout_bucket(flag_name, uid, 0);
                        return bucket < rollout;
                    }
                }
                return rule_enabled;
            }
        }
    }

    // Percentage rollout
    if let Some(rollout) = flag.rollout {
        if let Some(ctx) = context {
            if let Some(ref uid) = ctx.user_id {
                let bucket = rollout_bucket(flag_name, uid, 0);
                return bucket < rollout;
            }
        }
    }

    flag.enabled
}

/// Core variant evaluation: determines which variant a user is assigned to.
pub fn evaluate_variant(
    flag_name: &str,
    flag: &FlagDefinition,
    context: Option<&UserContext>,
    all_flags: Option<&BTreeMap<String, FlagDefinition>>,
) -> VariantResult {
    if !flag.enabled {
        return VariantResult { variant: None, enabled: false };
    }

    let variants = match &flag.variants {
        Some(v) if !v.is_empty() => v,
        _ => {
            return VariantResult {
                variant: None,
                enabled: evaluate_flag(flag_name, flag, context, all_flags),
            };
        }
    };

    // Check rules for forced variant
    if let (Some(rules), Some(ctx)) = (&flag.rules, context) {
        for rule in rules {
            if match_rule(rule, ctx) {
                if let Some(ref variant) = rule.variant {
                    let rule_enabled = rule.enabled.unwrap_or(true);
                    return VariantResult {
                        variant: Some(variant.clone()),
                        enabled: rule_enabled,
                    };
                }
                break;
            }
        }
    }

    let ctx = match context {
        Some(c) => c,
        None => {
            return VariantResult {
                variant: None,
                enabled: evaluate_flag(flag_name, flag, context, all_flags),
            };
        }
    };

    let uid = match &ctx.user_id {
        Some(u) => u,
        None => {
            return VariantResult {
                variant: None,
                enabled: evaluate_flag(flag_name, flag, context, all_flags),
            };
        }
    };

    let variant_tuples: Vec<(&str, u32)> = variants.iter().map(|v| (v.name.as_str(), v.weight)).collect();
    let enabled = evaluate_flag(flag_name, flag, context, all_flags);

    let variant_name = hash_select_variant(flag_name, uid, &variant_tuples)
        .map(|idx| variants[idx].name.clone());

    VariantResult {
        variant: variant_name,
        enabled,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ctx(user_id: &str) -> UserContext {
        UserContext {
            user_id: Some(user_id.to_string()),
            attributes: BTreeMap::new(),
        }
    }

    #[test]
    fn test_evaluate_disabled_flag() {
        let flag = FlagDefinition {
            enabled: false,
            description: None,
            tags: None,
            rollout: None,
            rules: None,
            variants: None,
            schedule: None,
            requires: None,
            lifecycle: None,
            config: None,
        };
        assert!(!evaluate_flag("test", &flag, None, None));
    }

    #[test]
    fn test_evaluate_enabled_flag() {
        let flag = FlagDefinition {
            enabled: true,
            description: None,
            tags: None,
            rollout: None,
            rules: None,
            variants: None,
            schedule: None,
            requires: None,
            lifecycle: None,
            config: None,
        };
        assert!(evaluate_flag("test", &flag, None, None));
    }

    #[test]
    fn test_rollout_evaluation() {
        let flag = FlagDefinition {
            enabled: true,
            description: None,
            tags: None,
            rollout: Some(50),
            rules: None,
            variants: None,
            schedule: None,
            requires: None,
            lifecycle: None,
            config: None,
        };
        let ctx = make_ctx("user-0");
        // user-0 bucket is 88, so 88 < 50 is false
        assert!(!evaluate_flag("test-flag", &flag, Some(&ctx), None));

        let ctx2 = make_ctx("user-3");
        // user-3 bucket is 5, so 5 < 50 is true
        assert!(evaluate_flag("test-flag", &flag, Some(&ctx2), None));
    }

    #[test]
    fn test_rule_matching() {
        let mut conditions = BTreeMap::new();
        conditions.insert(
            "country".to_string(),
            serde_json::Value::String("US".to_string()),
        );

        let rule = Rule {
            conditions,
            enabled: Some(true),
            rollout: None,
            variant: None,
            segment: None,
        };

        let mut attrs = BTreeMap::new();
        attrs.insert(
            "country".to_string(),
            serde_json::Value::String("US".to_string()),
        );
        let ctx = UserContext {
            user_id: Some("u1".to_string()),
            attributes: attrs,
        };

        assert!(match_rule(&rule, &ctx));
    }

    #[test]
    fn test_rule_with_in_operator() {
        let mut conditions = BTreeMap::new();
        conditions.insert(
            "role".to_string(),
            serde_json::json!({"$in": ["admin", "editor"]}),
        );

        let rule = Rule {
            conditions,
            enabled: Some(true),
            rollout: None,
            variant: None,
            segment: None,
        };

        let mut attrs = BTreeMap::new();
        attrs.insert(
            "role".to_string(),
            serde_json::Value::String("admin".to_string()),
        );
        let ctx = UserContext {
            user_id: None,
            attributes: attrs,
        };
        assert!(match_rule(&rule, &ctx));
    }

    #[test]
    fn test_glob_matching() {
        assert!(glob_match("*.example.com", "api.example.com"));
        assert!(!glob_match("*.example.com", "api.other.com"));
        assert!(glob_match("user-*", "user-123"));
    }

    #[test]
    fn test_archived_flag() {
        let flag = FlagDefinition {
            enabled: true,
            description: None,
            tags: None,
            rollout: None,
            rules: None,
            variants: None,
            schedule: None,
            requires: None,
            lifecycle: Some(FlagLifecycle {
                state: FlagLifecycleState::Archived,
                sunset_at: None,
            }),
            config: None,
        };
        assert!(!evaluate_flag("test", &flag, None, None));
    }
}
