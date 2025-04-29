# TinyFlag Python SDK

File-driven, zero-dependency feature flag SDK for Python.

Ports the TinyFlag MurmurHash3, rollout bucketing, variant selection, and full
flag evaluation logic to Python, ensuring deterministic results across all
TinyFlag SDK languages.

## Prerequisites

- Python 3.9+

## Installation

```bash
pip install tinyflag
```

For local development:

```bash
pip install -e .
```

## Usage

```python
from tinyflag import TinyFlag, UserContext

tf = TinyFlag.load_file("flags.yml")
ctx = UserContext(user_id="user-123")

enabled = tf.is_enabled("my-flag", ctx)
print(f"my-flag enabled: {enabled}")

variant = tf.get_variant("experiment", ctx)
print(f"experiment variant: {variant}")
```

## Building

```bash
pip install -e .
```

## Testing

```bash
python -m pytest tests/
```

## Cross-language Determinism

All test vectors from `sdks/test-vectors.json` pass identically in Python, Go,
Rust, and TypeScript, ensuring consistent flag evaluation across runtimes.
