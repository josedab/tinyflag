import { signFile } from 'tinyflag';

export function handleSign(args: string[]): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag sign <file> --key <private-key-path>');
    process.exit(1);
  }

  const keyIdx = args.indexOf('--key');
  const keyPath = keyIdx !== -1 ? args[keyIdx + 1] : undefined;
  if (!keyPath) {
    console.error('Error: Missing --key option\n');
    console.log('Usage: tinyflag sign <file> --key <private-key-path>');
    process.exit(1);
  }

  try {
    const sigPath = signFile(filePath, keyPath);
    console.log(`✅ Signature written to ${sigPath}`);
  } catch (error) {
    console.error(`❌ Signing failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
