import { writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { generateTypes } from '../generate.js';
import { loadAndValidate } from './utils.js';

export function handleGenerate(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag generate <file> [-o <output>]');
    process.exit(1);
  }

  const outputIdx = args.indexOf('-o');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const config = loadAndValidate(filePath);

  if (jsonMode) {
    console.log(
      JSON.stringify({ command: 'generate', file: filePath, flags: config.flags }, null, 2),
    );
    return;
  }

  const types = generateTypes(config);

  if (outputPath) {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      console.error(`Error: Directory "${dir}" does not exist. Create it first.`);
      process.exit(1);
    }
    writeFileSync(outputPath, types, 'utf-8');
    console.log(`✅ Types written to ${outputPath}`);
  } else {
    process.stdout.write(types);
  }
}
