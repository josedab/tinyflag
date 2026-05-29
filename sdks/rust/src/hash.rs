/// MurmurHash3 (32-bit) — deterministic hash for rollout bucketing.
/// Same input always produces the same output, across all TinyFlag runtimes.
pub fn murmurhash3(key: &[u8], seed: u32) -> u32 {
    let len = key.len();
    let mut h: u32 = seed;
    let mut i = 0;

    while i + 4 <= len {
        let mut k: u32 = (key[i] as u32)
            | ((key[i + 1] as u32) << 8)
            | ((key[i + 2] as u32) << 16)
            | ((key[i + 3] as u32) << 24);

        k = k.wrapping_mul(0xcc9e2d51);
        k = k.rotate_left(15);
        k = k.wrapping_mul(0x1b873593);

        h ^= k;
        h = h.rotate_left(13);
        h = h.wrapping_mul(5).wrapping_add(0xe6546b64);

        i += 4;
    }

    let mut k: u32 = 0;
    let rem = len & 3;
    if rem >= 3 {
        k ^= (key[i + 2] as u32) << 16;
    }
    if rem >= 2 {
        k ^= (key[i + 1] as u32) << 8;
    }
    if rem >= 1 {
        k ^= key[i] as u32;
        k = k.wrapping_mul(0xcc9e2d51);
        k = k.rotate_left(15);
        k = k.wrapping_mul(0x1b873593);
        h ^= k;
    }

    h ^= len as u32;

    // Finalization mix
    h ^= h >> 16;
    h = h.wrapping_mul(0x85ebca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2ae35);
    h ^= h >> 16;

    h
}

/// Returns a bucket 0–99 for percentage-based rollout.
/// Deterministic: same (flag_name, user_id) always returns the same bucket.
pub fn rollout_bucket(flag_name: &str, user_id: &str, seed: u32) -> u32 {
    let key = alloc::format!("{}:{}", flag_name, user_id);
    murmurhash3(key.as_bytes(), seed) % 100
}

/// Selects a variant from a weighted list using deterministic hashing.
/// Uses seed 0x5f3759df (independent from rollout bucketing).
pub fn select_variant(flag_name: &str, user_id: &str, variants: &[(&str, u32)]) -> Option<usize> {
    let total_weight: u32 = variants.iter().map(|(_, w)| *w).sum();
    if total_weight == 0 {
        return if variants.is_empty() { None } else { Some(0) };
    }

    let key = alloc::format!("{}:{}", flag_name, user_id);
    let hash = murmurhash3(key.as_bytes(), 0x5f3759df);
    let bucket = hash % total_weight;

    let mut cumulative: u32 = 0;
    for (i, (_, weight)) in variants.iter().enumerate() {
        cumulative += weight;
        if bucket < cumulative {
            return Some(i);
        }
    }

    Some(variants.len() - 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_murmurhash3_vectors() {
        assert_eq!(murmurhash3(b"", 0), 0);
        assert_eq!(murmurhash3(b"hello", 0), 613153351);
        assert_eq!(murmurhash3(b"hello", 42), 3806057185);
        assert_eq!(murmurhash3(b"flag:user-1", 0), 550893901);
        assert_eq!(murmurhash3(b"new-checkout:user-123", 0), 2171525887);
        assert_eq!(murmurhash3(b"dark-mode:user-456", 0), 1678498822);
        assert_eq!(murmurhash3(b"test:abc", 1597463007), 1836727614);
    }

    #[test]
    fn test_rollout_bucket_vectors() {
        let expected = [88, 43, 95, 5, 70, 64, 60, 28, 45, 45, 92, 78, 77, 2, 44, 28, 15, 57, 48, 75];
        for (i, &exp) in expected.iter().enumerate() {
            let user_id = format!("user-{}", i);
            assert_eq!(rollout_bucket("test-flag", &user_id, 0), exp, "user-{}", i);
        }
    }

    #[test]
    fn test_select_variant_vectors() {
        let variants = [("control", 50u32), ("treatment", 50u32)];
        let expected = [
            "control", "control", "treatment", "control", "treatment",
            "control", "control", "control", "treatment", "control",
            "treatment", "treatment", "control", "control", "control",
            "control", "treatment", "control", "control", "control",
        ];
        for (i, &exp) in expected.iter().enumerate() {
            let user_id = format!("user-{}", i);
            let idx = select_variant("ab-test", &user_id, &variants).unwrap();
            assert_eq!(variants[idx].0, exp, "user-{}", i);
        }
    }
}
