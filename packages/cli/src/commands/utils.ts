import { readFileSync } from 'fs';
import { parseYaml, parseFlagConfig, mergeFlagConfigs } from 'tinyflag';
import type { FlagConfig } from 'tinyflag';

export function loadAndValidate(
  filePath: string,
  strict: boolean = false,
): ReturnType<typeof parseFlagConfig>['config'] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      console.error(`Error: File not found: "${filePath}"`);
    } else if (err.code === 'EACCES') {
      console.error(`Error: Permission denied: "${filePath}"`);
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }

  let raw: unknown;
  if (filePath.endsWith('.json')) {
    try {
      raw = JSON.parse(content);
    } catch (error) {
      console.error(`❌ Failed to parse JSON: ${(error as Error).message}`);
      process.exit(1);
    }
  } else {
    try {
      raw = parseYaml(content);
    } catch (error) {
      console.error(`❌ Failed to parse YAML: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  const { config, errors } = parseFlagConfig(raw, strict);
  if (errors.length > 0) {
    console.error(`❌ ${filePath} validation failed:`);
    for (const err of errors) {
      console.error(`  - ${err.path}: ${err.message}`);
    }
    process.exit(1);
  }

  return config;
}

/** Load and merge multiple flag files, returning the merged config. */
export function loadAndValidateMulti(filePaths: string[], strict: boolean = false): FlagConfig {
  if (filePaths.length === 1) {
    return loadAndValidate(filePaths[0], strict);
  }

  const configs: FlagConfig[] = filePaths.map((fp) => loadAndValidate(fp, strict));
  const { config, warnings } = mergeFlagConfigs(configs);

  for (const w of warnings) {
    console.warn(`⚠️  Merge conflict in "${w.flag}": ${w.message}`);
  }

  return config;
}
