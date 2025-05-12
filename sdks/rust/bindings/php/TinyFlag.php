<?php
/**
 * TinyFlag PHP binding — pure PHP evaluator compatible with WASM module.
 *
 * Usage:
 *   $tf = new TinyFlag\Evaluator(file_get_contents('flags.json'));
 *   $enabled = $tf->isEnabled('my-flag', ['userId' => 'user-123']);
 */

namespace TinyFlag;

class Evaluator
{
    private array $flags;

    public function __construct(string $configJson)
    {
        $config = json_decode($configJson, true);
        $this->flags = $config['flags'] ?? $config;
    }

    public function isEnabled(string $flagName, array $context = []): bool
    {
        $flag = $this->flags[$flagName] ?? null;
        if (!$flag || !($flag['enabled'] ?? false)) {
            return false;
        }

        if (isset($flag['rollout']) && isset($context['userId'])) {
            $bucket = $this->rolloutBucket($flagName, (string)$context['userId']);
            return $bucket < (int)$flag['rollout'];
        }

        return true;
    }

    public function getVariant(string $flagName, array $context = []): ?string
    {
        $flag = $this->flags[$flagName] ?? null;
        if (!$flag || empty($flag['variants']) || !$this->isEnabled($flagName, $context)) {
            return null;
        }

        $userId = (string)($context['userId'] ?? '');
        return $this->selectVariant($flagName, $userId, $flag['variants']);
    }

    /** MurmurHash3 32-bit (cross-language compatible). */
    private function murmurhash3(string $key, int $seed = 0): int
    {
        $bytes = array_values(unpack('C*', $key));
        $h = $seed & 0xFFFFFFFF;
        $len = count($bytes);
        $i = 0;

        while ($i + 4 <= $len) {
            $k = $bytes[$i] | ($bytes[$i + 1] << 8) | ($bytes[$i + 2] << 16) | ($bytes[$i + 3] << 24);
            $k = ($k * 0xcc9e2d51) & 0xFFFFFFFF;
            $k = (($k << 15) | ($k >> 17)) & 0xFFFFFFFF;
            $k = ($k * 0x1b873593) & 0xFFFFFFFF;
            $h = ($h ^ $k) & 0xFFFFFFFF;
            $h = (($h << 13) | ($h >> 19)) & 0xFFFFFFFF;
            $h = ($h * 5 + 0xe6546b64) & 0xFFFFFFFF;
            $i += 4;
        }

        $k = 0;
        $rem = $len & 3;
        if ($rem >= 3) $k ^= $bytes[$i + 2] << 16;
        if ($rem >= 2) $k ^= $bytes[$i + 1] << 8;
        if ($rem >= 1) {
            $k ^= $bytes[$i];
            $k = ($k * 0xcc9e2d51) & 0xFFFFFFFF;
            $k = (($k << 15) | ($k >> 17)) & 0xFFFFFFFF;
            $k = ($k * 0x1b873593) & 0xFFFFFFFF;
            $h = ($h ^ $k) & 0xFFFFFFFF;
        }

        $h = ($h ^ $len) & 0xFFFFFFFF;
        $h = ($h ^ ($h >> 16)) & 0xFFFFFFFF;
        $h = ($h * 0x85ebca6b) & 0xFFFFFFFF;
        $h = ($h ^ ($h >> 13)) & 0xFFFFFFFF;
        $h = ($h * 0xc2b2ae35) & 0xFFFFFFFF;
        $h = ($h ^ ($h >> 16)) & 0xFFFFFFFF;

        return $h;
    }

    private function rolloutBucket(string $flagName, string $userId, int $seed = 0): int
    {
        return $this->murmurhash3("{$flagName}:{$userId}", $seed) % 100;
    }

    private function selectVariant(string $flagName, string $userId, array $variants): ?string
    {
        $totalWeight = array_sum(array_column($variants, 'weight'));
        if ($totalWeight === 0) return $variants[0]['name'] ?? null;

        $h = $this->murmurhash3("{$flagName}:{$userId}", 0x5f3759df);
        $bucket = $h % $totalWeight;

        $cumulative = 0;
        foreach ($variants as $v) {
            $cumulative += $v['weight'];
            if ($bucket < $cumulative) return $v['name'];
        }

        return end($variants)['name'] ?? null;
    }
}
