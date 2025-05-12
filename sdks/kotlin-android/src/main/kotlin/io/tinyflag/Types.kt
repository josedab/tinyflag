package io.tinyflag

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** A single targeting rule applied to a flag. */
@Serializable
data class Rule(
    val conditions: Map<String, JsonElement> = emptyMap(),
    val enabled: Boolean? = null,
    val rollout: Double? = null,
    val variant: String? = null,
    val segment: String? = null,
)

/** A variant in an A/B test with a relative weight. */
@Serializable
data class Variant(
    val name: String,
    val weight: Int,
)

/** Schedule for automatic flag enable/disable. */
@Serializable
data class FlagSchedule(
    val enableAt: String? = null,
    val disableAt: String? = null,
)

/** Lifecycle metadata for a flag. */
@Serializable
data class FlagLifecycle(
    val state: String,
    val sunsetAt: String? = null,
)

/** Definition of a single feature flag. */
@Serializable
data class FlagDefinition(
    val enabled: Boolean,
    val description: String? = null,
    val tags: List<String>? = null,
    val rollout: Double? = null,
    val rules: List<Rule>? = null,
    val variants: List<Variant>? = null,
    val schedule: FlagSchedule? = null,
    val requires: List<String>? = null,
    val lifecycle: FlagLifecycle? = null,
)

/** Root flag configuration. */
@Serializable
data class FlagConfig(
    val version: Int? = null,
    val flags: Map<String, FlagDefinition> = emptyMap(),
)
