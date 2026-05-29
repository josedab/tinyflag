use alloc::collections::BTreeMap;
use alloc::string::String;
use alloc::vec::Vec;
use serde::{Deserialize, Serialize};

/// User context passed to flag evaluation for targeting and rollout bucketing.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UserContext {
    #[serde(rename = "userId", skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(flatten)]
    pub attributes: BTreeMap<String, serde_json::Value>,
}

/// A single targeting rule applied to a flag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub conditions: BTreeMap<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollout: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segment: Option<String>,
}

/// A variant in an A/B test with a relative weight.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Variant {
    pub name: String,
    pub weight: u32,
}

/// Schedule for automatic flag enable/disable.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlagSchedule {
    #[serde(rename = "enableAt", skip_serializing_if = "Option::is_none")]
    pub enable_at: Option<String>,
    #[serde(rename = "disableAt", skip_serializing_if = "Option::is_none")]
    pub disable_at: Option<String>,
}

/// Lifecycle state of a flag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FlagLifecycleState {
    Draft,
    Active,
    Sunset,
    Archived,
}

/// Lifecycle metadata for a flag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlagLifecycle {
    pub state: FlagLifecycleState,
    #[serde(rename = "sunsetAt", skip_serializing_if = "Option::is_none")]
    pub sunset_at: Option<String>,
}

/// Definition of a single feature flag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlagDefinition {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rollout: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rules: Option<Vec<Rule>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variants: Option<Vec<Variant>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schedule: Option<FlagSchedule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requires: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lifecycle: Option<FlagLifecycle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<BTreeMap<String, serde_json::Value>>,
}

/// Root flag configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlagConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<u32>,
    pub flags: BTreeMap<String, FlagDefinition>,
}

/// Result of variant evaluation.
#[derive(Debug, Clone)]
pub struct VariantResult {
    pub variant: Option<String>,
    pub enabled: bool,
}
