using System;
using System.Collections.Generic;
using System.Text.Json;

namespace TinyFlag
{
    /// <summary>
    /// TinyFlag C# evaluator — compatible with WASM module.
    /// </summary>
    public class Evaluator
    {
        private readonly Dictionary<string, JsonElement> _flags;

        public Evaluator(string configJson)
        {
            var doc = JsonDocument.Parse(configJson);
            var root = doc.RootElement;

            if (root.TryGetProperty("flags", out var flags))
                _flags = ParseFlags(flags);
            else
                _flags = ParseFlags(root);
        }

        public bool IsEnabled(string flagName, Dictionary<string, object>? context = null)
        {
            if (!_flags.TryGetValue(flagName, out var flag))
                return false;

            if (!flag.GetProperty("enabled").GetBoolean())
                return false;

            if (flag.TryGetProperty("rollout", out var rollout) && context?.ContainsKey("userId") == true)
            {
                var bucket = RolloutBucket(flagName, context["userId"].ToString()!);
                return bucket < rollout.GetInt32();
            }

            return true;
        }

        public string? GetVariant(string flagName, Dictionary<string, object>? context = null)
        {
            if (!_flags.TryGetValue(flagName, out var flag))
                return null;

            if (!flag.TryGetProperty("variants", out var variants) || variants.GetArrayLength() == 0)
                return null;

            if (!IsEnabled(flagName, context))
                return null;

            var userId = context?.ContainsKey("userId") == true ? context["userId"].ToString()! : "";
            return SelectVariant(flagName, userId, variants);
        }

        /// <summary>MurmurHash3 32-bit (cross-language compatible).</summary>
        public static uint MurmurHash3(string key, uint seed = 0)
        {
            var bytes = System.Text.Encoding.GetEncoding("iso-8859-1").GetBytes(key);
            return MurmurHash3(bytes, seed);
        }

        public static uint MurmurHash3(byte[] bytes, uint seed = 0)
        {
            uint h = seed;
            int len = bytes.Length;
            int i = 0;

            while (i + 4 <= len)
            {
                uint k = (uint)(bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
                k *= 0xcc9e2d51;
                k = (k << 15) | (k >> 17);
                k *= 0x1b873593;
                h ^= k;
                h = (h << 13) | (h >> 19);
                h = h * 5 + 0xe6546b64;
                i += 4;
            }

            uint tail = 0;
            int rem = len & 3;
            if (rem >= 3) tail ^= (uint)bytes[i + 2] << 16;
            if (rem >= 2) tail ^= (uint)bytes[i + 1] << 8;
            if (rem >= 1)
            {
                tail ^= bytes[i];
                tail *= 0xcc9e2d51;
                tail = (tail << 15) | (tail >> 17);
                tail *= 0x1b873593;
                h ^= tail;
            }

            h ^= (uint)len;
            h ^= h >> 16;
            h *= 0x85ebca6b;
            h ^= h >> 13;
            h *= 0xc2b2ae35;
            h ^= h >> 16;

            return h;
        }

        public static int RolloutBucket(string flagName, string userId, uint seed = 0)
        {
            var h = MurmurHash3($"{flagName}:{userId}", seed);
            return (int)(h % 100);
        }

        private static string? SelectVariant(string flagName, string userId, JsonElement variants)
        {
            int totalWeight = 0;
            foreach (var v in variants.EnumerateArray())
                totalWeight += v.GetProperty("weight").GetInt32();

            if (totalWeight == 0)
            {
                foreach (var v in variants.EnumerateArray())
                    return v.GetProperty("name").GetString();
                return null;
            }

            var h = MurmurHash3($"{flagName}:{userId}", 0x5f3759df);
            var bucket = (int)(h % (uint)totalWeight);

            int cumulative = 0;
            foreach (var v in variants.EnumerateArray())
            {
                cumulative += v.GetProperty("weight").GetInt32();
                if (bucket < cumulative)
                    return v.GetProperty("name").GetString();
            }

            return null;
        }

        private static Dictionary<string, JsonElement> ParseFlags(JsonElement element)
        {
            var result = new Dictionary<string, JsonElement>();
            foreach (var prop in element.EnumerateObject())
                result[prop.Name] = prop.Value.Clone();
            return result;
        }
    }
}
