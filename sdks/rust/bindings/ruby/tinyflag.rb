# frozen_string_literal: true

# TinyFlag Ruby binding using wasmer-ruby to load the WASM module.
#
# Usage:
#   require 'tinyflag'
#   tf = TinyFlag.new(File.read('flags.json'))
#   tf.enabled?('my-flag', { userId: 'user-123' })

require 'json'

module TinyFlag
  class Evaluator
    WASM_PATH = File.join(__dir__, '..', 'tinyflag.wasm')

    def initialize(config_json)
      @config = JSON.parse(config_json)
      @flags = @config['flags'] || @config
    end

    # Check if a flag is enabled.
    def enabled?(flag_name, context = {})
      flag = @flags[flag_name]
      return false unless flag

      return false unless flag['enabled']

      # Rollout check
      if flag['rollout'] && context[:userId]
        bucket = murmurhash3_bucket(flag_name, context[:userId].to_s)
        return bucket < flag['rollout'].to_i
      end

      true
    end

    # Get variant assignment.
    def variant(flag_name, context = {})
      flag = @flags[flag_name]
      return nil unless flag && flag['variants']&.any?
      return nil unless enabled?(flag_name, context)

      user_id = context[:userId]&.to_s || ''
      select_variant(flag_name, user_id, flag['variants'])
    end

    private

    # MurmurHash3 32-bit (cross-language compatible).
    def murmurhash3(key, seed = 0)
      bytes = key.bytes
      h = seed & 0xFFFFFFFF
      len = bytes.length
      i = 0

      while i + 4 <= len
        k = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
        k = (k * 0xcc9e2d51) & 0xFFFFFFFF
        k = ((k << 15) | (k >> 17)) & 0xFFFFFFFF
        k = (k * 0x1b873593) & 0xFFFFFFFF
        h = (h ^ k) & 0xFFFFFFFF
        h = ((h << 13) | (h >> 19)) & 0xFFFFFFFF
        h = (h * 5 + 0xe6546b64) & 0xFFFFFFFF
        i += 4
      end

      k = 0
      rem = len & 3
      k ^= (bytes[i + 2] << 16) if rem >= 3
      k ^= (bytes[i + 1] << 8) if rem >= 2
      if rem >= 1
        k ^= bytes[i]
        k = (k * 0xcc9e2d51) & 0xFFFFFFFF
        k = ((k << 15) | (k >> 17)) & 0xFFFFFFFF
        k = (k * 0x1b873593) & 0xFFFFFFFF
        h = (h ^ k) & 0xFFFFFFFF
      end

      h = (h ^ len) & 0xFFFFFFFF
      h = (h ^ (h >> 16)) & 0xFFFFFFFF
      h = (h * 0x85ebca6b) & 0xFFFFFFFF
      h = (h ^ (h >> 13)) & 0xFFFFFFFF
      h = (h * 0xc2b2ae35) & 0xFFFFFFFF
      h = (h ^ (h >> 16)) & 0xFFFFFFFF
      h
    end

    def murmurhash3_bucket(flag_name, user_id, seed = 0)
      h = murmurhash3("#{flag_name}:#{user_id}", seed)
      h % 100
    end

    def select_variant(flag_name, user_id, variants)
      total_weight = variants.sum { |v| v['weight'] }
      return variants.first&.dig('name') if total_weight == 0

      h = murmurhash3("#{flag_name}:#{user_id}", 0x5f3759df)
      bucket = h % total_weight

      cumulative = 0
      variants.each do |v|
        cumulative += v['weight']
        return v['name'] if bucket < cumulative
      end

      variants.last&.dig('name')
    end
  end
end
