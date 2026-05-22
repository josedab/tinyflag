import { createPrivateKey, createPublicKey, sign, verify, generateKeyPairSync } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Generate an Ed25519 key pair and write to disk.
 * Uses Node.js built-in crypto — zero new dependencies.
 */
export function generateKeyPair(privateKeyPath: string, publicKeyPath: string): void {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  writeFileSync(privateKeyPath, privateKey, 'utf-8');
  writeFileSync(publicKeyPath, publicKey, 'utf-8');
}

/**
 * Sign a flag file's content and return the base64 signature.
 */
export function signContent(content: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(content, 'utf-8'), key);
  return signature.toString('base64');
}

/**
 * Verify a flag file's content against a base64 signature.
 * Supports multiple trusted public keys for key rotation.
 */
export function verifyContent(
  content: string,
  signatureBase64: string,
  publicKeyPems: string[],
): { valid: boolean; keyIndex: number } {
  const sigBuffer = Buffer.from(signatureBase64, 'base64');
  const data = Buffer.from(content, 'utf-8');

  for (let i = 0; i < publicKeyPems.length; i++) {
    try {
      const key = createPublicKey(publicKeyPems[i]);
      if (verify(null, data, key, sigBuffer)) {
        return { valid: true, keyIndex: i };
      }
    } catch {
      // Try next key
    }
  }

  return { valid: false, keyIndex: -1 };
}

/**
 * Sign a flag file and write the detached .sig file.
 */
export function signFile(filePath: string, privateKeyPath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  const privateKeyPem = readFileSync(privateKeyPath, 'utf-8');
  const signature = signContent(content, privateKeyPem);
  const sigPath = filePath + '.sig';
  writeFileSync(sigPath, signature, 'utf-8');
  return sigPath;
}

/**
 * Verify a flag file using its .sig file and trusted public keys.
 */
export function verifyFile(
  filePath: string,
  publicKeyPaths: string[],
  mode: 'strict' | 'lenient' = 'strict',
): { valid: boolean; keyIndex: number; warnings: string[] } {
  const warnings: string[] = [];
  const content = readFileSync(filePath, 'utf-8');

  let signature: string;
  try {
    signature = readFileSync(filePath + '.sig', 'utf-8').trim();
  } catch {
    if (mode === 'lenient') {
      warnings.push(`No signature file found for ${filePath}`);
      return { valid: false, keyIndex: -1, warnings };
    }
    throw new Error(`Signature file not found: ${filePath}.sig`);
  }

  const publicKeys = publicKeyPaths.map((p) => readFileSync(p, 'utf-8'));
  const result = verifyContent(content, signature, publicKeys);

  if (!result.valid) {
    if (mode === 'strict') {
      throw new Error(`Signature verification failed for ${filePath}`);
    }
    warnings.push(`Signature verification failed for ${filePath}`);
  }

  return { ...result, warnings };
}
