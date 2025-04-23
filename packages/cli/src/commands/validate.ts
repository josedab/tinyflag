import { watch } from 'fs';
import { loadAndValidate, loadAndValidateMulti } from './utils.js';

export function handleValidate(
  args: string[],
  jsonMode: boolean,
  watchMode: boolean,
  strictMode: boolean,
): void {
  const filePaths = args.filter((a) => !a.startsWith('-'));
  if (filePaths.length === 0) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag validate <file...> [--watch] [--strict]');
    process.exit(1);
  }

  const config = loadAndValidateMulti(filePaths, strictMode);

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          command: 'validate',
          files: filePaths,
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

  console.log(`✅ ${filePaths.join(' + ')} is valid (${Object.keys(config.flags).length} flags)`);

  if (watchMode) {
    const watchFile = filePaths[filePaths.length - 1];
    console.log(`👀 Watching ${watchFile} for changes…`);
    let debounce: ReturnType<typeof setTimeout> | undefined;
    watch(watchFile, (eventType) => {
      if (eventType !== 'change' && eventType !== 'rename') return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        try {
          loadAndValidateMulti(filePaths, strictMode);
          console.log(`✅ ${filePaths.join(' + ')} is valid`);
        } catch (error) {
          console.error((error as Error).message);
        }
      }, 100);
    });
  }
}
