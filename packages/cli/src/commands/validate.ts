import { watch, existsSync } from 'fs';
import { loadAndValidate, loadAndValidateMulti } from './utils.js';

export function handleValidate(
  args: string[],
  jsonMode: boolean,
  watchMode: boolean,
  strictMode: boolean,
): void {
  // Parse --env options for environment-aware validation
  const envNames: string[] = [];
  const remainingArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && i + 1 < args.length) {
      envNames.push(args[i + 1]);
      i++;
    } else if (!args[i].startsWith('-')) {
      remainingArgs.push(args[i]);
    }
  }

  const filePaths = remainingArgs;
  if (filePaths.length === 0) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag validate <file...> [--env <name>] [--watch] [--strict]');
    process.exit(1);
  }

  // If --env is specified, auto-detect environment overlay files
  const allFiles = [...filePaths];
  if (envNames.length > 0) {
    const baseFile = filePaths[0];
    const ext = baseFile.endsWith('.json') ? '.json' : '.yml';
    const baseName = baseFile.replace(/\.(yml|yaml|json)$/, '');
    for (const env of envNames) {
      const envFile = `${baseName}.${env}${ext}`;
      if (existsSync(envFile)) {
        allFiles.push(envFile);
      } else {
        console.warn(`⚠️  Environment overlay not found: ${envFile}`);
      }
    }
  }

  const config = loadAndValidateMulti(allFiles, strictMode);

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          command: 'validate',
          files: allFiles,
          environments: envNames.length > 0 ? envNames : undefined,
          valid: true,
          flagCount: Object.keys(config.flags).length,
          flags: Object.keys(config.flags).sort(),
        },
        null,
        2,
      ),
    );
    if (!watchMode) return;
  }

  console.log(`✅ ${allFiles.join(' + ')} is valid (${Object.keys(config.flags).length} flags)`);

  if (watchMode) {
    const watchFile = allFiles[allFiles.length - 1];
    console.log(`👀 Watching ${watchFile} for changes…`);
    let debounce: ReturnType<typeof setTimeout> | undefined;
    watch(watchFile, (eventType) => {
      if (eventType !== 'change' && eventType !== 'rename') return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        try {
          loadAndValidateMulti(allFiles, strictMode);
          console.log(`✅ ${allFiles.join(' + ')} is valid`);
        } catch (error) {
          console.error((error as Error).message);
        }
      }, 100);
    });
  }
}
