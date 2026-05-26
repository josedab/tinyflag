// Package tinyflag provides a file-driven, zero-dependency feature flag SDK for Go.
// It uses the same YAML schema, MurmurHash3 implementation, and evaluation semantics
// as the JavaScript and Python SDKs, ensuring cross-language determinism.
package tinyflag

import (
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"sync"
)

// Murmurhash3 computes MurmurHash3 (32-bit) for deterministic rollout bucketing.
func Murmurhash3(key string, seed uint32) uint32 {
	h := seed
	length := len(key)
	i := 0

	for i+4 <= length {
		k := uint32(key[i]&0xff) |
			uint32(key[i+1]&0xff)<<8 |
			uint32(key[i+2]&0xff)<<16 |
			uint32(key[i+3]&0xff)<<24

		k *= 0xcc9e2d51
		k = (k << 15) | (k >> 17)
		k *= 0x1b873593

		h ^= k
		h = (h << 13) | (h >> 19)
		h = h*5 + 0xe6546b64
		i += 4
	}

	var k uint32
	switch length & 3 {
	case 3:
		k ^= uint32(key[i+2]&0xff) << 16
		fallthrough
	case 2:
		k ^= uint32(key[i+1]&0xff) << 8
		fallthrough
	case 1:
		k ^= uint32(key[i] & 0xff)
		k *= 0xcc9e2d51
		k = (k << 15) | (k >> 17)
		k *= 0x1b873593
		h ^= k
	}

	h ^= uint32(length)
	h ^= h >> 16
	h *= 0x85ebca6b
	h ^= h >> 13
	h *= 0xc2b2ae35
	h ^= h >> 16

	return h
}

// RolloutBucket returns a bucket 0–99 for percentage-based rollout.
func RolloutBucket(flagName, userID string, seed uint32) int {
	return int(Murmurhash3(flagName+":"+userID, seed) % 100)
}

// Variant represents an A/B test variant with a weight.
type Variant struct {
	Name   string `json:"name" yaml:"name"`
	Weight int    `json:"weight" yaml:"weight"`
}

// SelectVariant selects a variant from a weighted list using deterministic hashing.
func SelectVariant(flagName, userID string, variants []Variant) string {
	totalWeight := 0
	for _, v := range variants {
		totalWeight += v.Weight
	}
	if totalWeight == 0 {
		return variants[0].Name
	}

	h := Murmurhash3(flagName+":"+userID, 0x5f3759df)
	bucket := int(h % uint32(totalWeight))

	cumulative := 0
	for _, v := range variants {
		cumulative += v.Weight
		if bucket < cumulative {
			return v.Name
		}
	}
	return variants[len(variants)-1].Name
}

// Rule represents a targeting rule.
type Rule struct {
	Conditions map[string]interface{} `json:"conditions" yaml:"conditions"`
	Enabled    *bool                  `json:"enabled,omitempty" yaml:"enabled,omitempty"`
	Rollout    *int                   `json:"rollout,omitempty" yaml:"rollout,omitempty"`
	Variant    string                 `json:"variant,omitempty" yaml:"variant,omitempty"`
}

// FlagDefinition defines a single feature flag.
type FlagDefinition struct {
	Enabled     bool      `json:"enabled" yaml:"enabled"`
	Description string    `json:"description,omitempty" yaml:"description,omitempty"`
	Tags        []string  `json:"tags,omitempty" yaml:"tags,omitempty"`
	Rollout     *int      `json:"rollout,omitempty" yaml:"rollout,omitempty"`
	Rules       []Rule    `json:"rules,omitempty" yaml:"rules,omitempty"`
	Variants    []Variant `json:"variants,omitempty" yaml:"variants,omitempty"`
	Requires    []string  `json:"requires,omitempty" yaml:"requires,omitempty"`
}

// FlagConfig is the root flag configuration.
type FlagConfig struct {
	Version int                        `json:"version" yaml:"version"`
	Flags   map[string]*FlagDefinition `json:"flags" yaml:"flags"`
}

// UserContext holds evaluation context.
type UserContext map[string]interface{}

// TinyFlag is the main SDK instance. It is safe for concurrent use.
type TinyFlag struct {
	mu    sync.RWMutex
	flags map[string]*FlagDefinition
}

// New creates a TinyFlag instance from a config.
func New(config FlagConfig) *TinyFlag {
	return &TinyFlag{flags: config.Flags}
}

// FromJSON creates a TinyFlag instance from a JSON byte slice.
func FromJSON(data []byte) (*TinyFlag, error) {
	var config FlagConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	return New(config), nil
}

// FromFile loads a TinyFlag instance from a JSON file.
func FromFile(path string) (*TinyFlag, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return FromJSON(data)
}

// IsEnabled checks if a flag is enabled for the given context.
func (tf *TinyFlag) IsEnabled(flagName string, ctx UserContext) bool {
	tf.mu.RLock()
	defer tf.mu.RUnlock()

	flag, ok := tf.flags[flagName]
	if !ok || !flag.Enabled {
		return false
	}

	if len(flag.Rules) > 0 && ctx != nil {
		for _, rule := range flag.Rules {
			if matchRule(rule, ctx) {
				ruleEnabled := true
				if rule.Enabled != nil {
					ruleEnabled = *rule.Enabled
				}
				if ruleEnabled && rule.Rollout != nil {
					userID, _ := ctx["userId"].(string)
					if userID != "" {
						bucket := RolloutBucket(flagName, userID, 0)
						return bucket < *rule.Rollout
					}
				}
				return ruleEnabled
			}
		}
	}

	if flag.Rollout != nil {
		userID, _ := ctx["userId"].(string)
		if userID != "" {
			bucket := RolloutBucket(flagName, userID, 0)
			return bucket < *flag.Rollout
		}
	}

	return flag.Enabled
}

// GetVariant returns the variant assignment for a flag.
func (tf *TinyFlag) GetVariant(flagName string, ctx UserContext) string {
	tf.mu.RLock()
	defer tf.mu.RUnlock()

	flag, ok := tf.flags[flagName]
	if !ok || !flag.Enabled || len(flag.Variants) == 0 {
		return ""
	}

	userID, _ := ctx["userId"].(string)
	if userID == "" {
		return ""
	}

	if len(flag.Rules) > 0 && ctx != nil {
		for _, rule := range flag.Rules {
			if matchRule(rule, ctx) && rule.Variant != "" {
				return rule.Variant
			}
		}
	}

	if !tf.IsEnabled(flagName, ctx) {
		return ""
	}

	return SelectVariant(flagName, userID, flag.Variants)
}

func matchRule(rule Rule, ctx UserContext) bool {
	if len(rule.Conditions) == 0 {
		return true
	}
	for field, expected := range rule.Conditions {
		ctxVal := ctx[field]
		if !matchCondition(ctxVal, expected) {
			return false
		}
	}
	return true
}

func matchCondition(ctxVal, expected interface{}) bool {
	if ctxVal == nil {
		return false
	}

	switch exp := expected.(type) {
	case map[string]interface{}:
		if in, ok := exp["$in"]; ok {
			if arr, ok := in.([]interface{}); ok {
				for _, item := range arr {
					if ctxVal == item {
						return true
					}
				}
			}
			return false
		}
		if notVal, ok := exp["$not"]; ok {
			return !matchCondition(ctxVal, notVal)
		}
		return false

	case string:
		if strings.Contains(exp, "*") {
			s, ok := ctxVal.(string)
			if !ok {
				return false
			}
			pattern := "^" + regexp.QuoteMeta(exp)
			pattern = strings.ReplaceAll(pattern, `\*`, ".*")
			pattern += "$"
			matched, _ := regexp.MatchString(pattern, s)
			return matched
		}
		return ctxVal == exp

	default:
		return ctxVal == exp
	}
}
