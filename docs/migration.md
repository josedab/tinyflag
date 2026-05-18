# Migration Guide

## From LaunchDarkly

| LaunchDarkly                              | TinyFlag                                  |
| ----------------------------------------- | ----------------------------------------- |
| `LDClient.init(sdkKey)`                   | `new TinyFlag({ source: './flags.yml' })` |
| `client.variation('flag', user, default)` | `ff.isEnabled('flag', context)`           |
| `client.jsonVariation(...)`               | `ff.getVariant('flag', context)`          |
| `client.track('event')`                   | `ff.on('exposure', handler)`              |
| Dashboard → Targeting                     | `rules:` in `flags.yml`                   |
| Dashboard → Rollout %                     | `rollout: 50` in `flags.yml`              |
| Per-seat pricing                          | Free forever                              |

### Key Differences

1. **No SDK key needed** — TinyFlag reads from a file, not a server
2. **No network calls** — Evaluation happens entirely in-process
3. **Git-native** — Flag changes go through PRs, not a dashboard
4. **No persistent connection** — No WebSocket or streaming

### Migration Steps

1. Export your flags from LaunchDarkly
2. Create a `flags.yml` with equivalent definitions
3. Replace `LDClient` with `TinyFlag` in your code
4. Replace `variation()` calls with `isEnabled()` / `getVariant()`
5. Update CI/CD to validate `flags.yml` on PRs

### Configuration Examples

**Percentage rollout:**

```yaml
# LaunchDarkly: 30% rollout via dashboard targeting
# TinyFlag equivalent:
flags:
  new-checkout:
    enabled: true
    rollout: 30
```

**Multi-variant (A/B test):**

```yaml
# LaunchDarkly: multivariate flag with "control" (50%) and "new-flow" (50%)
# TinyFlag equivalent:
flags:
  checkout-experiment:
    enabled: true
    variants:
      - name: control
        weight: 50
      - name: new-flow
        weight: 50
```

**Targeted rollout (specific users):**

```yaml
# LaunchDarkly: targeting rule for "pro" plan users
# TinyFlag equivalent:
flags:
  premium-feature:
    enabled: false
    rules:
      - conditions:
          plan: pro
        enabled: true
        rollout: 100
```

## From Unleash

| Unleash                        | TinyFlag                                  |
| ------------------------------ | ----------------------------------------- |
| `initialize({ url, appName })` | `new TinyFlag({ source: './flags.yml' })` |
| `isEnabled('flag')`            | `ff.isEnabled('flag', context)`           |
| `getVariant('flag')`           | `ff.getVariant('flag', context)`          |
| Strategies (gradual rollout)   | `rollout:` field                          |
| Strategies (user IDs)          | `rules:` with `$in` operator              |
| Unleash server                 | No server needed                          |

### Key Differences

1. **No server to run** — Unleash requires a server; TinyFlag doesn't
2. **Strategies → Rules** — Unleash strategies map to TinyFlag targeting rules
3. **Activation strategies** → Use `enabled: true/false` + rules

### Migration Steps

1. List all feature toggles in Unleash
2. Map each toggle's strategies to TinyFlag rules
3. Create `flags.yml` with the equivalent configuration
4. Replace Unleash client calls with TinyFlag
5. Decommission the Unleash server

### Configuration Examples

**Gradual rollout strategy:**

```yaml
# Unleash: gradualRollout strategy at 25%
# TinyFlag equivalent:
flags:
  new-dashboard:
    enabled: true
    rollout: 25
```

**UserID-based strategy:**

```yaml
# Unleash: userWithId strategy targeting specific users
# TinyFlag equivalent:
flags:
  beta-feature:
    enabled: false
    rules:
      - conditions:
          userId: user-42
        enabled: true
      - conditions:
          userId: user-99
        enabled: true
```

**Gradual rollout with variant:**

```yaml
# Unleash: gradualRollout with variants (A/B)
# TinyFlag equivalent:
flags:
  search-experiment:
    enabled: true
    rollout: 50
    variants:
      - name: control
        weight: 50
      - name: new-algorithm
        weight: 50
```
