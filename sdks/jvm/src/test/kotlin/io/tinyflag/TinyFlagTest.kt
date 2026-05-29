package io.tinyflag

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class MurmurHash3Test {

    @Test
    fun `test vectors - empty string`() {
        assertEquals(0, MurmurHash3.hash("", 0))
    }

    @Test
    fun `test vectors - hello seed 0`() {
        assertEquals(613153351, MurmurHash3.hash("hello", 0))
    }

    @Test
    fun `test vectors - hello seed 42`() {
        // Unsigned comparison
        val expected = 3806057185L
        val actual = MurmurHash3.hash("hello", 42).toLong() and 0xffffffffL
        assertEquals(expected, actual)
    }

    @Test
    fun `test vectors - flag user-1`() {
        assertEquals(550893901, MurmurHash3.hash("flag:user-1", 0))
    }

    @Test
    fun `test vectors - new-checkout user-123`() {
        val expected = 2171525887L
        val actual = MurmurHash3.hash("new-checkout:user-123", 0).toLong() and 0xffffffffL
        assertEquals(expected, actual)
    }

    @Test
    fun `test vectors - dark-mode user-456`() {
        assertEquals(1678498822, MurmurHash3.hash("dark-mode:user-456", 0))
    }

    @Test
    fun `test vectors - test abc with seed`() {
        assertEquals(1836727614, MurmurHash3.hash("test:abc", 1597463007))
    }

    @Test
    fun `rollout bucket vectors`() {
        val expected = intArrayOf(88, 43, 95, 5, 70, 64, 60, 28, 45, 45, 92, 78, 77, 2, 44, 28, 15, 57, 48, 75)
        for (i in expected.indices) {
            assertEquals(
                expected[i],
                MurmurHash3.rolloutBucket("test-flag", "user-$i"),
                "Failed for user-$i"
            )
        }
    }

    @Test
    fun `select variant vectors`() {
        val variants = listOf("control" to 50, "treatment" to 50)
        val expected = arrayOf(
            "control", "control", "treatment", "control", "treatment",
            "control", "control", "control", "treatment", "control",
            "treatment", "treatment", "control", "control", "control",
            "control", "treatment", "control", "control", "control"
        )
        for (i in expected.indices) {
            assertEquals(
                expected[i],
                MurmurHash3.selectVariant("ab-test", "user-$i", variants),
                "Failed for user-$i"
            )
        }
    }
}

class TinyFlagTest {

    @Test
    fun `disabled flag returns false`() {
        val tf = TinyFlag.create(FlagConfig(flags = mapOf(
            "test" to FlagDefinition(enabled = false)
        )))
        assertFalse(tf.isEnabled("test"))
    }

    @Test
    fun `enabled flag returns true`() {
        val tf = TinyFlag.create(FlagConfig(flags = mapOf(
            "test" to FlagDefinition(enabled = true)
        )))
        assertTrue(tf.isEnabled("test"))
    }

    @Test
    fun `rollout respects percentage`() {
        val tf = TinyFlag.create(FlagConfig(flags = mapOf(
            "test-flag" to FlagDefinition(enabled = true, rollout = 50)
        )))
        // user-3 bucket is 5, so 5 < 50 = true
        assertTrue(tf.isEnabled("test-flag", UserContext(userId = "user-3")))
        // user-0 bucket is 88, so 88 < 50 = false
        assertFalse(tf.isEnabled("test-flag", UserContext(userId = "user-0")))
    }

    @Test
    fun `rule matching with equality`() {
        val tf = TinyFlag.create(FlagConfig(flags = mapOf(
            "beta" to FlagDefinition(
                enabled = true,
                rules = listOf(Rule(
                    conditions = mapOf("role" to "admin"),
                    enabled = true
                ))
            )
        )))
        assertTrue(tf.isEnabled("beta", UserContext(attributes = mapOf("role" to "admin"))))
    }

    @Test
    fun `unknown flag returns false`() {
        val tf = TinyFlag.create(FlagConfig(flags = emptyMap()))
        assertFalse(tf.isEnabled("nonexistent"))
    }

    @Test
    fun `variant selection`() {
        val tf = TinyFlag.create(FlagConfig(flags = mapOf(
            "ab-test" to FlagDefinition(
                enabled = true,
                variants = listOf(Variant("control", 50), Variant("treatment", 50))
            )
        )))
        val variant = tf.getVariant("ab-test", UserContext(userId = "user-0"))
        assertNotNull(variant)
        assertTrue(variant == "control" || variant == "treatment")
    }

    @Test
    fun `json parsing`() {
        val json = """{"version":1,"flags":{"dark-mode":{"enabled":true}}}"""
        val tf = TinyFlag.fromJson(json)
        assertTrue(tf.isEnabled("dark-mode"))
    }

    @Test
    fun `thread safety - concurrent reads`() {
        val tf = TinyFlag.create(FlagConfig(flags = mapOf(
            "test" to FlagDefinition(enabled = true, rollout = 50)
        )))

        val threads = (0 until 10).map { i ->
            Thread {
                for (j in 0 until 100) {
                    tf.isEnabled("test", UserContext(userId = "user-$i-$j"))
                }
            }
        }
        threads.forEach { it.start() }
        threads.forEach { it.join() }
        // No ConcurrentModificationException = pass
    }
}
