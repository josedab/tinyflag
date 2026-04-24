import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { parseYaml, parseFlagConfig, diffEnvConfigs, formatEnvDiff } from 'tinyflag';
import { diffConfigs, formatChanges } from '../diff.js';
import { loadAndValidateMulti } from './utils.js';

export function handleDiff(args: string[], jsonMode: boolean): void {
  // Handle environment diff mode: tinyflag diff --env staging --env production --file flags.yml
  const envNames: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && i + 1 < args.length) {
      envNames.push(args[i + 1]);
      i++;
    }
  }

  if (envNames.length >= 2) {
    handleEnvDiff(args, envNames, jsonMode);
    return;
  }

  const refSpec = args[0];
  if (!refSpec || !refSpec.includes('..')) {
    console.error('Error: Expected ref format: <ref1>..<ref2> (e.g., main..HEAD)\n');
    console.log('Usage: tinyflag diff <ref1>..<ref2> [--file <path>]');
    console.log('       tinyflag diff --env staging --env production [--file <path>]');
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

function handleEnvDiff(args: string[], envNames: string[], jsonMode: boolean): void {
  const fileIdx = args.indexOf('--file');
  const baseFile = fileIdx !== -1 ? args[fileIdx + 1] : 'flags.yml';
  const baseName = baseFile.replace(/\.(yml|yaml|json)$/, '');
  const ext = baseFile.endsWith('.json') ? '.json' : '.yml';

  const configs: Array<{ name: string; config: ReturnType<typeof loadAndValidateMulti> }> = [];

  for (const env of envNames) {
    const envFile = `${baseName}.${env}${ext}`;
    const files = [baseFile];
    if (existsSync(envFile)) {
      files.push(envFile);
    }
    const config = loadAndValidateMulti(files);
    configs.push({ name: env, config });
  }

  if (configs.length < 2) {
    console.error('Error: Need at least 2 environments to diff');
    process.exit(1);
  }

  const diffs = diffEnvConfigs(
    configs[0].name,
    configs[0].config,
    configs[1].name,
    configs[1].config,
  );

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'env-diff', environments: envNames, diffs }, null, 2));
    return;
  }

  console.log(formatEnvDiff(diffs));
}
