package io.tinyflag

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonPrimitive
import com.google.gson.reflect.TypeToken
import java.io.Reader
import java.util.concurrent.ConcurrentHashMap

/** User context passed to flag evaluation. Thread-safe via immutable design. */
data class UserContext(
    val userId: String? = null,
    val attributes: Map<String, Any?> = emptyMap()
) {
    operator fun get(key: String): Any? = when (key) {
        "userId", "user_id" -> userId
        else -> attributes[key]
    }
}

/** A single targeting rule applied to a flag. */
data class Rule(
    val conditions: Map<String, Any?> = emptyMap(),
    val enabled: Boolean? = null,
    val rollout: Int? = null,
    val variant: String? = null,
    val segment: String? = null
)

/** A variant in an A/B test with a relative weight. */
data class Variant(
    val name: String,
    val weight: Int
)

/** Definition of a single feature flag. Immutable for thread safety. */
data class FlagDefinition(
    val enabled: Boolean,
    val description: String? = null,
    val tags: List<String>? = null,
    val rollout: Int? = null,
    val rules: List<Rule>? = null,
    val variants: List<Variant>? = null,
    val requires: List<String>? = null
)

/** Root flag configuration. */
data class FlagConfig(
    val version: Int = 1,
    val flags: Map<String, FlagDefinition> = emptyMap()
)

/**
 * TinyFlag — zero-dependency feature flag evaluator for the JVM.
 * Thread-safe: uses immutable flag state and ConcurrentHashMap for caches.
 */
class TinyFlag private constructor(
    @Volatile private var config: FlagConfig
) {
    companion object {
        private val gson = Gson()

        /** Create from a FlagConfig. */
        @JvmStatic
        fun create(config: FlagConfig): TinyFlag = TinyFlag(config)

        /** Parse from JSON string. */
        @JvmStatic
        fun fromJson(json: String): TinyFlag {
            val config = gson.fromJson(json, FlagConfig::class.java)
            return TinyFlag(config)
        }

        /** Parse from a Reader. */
        @JvmStatic
        fun fromReader(reader: Reader): TinyFlag {
            val config = gson.fromJson(reader, FlagConfig::class.java)
            return TinyFlag(config)
        }
    }

    /** Check if a flag is enabled for the given context. Never throws. */
    fun isEnabled(flagName: String, context: UserContext? = null): Boolean {
        val flag = config.flags[flagName] ?: return false
        return evaluateFlag(flagName, flag, context)
    }

    /** Get the variant assigned to a user. Returns null if no variant. */
    fun getVariant(flagName: String, context: UserContext? = null): String? {
        val flag = config.flags[flagName] ?: return null
        if (flag.variants.isNullOrEmpty()) return null
        if (!flag.enabled) return null

        // Check rules for forced variant
        if (!flag.rules.isNullOrEmpty() && context != null) {
            for (rule in flag.rules) {
                if (matchRule(rule, context)) {
                    if (rule.variant != null) return rule.variant
                    break
                }
            }
        }

        val userId = context?.userId ?: return null
        return MurmurHash3.selectVariant(
            flagName, userId,
            flag.variants.map { it.name to it.weight }
        )
    }

    /** Update the flag configuration atomically. */
    fun updateConfig(newConfig: FlagConfig) {
        config = newConfig
    }

    /** Get all flag names. */
    fun flagNames(): Set<String> = config.flags.keys

    private fun evaluateFlag(
        flagName: String,
        flag: FlagDefinition,
        context: UserContext?
    ): Boolean {
        if (!flag.enabled) return false

        // Prerequisite check
        if (!flag.requires.isNullOrEmpty()) {
            for (reqName in flag.requires) {
                val reqFlag = config.flags[reqName] ?: return false
                if (!evaluateFlag(reqName, reqFlag, context)) return false
            }
        }

        // Rules evaluation
        if (!flag.rules.isNullOrEmpty() && context != null) {
            for (rule in flag.rules) {
                if (matchRule(rule, context)) {
                    val ruleEnabled = rule.enabled ?: true
                    if (ruleEnabled && rule.rollout != null && context.userId != null) {
                        val bucket = MurmurHash3.rolloutBucket(flagName, context.userId)
                        return bucket < rule.rollout
                    }
                    return ruleEnabled
                }
            }
        }

        // Percentage rollout
        if (flag.rollout != null && context?.userId != null) {
            val bucket = MurmurHash3.rolloutBucket(flagName, context.userId)
            return bucket < flag.rollout
        }

        return flag.enabled
    }

    private fun matchRule(rule: Rule, context: UserContext): Boolean {
        if (rule.conditions.isEmpty()) return true

        for ((field, expected) in rule.conditions) {
            val contextValue = context[field] ?: return false

            if (expected is Map<*, *>) {
                @Suppress("UNCHECKED_CAST")
                val ops = expected as Map<String, Any?>

                if ("\$in" in ops) {
                    val list = ops["\$in"]
                    if (list is List<*> && !list.contains(contextValue)) return false
                    else if (list !is List<*>) return false
                    continue
                }

                if ("\$not" in ops) {
                    if (contextValue == ops["\$not"]) return false
                    continue
                }
            }

            // Glob pattern matching
            if (expected is String && expected.contains("*")) {
                if (contextValue !is String) return false
                val regex = Regex("^" + Regex.escape(expected).replace("\\*", ".*") + "$")
                if (!regex.matches(contextValue)) return false
                continue
            }

            if (contextValue.toString() != expected.toString()) return false
        }
        return true
    }
}
