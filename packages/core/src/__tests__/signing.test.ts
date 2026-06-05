import { describe, it, expect, afterAll } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import { signContent, verifyContent, generateKeyPair, signFile, verifyFile } from '../signing.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const tmpDir = tmpdir();

function makeKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}

const cleanup: string[] = [];
afterAll(() => {
  for (const f of cleanup) {
    try { if (existsSync(f)) unlinkSync(f); } catch {}
  }
});

describe('signing', () => {
  const { privateKey, publicKey } = makeKeyPair();
  const content = 'version: 1\nflags:\n  test:\n    enabled: true\n';

  it('signs and verifies content', () => {
    const sig = signContent(content, privateKey);
    expect(sig).toBeTruthy();
    const result = verifyContent(content, sig, [publicKey]);
    expect(result.valid).toBe(true);
    expect(result.keyIndex).toBe(0);
  });

  it('rejects tampered content', () => {
    const sig = signContent(content, privateKey);
    const result = verifyContent(content + 'tampered', sig, [publicKey]);
    expect(result.valid).toBe(false);
  });

  it('supports key rotation with multiple public keys', () => {
    const { publicKey: otherPub } = makeKeyPair();
    const sig = signContent(content, privateKey);
    const result = verifyContent(content, sig, [otherPub, publicKey]);
    expect(result.valid).toBe(true);
    expect(result.keyIndex).toBe(1);
  });

  it('generates key pair files', () => {
    const privPath = join(tmpDir, 'test-tinyflag.key');
    const pubPath = join(tmpDir, 'test-tinyflag.pub');
    cleanup.push(privPath, pubPath);
    generateKeyPair(privPath, pubPath);
    expect(existsSync(privPath)).toBe(true);
    expect(existsSync(pubPath)).toBe(true);
  });

  it('signs and verifies files', () => {
    const flagPath = join(tmpDir, 'test-flags.yml');
    const privPath = join(tmpDir, 'test-sign.key');
    const pubPath = join(tmpDir, 'test-sign.pub');
    const sigPath = flagPath + '.sig';
    cleanup.push(flagPath, privPath, pubPath, sigPath);

    writeFileSync(flagPath, content, 'utf-8');
    generateKeyPair(privPath, pubPath);

    const result = signFile(flagPath, privPath);
    expect(result).toBe(sigPath);
    expect(existsSync(sigPath)).toBe(true);

    const verification = verifyFile(flagPath, [pubPath], 'strict');
    expect(verification.valid).toBe(true);
  });

  it('lenient mode warns instead of throwing', () => {
    const flagPath = join(tmpDir, 'test-nosig.yml');
    cleanup.push(flagPath);
    writeFileSync(flagPath, content, 'utf-8');

    const result = verifyFile(flagPath, ['nonexistent.pub'], 'lenient');
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('strict mode throws for missing signature', () => {
    const flagPath = join(tmpDir, 'test-strict.yml');
    cleanup.push(flagPath);
    writeFileSync(flagPath, content, 'utf-8');

    expect(() => verifyFile(flagPath, ['nonexistent.pub'], 'strict')).toThrow();
  });

  it('verifyContent with invalid/corrupt public key silently tries next key', () => {
    const sig = signContent(content, privateKey);
    const corruptKey = '-----BEGIN PUBLIC KEY-----\nINVALID\n-----END PUBLIC KEY-----';
    const result = verifyContent(content, sig, [corruptKey, publicKey]);
    expect(result.valid).toBe(true);
    expect(result.keyIndex).toBe(1);
  });

  it('verifyContent returns invalid when all keys fail', () => {
    const sig = signContent(content, privateKey);
    const corruptKey = '-----BEGIN PUBLIC KEY-----\nINVALID\n-----END PUBLIC KEY-----';
    const result = verifyContent(content, sig, [corruptKey]);
    expect(result.valid).toBe(false);
    expect(result.keyIndex).toBe(-1);
  });

  it('verifyFile in strict mode with valid .sig but wrong key throws', () => {
    const { privateKey: otherPriv, publicKey: otherPub } = makeKeyPair();
    const flagPath = join(tmpDir, 'test-wrongkey.yml');
    const privPath = join(tmpDir, 'test-wrongkey.key');
    const pubPath = join(tmpDir, 'test-wrongkey-other.pub');
    const sigPath = flagPath + '.sig';
    cleanup.push(flagPath, privPath, pubPath, sigPath);

    writeFileSync(flagPath, content, 'utf-8');
    writeFileSync(privPath, privateKey, 'utf-8');
    writeFileSync(pubPath, otherPub, 'utf-8');

    signFile(flagPath, privPath);

    expect(() => verifyFile(flagPath, [pubPath], 'strict')).toThrow(
      'Signature verification failed',
    );
  });

  it('verifyFile in lenient mode with wrong key returns valid:false with warnings', () => {
    const { publicKey: otherPub } = makeKeyPair();
    const flagPath = join(tmpDir, 'test-wrongkey-lenient.yml');
    const privPath = join(tmpDir, 'test-wrongkey-lenient.key');
    const pubPath = join(tmpDir, 'test-wrongkey-lenient.pub');
    const sigPath = flagPath + '.sig';
    cleanup.push(flagPath, privPath, pubPath, sigPath);

    writeFileSync(flagPath, content, 'utf-8');
    writeFileSync(privPath, privateKey, 'utf-8');
    writeFileSync(pubPath, otherPub, 'utf-8');

    signFile(flagPath, privPath);

    const result = verifyFile(flagPath, [pubPath], 'lenient');
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Signature verification failed');
  });

  it('verifyContent with multiple keys where first throws but second verifies', () => {
    const { publicKey: otherPub } = makeKeyPair();
    const sig = signContent(content, privateKey);
    // otherPub is valid but won't match → continues to publicKey which matches
    const result = verifyContent(content, sig, [otherPub, publicKey]);
    expect(result.valid).toBe(true);
    expect(result.keyIndex).toBe(1);
  });
});
