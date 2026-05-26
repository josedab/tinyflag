"""Test cross-language determinism using shared test vectors."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tinyflag import murmurhash3, rollout_bucket, select_variant, TinyFlag


def load_vectors():
    vectors_path = os.path.join(os.path.dirname(__file__), "..", "..", "test-vectors.json")
    with open(vectors_path) as f:
        return json.load(f)


def test_murmurhash3():
    vectors = load_vectors()
    for v in vectors["murmurhash3"]:
        result = murmurhash3(v["key"], v["seed"])
        assert result == v["expected"], (
            f"murmurhash3({v['key']!r}, {v['seed']}) = {result}, expected {v['expected']}"
        )
    print(f"  ✓ murmurhash3: {len(vectors['murmurhash3'])} vectors passed")


def test_rollout_bucket():
    vectors = load_vectors()
    for v in vectors["rolloutBucket"]:
        result = rollout_bucket(v["flagName"], v["userId"], v["seed"])
        assert result == v["expected"], (
            f"rollout_bucket({v['flagName']!r}, {v['userId']!r}) = {result}, expected {v['expected']}"
        )
    print(f"  ✓ rollout_bucket: {len(vectors['rolloutBucket'])} vectors passed")


def test_select_variant():
    vectors = load_vectors()
    for v in vectors["selectVariant"]:
        result = select_variant(v["flagName"], v["userId"], v["variants"])
        assert result == v["expected"], (
            f"select_variant({v['flagName']!r}, {v['userId']!r}) = {result!r}, expected {v['expected']!r}"
        )
    print(f"  ✓ select_variant: {len(vectors['selectVariant'])} vectors passed")


def test_basic_evaluation():
    config = {
        "version": 1,
        "flags": {
            "enabled-flag": {"enabled": True},
            "disabled-flag": {"enabled": False},
            "rollout-flag": {"enabled": True, "rollout": 50},
            "variant-flag": {
                "enabled": True,
                "variants": [
                    {"name": "control", "weight": 50},
                    {"name": "treatment", "weight": 50},
                ],
            },
        },
    }
    tf = TinyFlag(config)

    assert tf.is_enabled("enabled-flag") is True
    assert tf.is_enabled("disabled-flag") is False
    assert tf.is_enabled("unknown-flag") is False
    assert tf.get_variant("variant-flag", {"userId": "user-1"}) is not None
    assert tf.get_variant("variant-flag", {"userId": "user-1"}) in ("control", "treatment")
    print("  ✓ basic_evaluation: passed")


if __name__ == "__main__":
    print("Running Python SDK tests...")
    test_murmurhash3()
    test_rollout_bucket()
    test_select_variant()
    test_basic_evaluation()
    print("All Python tests passed! ✅")
