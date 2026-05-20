import { readFileSync, writeFileSync, existsSync, watch } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { parseYaml, parseFlagConfig, mergeFlagConfigs, detectCircularDependencies, buildDependencyTree } from 'tinyflag';
import type { FlagConfig } from 'tinyflag';
import { generateTypes } from './generate.js';
import { diffConfigs, formatChanges } from './diff.js';
import { scanFlagUsage, generateStaleReport, formatStaleReport } from './stale.js';

const USAGE = `
Usage: tinyflag <command> [options]

Commands:
  generate <file> [-o <output>]   Generate TypeScript types from a flags file
  validate <file...>              Validate one or more flags files (merged in order)
  validate <file> --watch         Validate and re-validate on file changes
  validate <file> --strict        Validate with strict mode (reject unknown fields)
  diff <ref1>..<ref2> [--file f]  Show flag changes between git refs
  deps <file...>                  Show flag dependency graph
  stale <dir> --flags <file>      Detect stale/unused flags
  help                            Show this help message

Options:
  --json                          Output structured JSON instead of human-readable text

Examples:
  npx tinyflag generate ./flags.yml
  npx tinyflag generate ./flags.yml -o ./src/flags.d.ts
  npx tinyflag validate ./flags.yml
  npx tinyflag validate ./base.yml ./prod.yml
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
  const watchMode = args.includes('--watch');
  const strictMode = args.includes('--strict');
  const filteredArgs = args.filter((a) => a !== '--json' && a !== '--watch' && a !== '--strict');

  const command = filteredArgs[0];

  switch (command) {
    case 'generate':
      handleGenerate(filteredArgs.slice(1), jsonMode);
      break;
    case 'validate':
      handleValidate(filteredArgs.slice(1), jsonMode, watchMode, strictMode);
      break;
    case 'diff':
      handleDiff(filteredArgs.slice(1), jsonMode);
      break;
    case 'deps':
      handleDeps(filteredArgs.slice(1), jsonMode);
      break;
    case 'stale':
      handleStale(filteredArgs.slice(1), jsonMode);
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

function handleValidate(args: string[], jsonMode: boolean, watchMode: boolean, strictMode: boolean): void {
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

function loadAndValidate(filePath: string, strict: boolean = false): ReturnType<typeof parseFlagConfig>['config'] {
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
function loadAndValidateMulti(filePaths: string[], strict: boolean = false): FlagConfig {
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

  const SAFE_REF_PATTERN = /^[a-zA-Z0-9._\-\/~^]+$/;
  if (!SAFE_REF_PATTERN.test(ref1) || !SAFE_REF_PATTERN.test(ref2)) {
    console.error('Error: Invalid git ref. Refs must match /^[a-zA-Z0-9._\\-\\/~^]+$/.');
    process.exit(1);
  }

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
    console.log(
      JSON.stringify({ command: 'diff', from: ref1, to: ref2, file: flagsFile, changes }, null, 2),
    );
    return;
  }

  console.log(formatChanges(changes, ref1, ref2));
}

function handleStale(args: string[], jsonMode: boolean): void {
  const ciMode = args.includes('--ci');
  const filteredArgs = args.filter((a) => a !== '--ci');

  // Parse --flags option
  const flagsIdx = filteredArgs.indexOf('--flags');
  const flagsFile = flagsIdx !== -1 ? filteredArgs[flagsIdx + 1] : undefined;
  const scanDir = filteredArgs.find((a) => !a.startsWith('-') && a !== flagsFile) || '.';

  if (!flagsFile) {
    console.error('Error: Missing --flags option\n');
    console.log('Usage: tinyflag stale [dir] --flags <file> [--ci] [--json]');
    process.exit(1);
  }

  const config = loadAndValidate(flagsFile);
  const usages = scanFlagUsage(scanDir);
  const report = generateStaleReport(config.flags, usages);

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'stale', ...report }, null, 2));
  } else {
    console.log(formatStaleReport(report));
  }

  if (ciMode) {
    const totalIssues = report.unusedFlags.length + report.undefinedRefs.length + report.zeroRolloutFlags.length;
    if (totalIssues > 0) {
      process.exit(1);
    }
  }
}

function handleDeps(args: string[], jsonMode: boolean): void {
  const filePaths = args.filter((a) => !a.startsWith('-'));
  if (filePaths.length === 0) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag deps <file...>');
    process.exit(1);
  }

  const config = loadAndValidateMulti(filePaths, false);

  // Detect circular dependencies
  const cycles = detectCircularDependencies(config.flags);
  if (cycles.length > 0) {
    console.error('⚠️  Circular dependencies detected:');
    for (const cycle of cycles) {
      console.error(`  ${cycle.join(' → ')}`);
    }
  }

  // Find flags with dependencies
  const flagsWithDeps = Object.entries(config.flags).filter(
    ([, f]) => f.requires && f.requires.length > 0,
  );

  if (flagsWithDeps.length === 0) {
    if (jsonMode) {
      console.log(JSON.stringify({ command: 'deps', dependencies: [], cycles }, null, 2));
    } else {
      console.log('No flag dependencies found.');
    }
    return;
  }

  if (jsonMode) {
    const deps = flagsWithDeps.map(([name, f]) => ({
      flag: name,
      requires: f.requires,
    }));
    console.log(JSON.stringify({ command: 'deps', dependencies: deps, cycles }, null, 2));
    return;
  }

  console.log('🔗 Flag dependency graph:\n');
  for (const [name] of flagsWithDeps) {
    console.log(buildDependencyTree(name, config.flags));
    console.log();
  }
}

main();
