package io.tinyflag

import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import java.net.URL
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

/**
 * TinyFlag Android SDK — serverless, file-driven feature flags.
 *
 * Supports offline evaluation, background sync, and Android lifecycle integration.
 */
class TinyFlagAndroid(config: FlagConfig) {

    private val configRef = AtomicReference(config)
    private var syncJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /** Update the flag configuration atomically. */
    fun updateConfig(newConfig: FlagConfig) {
        configRef.set(newConfig)
    }

    /** Get current config snapshot. */
    fun getConfig(): FlagConfig = configRef.get()

    /** Check if a flag is enabled for the given user context. */
    fun isEnabled(flagName: String, context: Map<String, Any?> = emptyMap()): Boolean {
        val config = configRef.get()
        val flag = config.flags[flagName] ?: return false

        // Lifecycle check
        flag.lifecycle?.let { if (it.state == "archived") return false }

        // Schedule check
        if (!applySchedule(flag)) return false

        if (!flag.enabled) return false

        // Prerequisite check
        flag.requires?.forEach { req ->
            if (!isEnabled(req, context)) return false
        }

        // Rule evaluation
        flag.rules?.forEach { rule ->
            if (matchRule(rule, context)) {
                rule.enabled?.let { return it }
                rule.rollout?.let { return checkRollout(flagName, it, context) }
                return true
            }
        }

        // Rollout check
        flag.rollout?.let { return checkRollout(flagName, it, context) }

        return true
    }

    /** Get the assigned variant for a flag. */
    fun getVariant(flagName: String, context: Map<String, Any?> = emptyMap()): String? {
        val config = configRef.get()
        val flag = config.flags[flagName] ?: return null
        val variants = flag.variants ?: return null
        if (variants.isEmpty()) return null

        if (!isEnabled(flagName, context)) return null

        // Rule-based variant override
        flag.rules?.forEach { rule ->
            if (matchRule(rule, context) && rule.variant != null) {
                return rule.variant
            }
        }

        // Hash-based variant selection
        val userId = context["userId"] as? String ?: return variants.first().name
        val weighted = variants.map { it.name to it.weight }
        return MurmurHash3Android.selectVariant(flagName, userId, weighted)
    }

    // --- Background Sync ---

    /** Start background sync from a URL. */
    fun startSync(url: String, intervalMs: Long = 60000) {
        stopSync()
        syncJob = scope.launch {
            while (isActive) {
                fetchConfig(url)
                delay(intervalMs)
            }
        }
    }

    /** Stop background sync. */
    fun stopSync() {
        syncJob?.cancel()
        syncJob = null
    }

    /** Called when app moves to background — pause sync. */
    fun onPause() {
        syncJob?.cancel()
    }

    /** Called when app moves to foreground — resume sync. */
    fun onResume(url: String, intervalMs: Long = 60000) {
        startSync(url, intervalMs)
    }

    /** Serialize config to JSON string for offline caching. */
    fun serializeConfig(): String {
        val config = configRef.get()
        return Json.encodeToString(FlagConfig.serializer(), config)
    }

    /** Destroy — clean up coroutines. */
    fun destroy() {
        stopSync()
        scope.cancel()
    }

    // --- Private ---

    private fun matchRule(rule: Rule, context: Map<String, Any?>): Boolean {
        for ((key, expected) in rule.conditions) {
            val contextValue = context[key]
            if (!matchCondition(contextValue, expected)) return false
        }
        return true
    }

    private fun matchCondition(contextValue: Any?, expected: JsonElement): Boolean {
        return when (expected) {
            is JsonPrimitive -> {
                val str = expected.contentOrNull
                if (str != null && str.contains("*")) {
                    val cv = contextValue as? String ?: return false
                    val regex = Regex("^${Regex.escape(str).replace("\\*", ".*")}$")
                    regex.matches(cv)
                } else {
                    anyEquals(contextValue, expected)
                }
            }
            is JsonObject -> {
                expected["\$in"]?.let { inEl ->
                    if (inEl is JsonArray) {
                        return inEl.any { anyEquals(contextValue, it) }
                    }
                }
                expected["\$not"]?.let { notEl ->
                    return !matchCondition(contextValue, notEl)
                }
                expected["\$gt"]?.let { gtEl ->
                    val cv = toDouble(contextValue) ?: return false
                    val ev = toDouble(gtEl) ?: return false
                    return cv > ev
                }
                expected["\$gte"]?.let { gteEl ->
                    val cv = toDouble(contextValue) ?: return false
                    val ev = toDouble(gteEl) ?: return false
                    return cv >= ev
                }
                expected["\$lt"]?.let { ltEl ->
                    val cv = toDouble(contextValue) ?: return false
                    val ev = toDouble(ltEl) ?: return false
                    return cv < ev
                }
                expected["\$lte"]?.let { lteEl ->
                    val cv = toDouble(contextValue) ?: return false
                    val ev = toDouble(lteEl) ?: return false
                    return cv <= ev
                }
                false
            }
            else -> false
        }
    }

    private fun anyEquals(a: Any?, b: Any?): Boolean {
        if (a == null && b == null) return true
        if (a == null || b == null) return false
        if (b is JsonPrimitive) {
            b.booleanOrNull?.let { return it == (a as? Boolean) }
            b.intOrNull?.let { return it == (a as? Number)?.toInt() }
            b.doubleOrNull?.let { return it == (a as? Number)?.toDouble() }
            b.contentOrNull?.let { return it == a.toString() }
        }
        return a.toString() == b.toString()
    }

    private fun toDouble(value: Any?): Double? {
        return when (value) {
            is Number -> value.toDouble()
            is String -> value.toDoubleOrNull()
            is JsonPrimitive -> value.doubleOrNull
            else -> null
        }
    }

    private fun checkRollout(flagName: String, percentage: Double, context: Map<String, Any?>): Boolean {
        if (percentage >= 100) return true
        if (percentage <= 0) return false
        val userId = context["userId"] as? String ?: return false
        val bucket = MurmurHash3Android.rolloutBucket(flagName, userId)
        return bucket < percentage.toInt()
    }

    private fun applySchedule(flag: FlagDefinition): Boolean {
        val schedule = flag.schedule ?: return true
        val now = Instant.now()

        schedule.enableAt?.let {
            try {
                val enableTime = Instant.parse(it)
                if (now.isBefore(enableTime)) return false
            } catch (_: Exception) {}
        }
        schedule.disableAt?.let {
            try {
                val disableTime = Instant.parse(it)
                if (!now.isBefore(disableTime)) return false
            } catch (_: Exception) {}
        }
        return true
    }

    private suspend fun fetchConfig(url: String) {
        try {
            val json = withContext(Dispatchers.IO) {
                URL(url).readText()
            }
            val newConfig = Json { ignoreUnknownKeys = true }.decodeFromString(FlagConfig.serializer(), json)
            updateConfig(newConfig)
        } catch (_: Exception) {
            // Silently fail on network errors — keep using cached config
        }
    }
}
