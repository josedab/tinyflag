import { verifyFile } from 'tinyflag';

export function handleVerify(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag verify <file> --pub <key-path...> [--lenient]');
    process.exit(1);
  }

  const lenient = args.includes('--lenient');
  const pubIdx = args.indexOf('--pub');
  if (pubIdx === -1) {
    console.error('Error: Missing --pub option\n');
    console.log('Usage: tinyflag verify <file> --pub <key-path...>');
    process.exit(1);
  }

  const pubKeys: string[] = [];
  for (let i = pubIdx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    pubKeys.push(args[i]);
  }

  if (pubKeys.length === 0) {
    console.error('Error: No public key paths provided');
    process.exit(1);
  }

  try {
    const result = verifyFile(filePath, pubKeys, lenient ? 'lenient' : 'strict');
    if (jsonMode) {
      console.log(JSON.stringify({ command: 'verify', file: filePath, ...result }, null, 2));
      return;
    }

    if (result.valid) {
      console.log(`✅ Signature valid (key index: ${result.keyIndex})`);
    } else {
      for (const w of result.warnings) {
        console.warn(`⚠️  ${w}`);
      }
      if (!lenient) process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Verification failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
