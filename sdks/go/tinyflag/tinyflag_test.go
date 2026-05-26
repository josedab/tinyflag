package tinyflag

import (
	"encoding/json"
	"os"
	"testing"
)

type TestVectors struct {
	MurmurHash3   []MurmurVector   `json:"murmurhash3"`
	RolloutBucket []RolloutVector  `json:"rolloutBucket"`
	SelectVariant []VariantVector  `json:"selectVariant"`
}

type MurmurVector struct {
	Key      string `json:"key"`
	Seed     uint32 `json:"seed"`
	Expected uint32 `json:"expected"`
}

type RolloutVector struct {
	FlagName string `json:"flagName"`
	UserID   string `json:"userId"`
	Seed     uint32 `json:"seed"`
	Expected int    `json:"expected"`
}

type VariantVector struct {
	FlagName string    `json:"flagName"`
	UserID   string    `json:"userId"`
	Variants []Variant `json:"variants"`
	Expected string    `json:"expected"`
}

func loadVectors(t *testing.T) TestVectors {
	data, err := os.ReadFile("../../test-vectors.json")
	if err != nil {
		t.Fatalf("Failed to load test vectors: %v", err)
	}
	var v TestVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("Failed to parse test vectors: %v", err)
	}
	return v
}

func TestMurmurhash3CrossLanguage(t *testing.T) {
	vectors := loadVectors(t)
	for _, v := range vectors.MurmurHash3 {
		result := Murmurhash3(v.Key, v.Seed)
		if result != v.Expected {
			t.Errorf("Murmurhash3(%q, %d) = %d, want %d", v.Key, v.Seed, result, v.Expected)
		}
	}
}

func TestRolloutBucketCrossLanguage(t *testing.T) {
	vectors := loadVectors(t)
	for _, v := range vectors.RolloutBucket {
		result := RolloutBucket(v.FlagName, v.UserID, v.Seed)
		if result != v.Expected {
			t.Errorf("RolloutBucket(%q, %q, %d) = %d, want %d", v.FlagName, v.UserID, v.Seed, result, v.Expected)
		}
	}
}

func TestSelectVariantCrossLanguage(t *testing.T) {
	vectors := loadVectors(t)
	for _, v := range vectors.SelectVariant {
		result := SelectVariant(v.FlagName, v.UserID, v.Variants)
		if result != v.Expected {
			t.Errorf("SelectVariant(%q, %q) = %q, want %q", v.FlagName, v.UserID, result, v.Expected)
		}
	}
}

func TestIsEnabled(t *testing.T) {
	boolTrue := true
	rollout50 := 50

	tf := New(FlagConfig{
		Version: 1,
		Flags: map[string]*FlagDefinition{
			"enabled":  {Enabled: true},
			"disabled": {Enabled: false},
			"rollout":  {Enabled: true, Rollout: &rollout50},
			"rules": {
				Enabled: true,
				Rules: []Rule{{
					Conditions: map[string]interface{}{"plan": "pro"},
					Enabled:    &boolTrue,
				}},
			},
		},
	})

	if !tf.IsEnabled("enabled", nil) {
		t.Error("expected enabled=true")
	}
	if tf.IsEnabled("disabled", nil) {
		t.Error("expected disabled=false")
	}
	if tf.IsEnabled("unknown", nil) {
		t.Error("expected unknown=false")
	}
	if !tf.IsEnabled("rules", UserContext{"plan": "pro"}) {
		t.Error("expected rule-matched=true")
	}
}

func TestGetVariant(t *testing.T) {
	tf := New(FlagConfig{
		Version: 1,
		Flags: map[string]*FlagDefinition{
			"ab-test": {
				Enabled: true,
				Variants: []Variant{
					{Name: "control", Weight: 50},
					{Name: "treatment", Weight: 50},
				},
			},
		},
	})

	v := tf.GetVariant("ab-test", UserContext{"userId": "user-1"})
	if v != "control" && v != "treatment" {
		t.Errorf("unexpected variant: %q", v)
	}
}

func TestConcurrentAccess(t *testing.T) {
	tf := New(FlagConfig{
		Version: 1,
		Flags: map[string]*FlagDefinition{
			"test": {Enabled: true},
		},
	})

	done := make(chan bool, 100)
	for i := 0; i < 100; i++ {
		go func() {
			tf.IsEnabled("test", nil)
			done <- true
		}()
	}
	for i := 0; i < 100; i++ {
		<-done
	}
}
