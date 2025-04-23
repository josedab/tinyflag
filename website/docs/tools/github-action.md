---
sidebar_position: 3
title: GitHub Action
description: Validate flag files and post change summaries on pull requests.
---

# GitHub Action

TinyFlag provides a GitHub Action for validating flag files on pull requests and posting change summaries.

## Usage

```yaml
# .github/workflows/flags.yml
name: Validate Flags
on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Required for diff
      - uses: josedab/tinyflag@v1
        with:
          flags-file: flags.yml
```

## What It Does

1. **Validates** `flags.yml` against the schema
2. **Fails** the check if the file is malformed
3. **Posts a comment** on the PR summarizing flag changes:

```
## 🚩 Flag changes detected

- **+** `payment-v2` added (enabled: true, rollout: 10%)
- **~** `new-checkout`: rollout: 10% → 50%
- **-** `legacy-nav` removed
```

## Inputs

| Input          | Required | Default               | Description                   |
| -------------- | -------- | --------------------- | ----------------------------- |
| `flags-file`   | No       | `flags.yml`           | Path to the flags file        |
| `github-token` | No       | `${{ github.token }}` | Token for posting PR comments |
