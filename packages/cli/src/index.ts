import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import { generateTypes } from './generate.js';
import { diffConfigs, formatChanges } from './diff.js';

const USAGE = `
Usage: tinyflag <command> [options]

Commands:
  generate <file> [-o <output>]   Generate TypeScript types from a flags file
  validate <file>                 Validate a flags file schema
  diff <ref1>..<ref2> [--file f]  Show flag changes between git refs
  help                            Show this help message

Options:
  --json                          Output structured JSON instead of human-readable text

Examples:
  npx tinyflag generate ./flags.yml
  npx tinyflag generate ./flags.yml -o ./src/flags.d.ts
  npx tinyflag validate ./flags.yml
  npx tinyflag validate ./flags.yml --json
  npx tinyflag diff main..HEAD
  npx tinyflag diff main..HEAD --file config/flags.yml
`.trim();

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    console.log(USAGE);
    process.exit(0);
  }

  const jsonMode = args.includes('--json');
  const filteredArgs = args.filter((a) => a !== '--json');

  const command = filteredArgs[0];

  switch (command) {
    case 'generate':
      handleGenerate(filteredArgs.slice(1), jsonMode);
      break;
    case 'validate':
      handleValidate(filteredArgs.slice(1), jsonMode);
      break;
    case 'diff':
      handleDiff(filteredArgs.slice(1), jsonMode);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(USAGE);
      process.exit(1);
  }
}

function handleGenerate(args: string[], jsonMode: boolean): void {
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
    console.log(JSON.stringify({ command: 'generate', file: filePath, flags: config.flags }, null, 2));
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

function handleValidate(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag validate <file>');
    process.exit(1);
  }

  const config = loadAndValidate(filePath);

  if (jsonMode) {
    console.log(JSON.stringify({
      command: 'validate',
      file: filePath,
      valid: true,
      flagCount: Object.keys(config.flags).length,
      flags: Object.keys(config.flags).sort(),
    }, null, 2));
    return;
  }

  console.log(`✅ ${filePath} is valid`);
}

function loadAndValidate(filePath: string): ReturnType<typeof parseFlagConfig>['config'] {
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

  const { config, errors } = parseFlagConfig(raw);
  if (errors.length > 0) {
    console.error(`❌ ${filePath} validation failed:`);
    for (const err of errors) {
      console.error(`  - ${err.path}: ${err.message}`);
    }
    process.exit(1);
  }

  return config;
}

function handleDiff(args: string[], jsonMode: boolean): void {
  const refSpec = args[0];
  if (!refSpec || !refSpec.includes('..')) {
    console.error('Error: Expected ref format: <ref1>..<ref2> (e.g., main..HEAD)\n');
    console.log('Usage: tinyflag diff <ref1>..<ref2> [--file <path>]');
    process.exit(1);
  }

  const fileIdx = args.indexOf('--file');
  const flagsFile = fileIdx !== -1 ? args[fileIdx + 1] : 'flags.yml';
  const [ref1, ref2] = refSpec.split('..');

  let beforeContent: string;
  let afterContent: string;

  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  } catch {
    console.error('Error: Not inside a git repository. The diff command requires git.');
    process.exit(1);
  }

  try {
    beforeContent = execSync(`git show ${ref1}:${flagsFile}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    console.error(
      `Error: Could not read ${flagsFile} from ref "${ref1}". Check that the ref and file path exist.`,
    );
    process.exit(1);
  }

  try {
    afterContent = execSync(`git show ${ref2}:${flagsFile}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // If ref2 is HEAD, try reading the working copy
    if (ref2 === 'HEAD') {
      try {
        afterContent = readFileSync(flagsFile, 'utf-8');
      } catch {
        console.error(
          `Error: Could not read ${flagsFile} from ref "${ref2}" or working directory.`,
        );
        process.exit(1);
      }
    } else {
      console.error(`Error: Could not read ${flagsFile} from ref "${ref2}".`);
      process.exit(1);
    }
  }

  const parseFlags = (content: string, label: string) => {
    const raw = flagsFile.endsWith('.json') ? JSON.parse(content) : parseYaml(content);
    const { config, errors } = parseFlagConfig(raw);
    if (errors.length > 0) {
      console.error(`❌ Invalid flags in ${label}:`);
      for (const err of errors) {
        console.error(`  - ${err.path}: ${err.message}`);
      }
      process.exit(1);
    }
    return config;
  };

  const before = parseFlags(beforeContent!, ref1);
  const after = parseFlags(afterContent!, ref2);
  const changes = diffConfigs(before, after);

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'diff', from: ref1, to: ref2, file: flagsFile, changes }, null, 2));
    return;
  }

  console.log(formatChanges(changes, ref1, ref2));
}

main();
