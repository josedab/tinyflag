import { pullFlags, pushFlags } from 'tinyflag';

export function handlePull(args: string[], jsonMode: boolean): void {
  const url = args[0];
  if (!url) {
    console.error('Error: Missing URL\n');
    console.log('Usage: tinyflag pull <url> -o <output> [--force]');
    process.exit(1);
  }

  const outputIdx = args.indexOf('-o');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : 'flags.yml';
  const force = args.includes('--force');

  pullFlags(url, outputPath, { force })
    .then((result) => {
      if (jsonMode) {
        console.log(
          JSON.stringify({ command: 'pull', url, output: outputPath, ...result }, null, 2),
        );
      } else if (result.status === 'not-modified') {
        console.log(`✅ ${outputPath} is up to date`);
      } else {
        console.log(`✅ ${result.status === 'created' ? 'Created' : 'Updated'} ${outputPath}`);
      }
    })
    .catch((error) => {
      console.error(`❌ Pull failed: ${(error as Error).message}`);
      process.exit(1);
    });
}

export function handlePush(args: string[], jsonMode: boolean): void {
  const url = args[0];
  if (!url) {
    console.error('Error: Missing URL\n');
    console.log('Usage: tinyflag push <url> --file <file> [--force]');
    process.exit(1);
  }

  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1 ? args[fileIdx + 1] : 'flags.yml';
  const force = args.includes('--force');

  pushFlags(url, filePath, { force })
    .then((result) => {
      if (jsonMode) {
        console.log(JSON.stringify({ command: 'push', url, file: filePath, ...result }, null, 2));
      } else if (result.status === 'conflict') {
        console.error('❌ Push conflict: remote has been modified. Pull first or use --force.');
        process.exit(1);
      } else {
        console.log(`✅ Pushed ${filePath} to ${url}`);
      }
    })
    .catch((error) => {
      console.error(`❌ Push failed: ${(error as Error).message}`);
      process.exit(1);
    });
}
