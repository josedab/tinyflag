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
});
