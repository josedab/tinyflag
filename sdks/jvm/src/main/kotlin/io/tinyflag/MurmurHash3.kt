package io.tinyflag

/**
 * MurmurHash3 (32-bit) — deterministic hash for rollout bucketing.
 * Same input always produces the same output, across all TinyFlag runtimes.
 */
object MurmurHash3 {
    @JvmStatic
    fun hash(key: ByteArray, seed: Int = 0): Int {
        var h = seed
        val len = key.size
        var i = 0

        while (i + 4 <= len) {
            var k = (key[i].toInt() and 0xff) or
                    ((key[i + 1].toInt() and 0xff) shl 8) or
                    ((key[i + 2].toInt() and 0xff) shl 16) or
                    ((key[i + 3].toInt() and 0xff) shl 24)

            k = (k.toLong() * 0xcc9e2d51L).toInt()
            k = Integer.rotateLeft(k, 15)
            k = (k.toLong() * 0x1b873593L).toInt()

            h = h xor k
            h = Integer.rotateLeft(h, 13)
            h = (h.toLong() * 5 + 0xe6546b64L).toInt()

            i += 4
        }

        var k = 0
        val rem = len and 3
        if (rem >= 3) k = k xor ((key[i + 2].toInt() and 0xff) shl 16)
        if (rem >= 2) k = k xor ((key[i + 1].toInt() and 0xff) shl 8)
        if (rem >= 1) {
            k = k xor (key[i].toInt() and 0xff)
            k = (k.toLong() * 0xcc9e2d51L).toInt()
            k = Integer.rotateLeft(k, 15)
            k = (k.toLong() * 0x1b873593L).toInt()
            h = h xor k
        }

        h = h xor len

        // Finalization mix
        h = h xor (h ushr 16)
        h = (h.toLong() * 0x85ebca6bL).toInt()
        h = h xor (h ushr 13)
        h = (h.toLong() * 0xc2b2ae35L).toInt()
        h = h xor (h ushr 16)

        return h
    }

    @JvmStatic
    fun hash(key: String, seed: Int = 0): Int = hash(key.toByteArray(Charsets.ISO_8859_1), seed)

    /** Returns a bucket 0–99 for percentage-based rollout. */
    @JvmStatic
    fun rolloutBucket(flagName: String, userId: String, seed: Int = 0): Int {
        val h = hash("$flagName:$userId", seed)
        return ((h.toLong() and 0xffffffffL) % 100).toInt()
    }

    /** Selects a variant from a weighted list using deterministic hashing. */
    @JvmStatic
    fun selectVariant(flagName: String, userId: String, variants: List<Pair<String, Int>>): String? {
        val totalWeight = variants.sumOf { it.second }
        if (totalWeight == 0) return variants.firstOrNull()?.first

        val h = hash("$flagName:$userId", 0x5f3759df.toInt())
        val bucket = ((h.toLong() and 0xffffffffL) % totalWeight).toInt()

        var cumulative = 0
        for ((name, weight) in variants) {
            cumulative += weight
            if (bucket < cumulative) return name
        }

        return variants.lastOrNull()?.first
    }
}
