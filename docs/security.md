# Security Model

TinyFlag is designed with a minimal attack surface — there's no server, no database, and no network service to secure.

## Flag File Trust Model

The SDK **trusts the flag file**. If you control the file, you control the flags. This means:

- Flag files committed to Git are protected by Git branch permissions
- URL sources should use HTTPS — the SDK warns if HTTP is used
- Custom `headers` (e.g., `Authorization`) can protect URL sources

## No Secrets in Flag Files

⚠️ **Never store secrets in flag files.** Flag files are designed to be committed to Git — they are visible to anyone with repo access.

Bad:
```yaml
flags:
  api-v2:
    enabled: true
    rules:
      - conditions:
          api-key: sk_live_12345  # ❌ Secret in flag file!
```

Good:
```yaml
flags:
  api-v2:
    enabled: true
    rules:
      - conditions:
          plan: enterprise  # ✅ Non-sensitive attribute
```

## Exposure Event Privacy

The `exposure` event contains `userId`. The SDK:
- **Does NOT store** user data
- **Does NOT transmit** data to any external service
- **Only emits** events to consumer-registered listeners

You are responsible for handling PII in exposure events according to your privacy policy (GDPR, CCPA, etc.).

## URL Source Authentication

For authenticated flag sources:

```typescript
const ff = new TinyFlag({
  source: 'https://api.example.com/flags.json',
  headers: { 'Authorization': 'Bearer <token>' },
});
```

Header values are **never logged** or included in error messages.

## Input Validation

- Flag names are validated against a strict pattern (kebab-case, 1-128 chars)
- Rollout values are validated to 0-100 range
- Variant weights are validated to be non-negative
- Schema validation runs at initialization time, not at evaluation time
- Evaluation methods (`isEnabled`, `getVariant`) never throw — they return safe defaults
