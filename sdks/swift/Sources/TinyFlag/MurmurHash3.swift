/// MurmurHash3 (32-bit) — deterministic hash for rollout bucketing.
/// Same input always produces the same output, across all TinyFlag runtimes.
public enum MurmurHash3 {

    /// Core MurmurHash3 32-bit hash function.
    public static func hash(_ key: [UInt8], seed: UInt32 = 0) -> UInt32 {
        var h: UInt32 = seed
        let len = key.count
        var i = 0

        // Process 4-byte blocks
        while i + 4 <= len {
            var k: UInt32 = UInt32(key[i])
                | (UInt32(key[i + 1]) << 8)
                | (UInt32(key[i + 2]) << 16)
                | (UInt32(key[i + 3]) << 24)

            k = k &* 0xcc9e2d51
            k = (k << 15) | (k >> 17)
            k = k &* 0x1b873593

            h ^= k
            h = (h << 13) | (h >> 19)
            h = h &* 5 &+ 0xe6546b64

            i += 4
        }

        // Remaining bytes
        var k: UInt32 = 0
        let rem = len & 3
        if rem >= 3 { k ^= UInt32(key[i + 2]) << 16 }
        if rem >= 2 { k ^= UInt32(key[i + 1]) << 8 }
        if rem >= 1 {
            k ^= UInt32(key[i])
            k = k &* 0xcc9e2d51
            k = (k << 15) | (k >> 17)
            k = k &* 0x1b873593
            h ^= k
        }

        h ^= UInt32(len)

        // Finalization mix
        h ^= h >> 16
        h = h &* 0x85ebca6b
        h ^= h >> 13
        h = h &* 0xc2b2ae35
        h ^= h >> 16

        return h
    }

    /// Hash a string (ISO-8859-1 encoding for cross-language compatibility).
    public static func hash(_ key: String, seed: UInt32 = 0) -> UInt32 {
        let bytes = Array(key.utf8)
        return hash(bytes, seed: seed)
    }

    /// Returns a bucket 0–99 for percentage-based rollout.
    public static func rolloutBucket(flagName: String, userId: String, seed: UInt32 = 0) -> Int {
        let h = hash("\(flagName):\(userId)", seed: seed)
        return Int(h % 100)
    }

    /// Selects a variant from a weighted list using deterministic hashing.
    public static func selectVariant(
        flagName: String,
        userId: String,
        variants: [(name: String, weight: Int)]
    ) -> String? {
        let totalWeight = variants.reduce(0) { $0 + $1.weight }
        guard totalWeight > 0 else { return variants.first?.name }

        let h = hash("\(flagName):\(userId)", seed: 0x5f3759df)
        let bucket = Int(h % UInt32(totalWeight))

        var cumulative = 0
        for (name, weight) in variants {
            cumulative += weight
            if bucket < cumulative { return name }
        }

        return variants.last?.name
    }
}
