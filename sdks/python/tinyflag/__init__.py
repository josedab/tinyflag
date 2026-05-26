"""
TinyFlag — file-driven, zero-dependency feature flag SDK for Python.

Same YAML schema, MurmurHash3 implementation, and evaluation semantics
as the JavaScript SDK, ensuring cross-language determinism.
"""

from __future__ import annotations
import json
import re
from dataclasses import dataclass, field
from typing import Any, Optional


def murmurhash3(key: str, seed: int = 0) -> int:
    """MurmurHash3 (32-bit) — deterministic hash for rollout bucketing."""
    h = seed & 0xFFFFFFFF
    length = len(key)
    i = 0

    while i + 4 <= length:
        k = (
            (ord(key[i]) & 0xFF)
            | ((ord(key[i + 1]) & 0xFF) << 8)
            | ((ord(key[i + 2]) & 0xFF) << 16)
            | ((ord(key[i + 3]) & 0xFF) << 24)
        )
        k = (k * 0xCC9E2D51) & 0xFFFFFFFF
        k = ((k << 15) | (k >> 17)) & 0xFFFFFFFF
        k = (k * 0x1B873593) & 0xFFFFFFFF

        h ^= k
        h = ((h << 13) | (h >> 19)) & 0xFFFFFFFF
        h = (h * 5 + 0xE6546B64) & 0xFFFFFFFF
        i += 4

    k = 0
    remaining = length & 3
    if remaining >= 3:
        k ^= (ord(key[i + 2]) & 0xFF) << 16
    if remaining >= 2:
        k ^= (ord(key[i + 1]) & 0xFF) << 8
    if remaining >= 1:
        k ^= ord(key[i]) & 0xFF
        k = (k * 0xCC9E2D51) & 0xFFFFFFFF
        k = ((k << 15) | (k >> 17)) & 0xFFFFFFFF
        k = (k * 0x1B873593) & 0xFFFFFFFF
        h ^= k

    h ^= length
    h ^= (h >> 16)
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= (h >> 13)
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= (h >> 16)

    return h & 0xFFFFFFFF


def rollout_bucket(flag_name: str, user_id: str, seed: int = 0) -> int:
    """Returns a bucket 0–99 for percentage-based rollout."""
    return murmurhash3(f"{flag_name}:{user_id}", seed) % 100


def select_variant(
    flag_name: str, user_id: str, variants: list[dict[str, Any]]
) -> str:
    """Selects a variant from a weighted list using deterministic hashing."""
    total_weight = sum(v.get("weight", 0) for v in variants)
    if total_weight == 0:
        return variants[0]["name"]

    h = murmurhash3(f"{flag_name}:{user_id}", 0x5F3759DF)
    bucket = h % total_weight

    cumulative = 0
    for v in variants:
        cumulative += v.get("weight", 0)
        if bucket < cumulative:
            return v["name"]

    return variants[-1]["name"]


def _match_condition(ctx_value: Any, expected: Any) -> bool:
    """Evaluate a single condition against a context value."""
    if ctx_value is None:
        return False

    if isinstance(expected, dict):
        if "$in" in expected:
            return ctx_value in expected["$in"]
        if "$not" in expected:
            return not _match_condition(ctx_value, expected["$not"])
        if any(k in expected for k in ("$gt", "$gte", "$lt", "$lte")):
            if not isinstance(ctx_value, (int, float)):
                return False
            if "$gt" in expected and not (ctx_value > expected["$gt"]):
                return False
            if "$gte" in expected and not (ctx_value >= expected["$gte"]):
                return False
            if "$lt" in expected and not (ctx_value < expected["$lt"]):
                return False
            if "$lte" in expected and not (ctx_value <= expected["$lte"]):
                return False
            return True
        return False

    if isinstance(expected, str) and "*" in expected:
        if not isinstance(ctx_value, str):
            return False
        pattern = re.escape(expected).replace(r"\*", ".*")
        return bool(re.fullmatch(pattern, ctx_value))

    return ctx_value == expected


def _match_rule(rule: dict, context: dict) -> bool:
    """Check if all conditions in a rule match the context."""
    conditions = rule.get("conditions", {})
    if not conditions:
        return True
    return all(
        _match_condition(context.get(field), expected)
        for field, expected in conditions.items()
    )


@dataclass
class FlagDefinition:
    enabled: bool = False
    description: str = ""
    tags: list[str] = field(default_factory=list)
    rollout: Optional[int] = None
    rules: list[dict] = field(default_factory=list)
    variants: list[dict] = field(default_factory=list)
    schedule: Optional[dict] = None
    requires: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict) -> "FlagDefinition":
        return cls(
            enabled=data.get("enabled", False),
            description=data.get("description", ""),
            tags=data.get("tags", []),
            rollout=data.get("rollout"),
            rules=data.get("rules", []),
            variants=data.get("variants", []),
            schedule=data.get("schedule"),
            requires=data.get("requires", []),
        )


class TinyFlag:
    """TinyFlag SDK for Python — evaluates feature flags from YAML/JSON config."""

    def __init__(self, config: dict[str, Any]) -> None:
        self.flags: dict[str, FlagDefinition] = {}
        raw_flags = config.get("flags", {})
        for name, definition in raw_flags.items():
            self.flags[name] = FlagDefinition.from_dict(definition)

    @classmethod
    def from_file(cls, path: str) -> "TinyFlag":
        """Load flags from a YAML or JSON file."""
        with open(path) as f:
            content = f.read()

        if path.endswith(".json"):
            data = json.loads(content)
        else:
            # Minimal YAML parser for flag config subset
            data = _parse_simple_yaml(content)

        return cls(data)

    def is_enabled(self, flag_name: str, context: Optional[dict] = None) -> bool:
        """Check if a flag is enabled for the given context."""
        flag = self.flags.get(flag_name)
        if not flag:
            return False

        if not flag.enabled:
            return False

        context = context or {}

        if flag.rules and context:
            for rule in flag.rules:
                if _match_rule(rule, context):
                    rule_enabled = rule.get("enabled", True)
                    if rule_enabled and rule.get("rollout") is not None:
                        user_id = context.get("userId") or context.get("user_id")
                        if user_id:
                            bucket = rollout_bucket(flag_name, str(user_id))
                            return bucket < rule["rollout"]
                    return rule_enabled

        if flag.rollout is not None:
            user_id = context.get("userId") or context.get("user_id")
            if user_id:
                bucket = rollout_bucket(flag_name, str(user_id))
                return bucket < flag.rollout

        return flag.enabled

    def get_variant(
        self, flag_name: str, context: Optional[dict] = None
    ) -> Optional[str]:
        """Get the variant assignment for a flag."""
        flag = self.flags.get(flag_name)
        if not flag or not flag.enabled or not flag.variants:
            return None

        context = context or {}
        user_id = context.get("userId") or context.get("user_id")
        if not user_id:
            return None

        if flag.rules and context:
            for rule in flag.rules:
                if _match_rule(rule, context) and rule.get("variant"):
                    return rule["variant"]

        if not self.is_enabled(flag_name, context):
            return None

        return select_variant(flag_name, str(user_id), flag.variants)


def _parse_simple_yaml(text: str) -> dict:
    """Minimal YAML parser for the TinyFlag flag config subset."""
    # For production use, users should use PyYAML. This handles the basic subset.
    try:
        import yaml
        return yaml.safe_load(text)
    except ImportError:
        pass

    # Fallback: very basic parser for simple flag configs
    result: dict[str, Any] = {"version": 1, "flags": {}}
    current_flag = None

    for line in text.split("\n"):
        stripped = line.rstrip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())

        if stripped.startswith("version:"):
            result["version"] = int(stripped.split(":")[1].strip())
        elif stripped == "flags:":
            continue
        elif indent == 2 and stripped.endswith(":") and " " not in stripped.strip():
            current_flag = stripped[:-1].strip()
            result["flags"][current_flag] = {"enabled": False}
        elif indent == 4 and current_flag:
            if ":" in stripped:
                key, _, val = stripped.partition(":")
                key = key.strip()
                val = val.strip()
                if key == "enabled":
                    result["flags"][current_flag]["enabled"] = val == "true"
                elif key == "description":
                    result["flags"][current_flag]["description"] = val
                elif key == "rollout":
                    result["flags"][current_flag]["rollout"] = int(val)

    return result
