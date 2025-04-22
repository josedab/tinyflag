/**
 * MurmurHash3 (32-bit) — deterministic hash for rollout bucketing.
 * Same input always produces the same output, across all runtimes.
 *
 * @param key - The string to hash.
 * @param seed - Optional seed value for independent hash streams. Defaults to `0`.
 * @returns Unsigned 32-bit integer hash value.
 */
export function murmurhash3(key: string, seed: number = 0): number {
  let h = seed >>> 0;
  const len = key.length;
  let i = 0;

  while (i + 4 <= len) {
    let k =
      (key.charCodeAt(i) & 0xff) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);

    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);

    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;

    i += 4;
  }

  let k = 0;
  switch (len & 3) {
    case 3:
      k ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    // fallthrough
    case 2:
      k ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    // fallthrough
    case 1:
      k ^= key.charCodeAt(i) & 0xff;
      k = Math.imul(k, 0xcc9e2d51);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, 0x1b873593);
      h ^= k;
  }

  h ^= len;

  // Finalization mix
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return h >>> 0;
}

/**
 * Returns a bucket 0–99 for percentage-based rollout.
 * Deterministic: same `(flagName, userId)` pair always returns the same bucket.
 *
 * @param flagName - The flag name (part of the hash key).
 * @param userId - The user identifier (part of the hash key).
 * @param seed - Optional hash seed. Defaults to `0`.
 * @returns Integer in the range `[0, 99]`.
 */
export function rolloutBucket(flagName: string, userId: string, seed: number = 0): number {
  const hash = murmurhash3(`${flagName}:${userId}`, seed);
  return hash % 100;
}

/**
 * Selects a variant from a weighted list using deterministic hashing.
 * Uses a different seed (`0x5f3759df`) than rollout to ensure independent bucketing.
 *
 * @param flagName - The flag name (part of the hash key).
 * @param userId - The user identifier (part of the hash key).
 * @param variants - Array of variants with `name` and `weight` properties. Weights are relative.
 * @returns The name of the selected variant.
 */
export function selectVariant(
  flagName: string,
  userId: string,
  variants: ReadonlyArray<{ name: string; weight: number }>,
): string {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) {
    return variants[0].name;
  }

  const hash = murmurhash3(`${flagName}:${userId}`, 0x5f3759df);
  const bucket = hash % totalWeight;

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return variant.name;
    }
  }

  return variants[variants.length - 1].name;
}
