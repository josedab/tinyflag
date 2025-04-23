import { generateKeyPair } from 'tinyflag';

export function handleKeygen(args: string[]): void {
  const outputIdx = args.indexOf('-o');
  const prefix = outputIdx !== -1 ? args[outputIdx + 1] : 'tinyflag';

  const privateKeyPath = `${prefix}.key`;
  const publicKeyPath = `${prefix}.pub`;

  try {
    generateKeyPair(privateKeyPath, publicKeyPath);
    console.log(`✅ Key pair generated:`);
    console.log(`   Private key: ${privateKeyPath}`);
    console.log(`   Public key:  ${publicKeyPath}`);
  } catch (error) {
    console.error(`❌ Key generation failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
