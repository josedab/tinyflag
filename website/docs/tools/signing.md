---
sidebar_position: 5
title: Flag Signing
description: Cryptographically sign flag files to ensure integrity and prevent tampering.
---

# Flag Signing

TinyFlag provides Ed25519 cryptographic signing to verify that flag files haven't been tampered with. This is critical for production deployments where flag files are fetched from remote URLs.

## Generate a Key Pair

```typescript
import { generateKeyPair } from 'tinyflag';

generateKeyPair('./keys/tinyflag.key', './keys/tinyflag.pub');
```

This creates an Ed25519 private/public key pair using Node.js built-in `crypto`. No extra dependencies.

## Sign a Flag File

```typescript
import { signFile } from 'tinyflag';

// Creates flags.yml.sig alongside the flag file
const sigPath = signFile('./flags.yml', './keys/tinyflag.key');
console.log(`Signature written to ${sigPath}`);
```

Or sign content directly:

```typescript
import { signContent } from 'tinyflag';

const signature = signContent(flagFileContent, privateKeyPem);
// Returns base64-encoded signature
```

## Verify a Flag File

```typescript
import { verifyFile } from 'tinyflag';

// Strict mode: throws if signature is missing or invalid
const result = verifyFile('./flags.yml', ['./keys/tinyflag.pub']);
console.log(result.valid); // true
console.log(result.keyIndex); // 0 (which key matched)

// Lenient mode: returns warnings instead of throwing
const lenient = verifyFile('./flags.yml', ['./keys/tinyflag.pub'], 'lenient');
console.log(lenient.warnings); // ['No signature file found for ./flags.yml']
```

## Key Rotation

Pass multiple public keys to support key rotation. The SDK tries each key in order:

```typescript
const result = verifyContent(content, signatureBase64, [currentPublicKey, previousPublicKey]);
// result.keyIndex tells you which key matched
```

## CI/CD Integration

Sign flag files in your deployment pipeline:

```bash
# In your CI/CD pipeline
npx tinyflag sign ./flags.yml --key ./keys/tinyflag.key

# In your application startup
npx tinyflag verify ./flags.yml --pubkey ./keys/tinyflag.pub
```
