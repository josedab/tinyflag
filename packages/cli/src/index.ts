import { readFileSync, writeFileSync, existsSync, watch } from 'fs';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { parseYaml, parseFlagConfig, mergeFlagConfigs, detectCircularDependencies, buildDependencyTree, generateKeyPair, signFile, verifyFile, pullFlags, pushFlags, threeWayMerge, evaluateFlag, evaluateWithPersona, setEvaluationContext, parseReplayLog, generateReplayHtmlReport, listTenants, diffTenantFlags, formatTenantList, validateTenantIsolation } from 'tinyflag';
import type { FlagConfig, FlagDefinition, UserContext, ReplayDiff, MultiTenantFlagConfig } from 'tinyflag';
import { generateTypes } from './generate.js';
import { diffConfigs, formatChanges } from './diff.js';
import { scanFlagUsage, generateStaleReport, formatStaleReport } from './stale.js';
import { scanForFlagPatterns, formatSuggestionsAsYaml, formatSuggestionsReport } from './suggest.js';
import { checkConsistency, formatConsistencyReport } from './consistency.js';
import { lintConfig, loadLintConfig, formatLintResults, formatLintSarif } from './lint.js';
import { loadFlagOwners, resolveOwnership, checkApprovals, formatApprovalResult, formatOwnershipReport } from './governance.js';
import { analyzeImpact, formatImpactReport } from './impact.js';
import { parseTestSpec, runTestSpec, runTestSpecs, formatTestResults, formatJUnitXml } from './testing.js';
import { CanaryController, createPrometheusAdapter, createDatadogAdapter, formatCanaryState } from './canary.js';
import { parseFlagCommand, generateOverlayFile, applyOverlay, writeOverlay, loadOverlay, cleanupExpiredOverlays, listActiveOverlays } from './ephemeral.js';

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
  sign <file> --key <private-key> Sign a flag file with Ed25519
  verify <file> --pub <key...>    Verify a signed flag file
  keygen [-o <prefix>]            Generate Ed25519 key pair
  audit <file>                    Show flag change history from git log
  pull <url> -o <output>          Pull flag config from remote URL
  push <url> --file <file>        Push flag config to remote URL
  inline <file> [--format esm]    Inline flags as JS module for edge runtimes
  suggest <dir>                   Scan code for feature flag patterns and suggest definitions
  eval <flag> --file <f>          Evaluate a flag (use --persona <name> or --context key=val)
  lifecycle <file>                Show lifecycle state distribution of flags
  consistency-check <file>        Check evaluation consistency across SDKs
  lint <file>                     Lint flag file for issues (--format json/sarif)
  owners <file>                   Show flag ownership (--owners <owners-file>)
  owners check <file>             Check PR approvals (--approvers user1,user2)
  tenant list <file>              List tenants in config
  tenant diff <file>              Compare flags between tenants (--a tenant1 --b tenant2)
  impact <flag> --dir <dir>       Analyze flag blast radius (--flags <file>)
  test <specs-dir> --flags <f>    Run declarative flag test specs (--junit <out>)
  canary <flag>                   Start canary rollout (--adapter prometheus --url <url>)
  overlay list <dir>              List active ephemeral overlays
  overlay apply <file> --dir <d>  Apply flag overlay to base config
  overlay cleanup <dir>           Remove expired overlays
  replay <log> --flags <file>     Replay evaluations (--at timestamp, --html report.html)
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
  npx tinyflag keygen -o ./keys/tinyflag
  npx tinyflag sign ./flags.yml --key ./keys/tinyflag.key
  npx tinyflag verify ./flags.yml --pub ./keys/tinyflag.pub
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
    case 'sign':
      handleSign(filteredArgs.slice(1));
      break;
    case 'verify':
      handleVerify(filteredArgs.slice(1), jsonMode);
      break;
    case 'keygen':
      handleKeygen(filteredArgs.slice(1));
      break;
    case 'audit':
      handleAudit(filteredArgs.slice(1), jsonMode);
      break;
    case 'pull':
      handlePull(filteredArgs.slice(1), jsonMode);
      break;
    case 'push':
      handlePush(filteredArgs.slice(1), jsonMode);
      break;
    case 'inline':
      handleInline(filteredArgs.slice(1));
      break;
    case 'suggest':
      handleSuggest(filteredArgs.slice(1), jsonMode);
      break;
    case 'eval':
      handleEval(filteredArgs.slice(1), jsonMode);
      break;
    case 'lifecycle':
      handleLifecycle(filteredArgs.slice(1), jsonMode);
      break;
    case 'consistency-check':
      handleConsistencyCheck(filteredArgs.slice(1), jsonMode);
      break;
    case 'lint':
      handleLint(filteredArgs.slice(1), jsonMode);
      break;
    case 'owners':
      handleOwners(filteredArgs.slice(1), jsonMode);
      break;
    case 'tenant':
      handleTenant(filteredArgs.slice(1), jsonMode);
      break;
    case 'impact':
      handleImpact(filteredArgs.slice(1), jsonMode);
      break;
    case 'test':
      handleTest(filteredArgs.slice(1), jsonMode);
      break;
    case 'canary':
      handleCanary(filteredArgs.slice(1), jsonMode);
      break;
    case 'overlay':
      handleOverlay(filteredArgs.slice(1), jsonMode);
      break;
    case 'replay':
      handleReplay(filteredArgs.slice(1), jsonMode);
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

function handleSign(args: string[]): void {
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

function handleVerify(args: string[], jsonMode: boolean): void {
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

function handleKeygen(args: string[]): void {
  const outputIdx = args.indexOf('-o');
  const prefix = outputIdx !== -1 ? args[outputIdx + 1] : 'tinyflag';

  const privateKeyPath = `${prefix}.key`;
  const publicKeyPath = `${prefix}.pub`;

  try {
    generateKeyPair(privateKeyPath, publicKeyPath);
    console.log(`✅ Key pair generated:`);
    console.log(`   Private key: ${privateKeyPath}`);
    console.log(`   Public key:  ${publicKeyPath}`);
  } catch (error) {
    console.error(`❌ Key generation failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

function handleInline(args: string[]): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag inline <file> [--format esm|cjs] [-o output]');
    process.exit(1);
  }

  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'esm';
  const outputIdx = args.indexOf('-o');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const config = loadAndValidate(filePath);
  const json = JSON.stringify({ version: 1, flags: config.flags }, null, 2);

  let code: string;
  if (format === 'cjs') {
    code = `// Auto-generated by tinyflag inline — do not edit\nmodule.exports = ${json};\n`;
  } else {
    code = `// Auto-generated by tinyflag inline — do not edit\nexport default ${json};\n`;
  }

  if (outputPath) {
    writeFileSync(outputPath, code, 'utf-8');
    console.log(`✅ Inlined flags to ${outputPath} (${format})`);
  } else {
    process.stdout.write(code);
  }
}

function handleSuggest(args: string[], jsonMode: boolean): void {
  const dir = args[0] || '.';
  const outputIdx = args.indexOf('-o');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const suggestions = scanForFlagPatterns(dir);

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'suggest', directory: dir, suggestions }, null, 2));
    return;
  }

  if (suggestions.length === 0) {
    console.log('No feature flag patterns detected in the codebase.');
    return;
  }

  console.log(formatSuggestionsReport(suggestions));

  if (outputPath) {
    const yaml = formatSuggestionsAsYaml(suggestions);
    writeFileSync(outputPath, yaml, 'utf-8');
    console.log(`✅ Suggested flags written to ${outputPath}`);
  } else {
    console.log('Suggested YAML:\n');
    console.log(formatSuggestionsAsYaml(suggestions));
  }
}

function handleAudit(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag audit <file> [--json]');
    process.exit(1);
  }

  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  } catch {
    console.error('Error: Not inside a git repository. The audit command requires git.');
    process.exit(1);
  }

  let gitLog: string;
  try {
    gitLog = execSync(
      `git log --follow --format="COMMIT:%H|%an|%aI|%s" -p -- "${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 },
    );
  } catch {
    console.error(`Error: Could not read git history for "${filePath}".`);
    process.exit(1);
  }

  const entries = parseGitAuditLog(gitLog, filePath);

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'audit', file: filePath, entries }, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log(`No git history found for ${filePath}`);
    return;
  }

  console.log(`📋 Flag change history for ${filePath}\n`);
  for (const entry of entries) {
    console.log(`  ${entry.date}  ${entry.hash.slice(0, 7)}  ${entry.author}`);
    console.log(`  ${entry.subject}`);
    for (const change of entry.changes) {
      const icon = change.action === 'added' ? '🆕' : change.action === 'removed' ? '🗑️' : '✏️';
      console.log(`    ${icon} ${change.flag}: ${change.summary}`);
    }
    console.log();
  }
}

interface AuditLogEntry {
  hash: string;
  author: string;
  date: string;
  subject: string;
  changes: { flag: string; action: 'added' | 'removed' | 'modified'; summary: string }[];
}

function parseGitAuditLog(gitLog: string, filePath: string): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  const commits = gitLog.split(/^COMMIT:/m).filter(Boolean);

  for (const commit of commits) {
    const headerEnd = commit.indexOf('\n');
    if (headerEnd === -1) continue;

    const header = commit.substring(0, headerEnd);
    const [hash, author, date, ...subjectParts] = header.split('|');
    const subject = subjectParts.join('|');
    const diff = commit.substring(headerEnd + 1);

    const changes: AuditLogEntry['changes'] = [];

    const addedFlags = new Set<string>();
    const removedFlags = new Set<string>();

    for (const line of diff.split('\n')) {
      // Look for flag-level changes in YAML diff
      const addMatch = line.match(/^\+\s{2}([\w-]+):\s*$/);
      const removeMatch = line.match(/^-\s{2}([\w-]+):\s*$/);

      if (addMatch) addedFlags.add(addMatch[1]);
      if (removeMatch) removedFlags.add(removeMatch[1]);
    }

    for (const flag of addedFlags) {
      if (removedFlags.has(flag)) {
        changes.push({ flag, action: 'modified', summary: 'definition changed' });
        removedFlags.delete(flag);
      } else {
        changes.push({ flag, action: 'added', summary: 'flag created' });
      }
    }
    for (const flag of removedFlags) {
      changes.push({ flag, action: 'removed', summary: 'flag deleted' });
    }

    // Detect inline property changes (enabled, rollout, etc.)
    const enabledChanges = diff.match(/^[+-]\s{4}enabled:\s*(true|false)/gm);
    const rolloutChanges = diff.match(/^[+-]\s{4}rollout:\s*\d+/gm);

    if (enabledChanges && changes.length === 0) {
      changes.push({ flag: '(flags)', action: 'modified', summary: 'enabled state changed' });
    }
    if (rolloutChanges && changes.length === 0) {
      changes.push({ flag: '(flags)', action: 'modified', summary: 'rollout percentage changed' });
    }

    if (changes.length === 0 && diff.trim()) {
      changes.push({ flag: filePath, action: 'modified', summary: 'file modified' });
    }

    entries.push({ hash, author, date, subject, changes });
  }

  return entries;
}

function handlePull(args: string[], jsonMode: boolean): void {
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
        console.log(JSON.stringify({ command: 'pull', url, output: outputPath, ...result }, null, 2));
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

function handlePush(args: string[], jsonMode: boolean): void {
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

function handleReplay(args: string[], jsonMode: boolean): void {
  const logFile = args.find((a) => !a.startsWith('-'));
  if (!logFile) {
    console.error('Error: Missing replay log file\n');
    console.log('Usage: tinyflag replay <log.jsonl> --flags <file> [--at <timestamp>] [--html <output>] [--json]');
    process.exit(1);
  }

  const flagsIdx = args.indexOf('--flags');
  const flagsFile = flagsIdx !== -1 ? args[flagsIdx + 1] : undefined;
  if (!flagsFile) {
    console.error('Error: Missing --flags option\n');
    console.log('Usage: tinyflag replay <log.jsonl> --flags <file> [--at <timestamp>] [--html <output>]');
    process.exit(1);
  }

  const atIdx = args.indexOf('--at');
  const atTimestamp = atIdx !== -1 ? args[atIdx + 1] : undefined;
  const htmlIdx = args.indexOf('--html');
  const htmlOutput = htmlIdx !== -1 ? args[htmlIdx + 1] : undefined;

  let logContent: string;
  try {
    logContent = readFileSync(logFile, 'utf-8');
  } catch {
    console.error(`Error: Cannot read log file "${logFile}"`);
    process.exit(1);
  }

  const entries = parseReplayLog(logContent);
  const config = loadAndValidate(flagsFile);
  setEvaluationContext(config.flags);

  // Filter entries by timestamp if --at is provided
  const filtered = atTimestamp
    ? entries.filter((e) => new Date(e.timestamp).getTime() <= new Date(atTimestamp).getTime())
    : entries;

  // Re-evaluate each entry against current flags
  const diffs: ReplayDiff[] = filtered.map((entry) => {
    const flag = config.flags[entry.flag];
    const replayResult = flag ? evaluateFlag(entry.flag, flag, entry.context) : false;
    return {
      flag: entry.flag,
      context: entry.context,
      originalResult: entry.result,
      replayResult,
      changed: entry.result !== replayResult,
      ...(entry.variant !== undefined ? { originalVariant: entry.variant } : {}),
    };
  });

  const changedCount = diffs.filter((d) => d.changed).length;

  if (htmlOutput) {
    const html = generateReplayHtmlReport(diffs, atTimestamp);
    writeFileSync(htmlOutput, html, 'utf-8');
    console.log(`✅ HTML report written to ${htmlOutput}`);
  }

  if (jsonMode) {
    console.log(JSON.stringify({
      command: 'replay',
      logFile,
      flagsFile,
      ...(atTimestamp ? { at: atTimestamp } : {}),
      totalEntries: filtered.length,
      changed: changedCount,
      diffs: diffs.filter((d) => d.changed),
    }, null, 2));
    return;
  }

  console.log(`🔄 Replay: ${filtered.length} evaluations, ${changedCount} changed\n`);
  if (changedCount > 0) {
    for (const d of diffs.filter((d) => d.changed)) {
      console.log(`  ⚠️  ${d.flag}: ${d.originalResult} → ${d.replayResult}`);
    }
  } else {
    console.log('  ✅ No changes detected — current flags produce identical results.');
  }
}

function handleLint(args: string[], jsonMode: boolean): void {
  const filePath = args.find((a) => !a.startsWith('-'));
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag lint <file> [--format json|sarif] [--config <rc-path>]');
    process.exit(1);
  }

  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : undefined;
  const configIdx = args.indexOf('--config');
  const configPath = configIdx !== -1 ? args[configIdx + 1] : undefined;

  const config = loadAndValidate(filePath);
  const lintCfg = loadLintConfig(configPath);
  const results = lintConfig(config, lintCfg);

  if (format === 'sarif') {
    console.log(JSON.stringify(formatLintSarif(results, filePath), null, 2));
    const hasErrors = results.some((r) => r.severity === 'error');
    if (hasErrors) process.exit(1);
    return;
  }

  if (jsonMode || format === 'json') {
    console.log(JSON.stringify({ command: 'lint', file: filePath, results }, null, 2));
    const hasErrors = results.some((r) => r.severity === 'error');
    if (hasErrors) process.exit(1);
    return;
  }

  console.log(formatLintResults(results));
  const hasErrors = results.some((r) => r.severity === 'error');
  if (hasErrors) process.exit(1);
}

function handleConsistencyCheck(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag consistency-check <file> [--vectors <count>] [--json]');
    process.exit(1);
  }

  const vectorsIdx = args.indexOf('--vectors');
  const count = vectorsIdx !== -1 ? parseInt(args[vectorsIdx + 1], 10) : 10000;
  if (isNaN(count) || count < 1) {
    console.error('Error: --vectors must be a positive integer');
    process.exit(1);
  }

  try {
    const result = checkConsistency(filePath, count);
    if (jsonMode) {
      console.log(JSON.stringify({ command: 'consistency-check', ...result }, null, 2));
    } else {
      console.log(formatConsistencyReport(result));
    }

    if (result.divergences.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Consistency check failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

function handleLifecycle(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag lifecycle <file> [--json]');
    process.exit(1);
  }

  const config = loadAndValidate(filePath);
  const distribution: Record<string, string[]> = { draft: [], active: [], sunset: [], archived: [], unset: [] };

  for (const [name, flag] of Object.entries(config.flags)) {
    const state = (flag as FlagDefinition & { lifecycle?: { state: string } }).lifecycle?.state ?? 'unset';
    (distribution[state] ??= []).push(name);
  }

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'lifecycle', distribution }, null, 2));
    return;
  }

  console.log('📊 Flag lifecycle distribution:\n');
  for (const [state, flags] of Object.entries(distribution)) {
    if (flags.length === 0) continue;
    const icon = state === 'active' ? '🟢' : state === 'draft' ? '📝' : state === 'sunset' ? '🌅' : state === 'archived' ? '📦' : '⚪';
    console.log(`  ${icon} ${state}: ${flags.length} flag(s)`);
    for (const f of flags) {
      console.log(`     - ${f}`);
    }
  }
}

function handleEval(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName || flagName.startsWith('-')) {
    console.error('Error: Missing flag name\n');
    console.log('Usage: tinyflag eval <flag> --file <file> [--persona <name>] [--context key=val...]');
    process.exit(1);
  }

  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1 ? args[fileIdx + 1] : undefined;
  if (!filePath) {
    console.error('Error: Missing --file option\n');
    console.log('Usage: tinyflag eval <flag> --file <file> [--persona <name>] [--context key=val...]');
    process.exit(1);
  }

  const config = loadAndValidate(filePath);
  setEvaluationContext(config.flags);

  const personaIdx = args.indexOf('--persona');
  const personaName = personaIdx !== -1 ? args[personaIdx + 1] : undefined;

  // Build context from --context key=val pairs
  const context: UserContext = {};
  const contextIdx = args.indexOf('--context');
  if (contextIdx !== -1) {
    for (let i = contextIdx + 1; i < args.length; i++) {
      if (args[i].startsWith('--')) break;
      const eqIdx = args[i].indexOf('=');
      if (eqIdx === -1) continue;
      const key = args[i].substring(0, eqIdx);
      const val = args[i].substring(eqIdx + 1);
      context[key] = val === 'true' ? true : val === 'false' ? false : isNaN(Number(val)) ? val : Number(val);
    }
  }

  const flag = config.flags[flagName];
  if (!flag) {
    console.error(`Error: Flag "${flagName}" not found`);
    process.exit(1);
  }

  let result: boolean;
  if (personaName) {
    const persona = (config as FlagConfig).personas?.[personaName];
    if (!persona) {
      console.error(`Error: Persona "${personaName}" not found`);
      process.exit(1);
    }
    result = evaluateWithPersona(flagName, flag, persona, Object.keys(context).length > 0 ? context : undefined);
  } else {
    result = evaluateFlag(flagName, flag, Object.keys(context).length > 0 ? context : undefined);
  }

  if (jsonMode) {
    console.log(JSON.stringify({
      command: 'eval',
      flag: flagName,
      ...(personaName ? { persona: personaName } : {}),
      context: Object.keys(context).length > 0 ? context : undefined,
      result,
    }, null, 2));
  } else {
    console.log(`${result ? '✅' : '❌'} ${flagName} → ${result}`);
  }
}

function handleOwners(args: string[], jsonMode: boolean): void {
  const subCommand = args[0];

  const ownersIdx = args.indexOf('--owners');
  const ownersFile = ownersIdx >= 0 && args[ownersIdx + 1] ? args[ownersIdx + 1] : 'flag-owners.yml';

  if (subCommand === 'check') {
    // Check approvals for changed flags
    const flagFile = args[1];
    if (!flagFile) {
      console.error('Usage: tinyflag owners check <file> --owners <owners-file> --approvers user1,user2 --changed flag1,flag2');
      process.exit(1);
    }

    const approversIdx = args.indexOf('--approvers');
    const approvers = approversIdx >= 0 && args[approversIdx + 1]
      ? args[approversIdx + 1].split(',')
      : [];

    const changedIdx = args.indexOf('--changed');
    const changedFlags = changedIdx >= 0 && args[changedIdx + 1]
      ? args[changedIdx + 1].split(',')
      : [];

    const ownersConfig = loadFlagOwners(ownersFile);
    const result = checkApprovals(changedFlags, ownersConfig, approvers);

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatApprovalResult(result));
    }

    process.exit(result.passed ? 0 : 1);
  } else {
    // Show ownership report for all flags
    const flagFile = subCommand;
    if (!flagFile) {
      console.error('Usage: tinyflag owners <file> [--owners <owners-file>]');
      process.exit(1);
    }

    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content);
    const config = parseFlagConfig(raw);
    const ownersConfig = loadFlagOwners(ownersFile);

    if (jsonMode) {
      const results = Object.keys(config.flags).map((f) => resolveOwnership(f, ownersConfig));
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(formatOwnershipReport(config, ownersConfig));
    }
  }
}

function handleTenant(args: string[], jsonMode: boolean): void {
  const subCommand = args[0];

  if (subCommand === 'list') {
    const flagFile = args[1];
    if (!flagFile) {
      console.error('Usage: tinyflag tenant list <file>');
      process.exit(1);
    }
    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content) as MultiTenantFlagConfig;
    if (jsonMode) {
      console.log(JSON.stringify({ tenants: listTenants(raw) }, null, 2));
    } else {
      console.log(formatTenantList(raw));
    }
  } else if (subCommand === 'diff') {
    const flagFile = args[1];
    if (!flagFile) {
      console.error('Usage: tinyflag tenant diff <file> --a <tenant1> --b <tenant2>');
      process.exit(1);
    }
    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content) as MultiTenantFlagConfig;

    const aIdx = args.indexOf('--a');
    const bIdx = args.indexOf('--b');
    const tenantA = aIdx >= 0 && args[aIdx + 1] ? args[aIdx + 1] : null;
    const tenantB = bIdx >= 0 && args[bIdx + 1] ? args[bIdx + 1] : null;

    const diffs = diffTenantFlags(raw, tenantA, tenantB);
    if (jsonMode) {
      console.log(JSON.stringify(diffs, null, 2));
    } else if (diffs.length === 0) {
      console.log('No differences found.');
    } else {
      for (const diff of diffs) {
        const icon = diff.type === 'added' ? '➕' : diff.type === 'removed' ? '➖' : '🔄';
        console.log(`${icon} ${diff.flag} (${diff.type})`);
        if (diff.changes) {
          for (const c of diff.changes) {
            console.log(`    ${c}`);
          }
        }
      }
    }
  } else if (subCommand === 'validate') {
    const flagFile = args[1];
    if (!flagFile) {
      console.error('Usage: tinyflag tenant validate <file>');
      process.exit(1);
    }
    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content) as MultiTenantFlagConfig;
    const violations = validateTenantIsolation(raw);
    if (jsonMode) {
      console.log(JSON.stringify({ passed: violations.length === 0, violations }, null, 2));
    } else if (violations.length === 0) {
      console.log('✅ No tenant isolation violations found.');
    } else {
      console.log('❌ Tenant isolation violations:');
      for (const v of violations) {
        console.log(`  Flag "${v.flag}" from tenant "${v.sourceTenant}" leaked to "${v.leakedToTenant}"`);
      }
      process.exit(1);
    }
  } else {
    console.error('Usage: tinyflag tenant <list|diff|validate> <file>');
    process.exit(1);
  }
}

function handleImpact(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag impact <flag> --dir <dir> [--flags <file>]');
    process.exit(1);
  }

  const dirIdx = args.indexOf('--dir');
  const dir = dirIdx >= 0 && args[dirIdx + 1] ? args[dirIdx + 1] : '.';

  const flagsIdx = args.indexOf('--flags');
  let config = undefined;
  if (flagsIdx >= 0 && args[flagsIdx + 1]) {
    const content = readFileSync(args[flagsIdx + 1], 'utf8');
    const raw = parseYaml(content);
    config = parseFlagConfig(raw);
  }

  const analysis = analyzeImpact(dir, flagName, config);

  if (jsonMode) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    console.log(formatImpactReport(analysis));
  }
}

function handleTest(args: string[], jsonMode: boolean): void {
  const specDir = args[0];
  if (!specDir) {
    console.error('Usage: tinyflag test <specs-dir> --flags <file> [--junit <output>]');
    process.exit(1);
  }

  const flagsIdx = args.indexOf('--flags');
  if (flagsIdx < 0 || !args[flagsIdx + 1]) {
    console.error('--flags <file> is required');
    process.exit(1);
  }

  const flagContent = readFileSync(args[flagsIdx + 1], 'utf8');
  const config = parseFlagConfig(parseYaml(flagContent));

  const result = runTestSpecs(specDir, config);

  // JUnit output
  const junitIdx = args.indexOf('--junit');
  if (junitIdx >= 0 && args[junitIdx + 1]) {
    const xml = formatJUnitXml(result);
    writeFileSync(args[junitIdx + 1], xml);
    console.log(`JUnit XML written to ${args[junitIdx + 1]}`);
  }

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatTestResults(result));
  }

  process.exit(result.totalFailed > 0 ? 1 : 0);
}

function handleCanary(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag canary <flag> --adapter <prometheus|datadog> --url <metrics-url> [--threshold <0.05>]');
    process.exit(1);
  }

  const adapterIdx = args.indexOf('--adapter');
  const adapterName = adapterIdx >= 0 && args[adapterIdx + 1] ? args[adapterIdx + 1] : 'prometheus';

  const urlIdx = args.indexOf('--url');
  const metricsUrl = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : 'http://localhost:9090';

  const thresholdIdx = args.indexOf('--threshold');
  const threshold = thresholdIdx >= 0 && args[thresholdIdx + 1] ? parseFloat(args[thresholdIdx + 1]) : 0.05;

  const stagesIdx = args.indexOf('--stages');
  const stages = stagesIdx >= 0 && args[stagesIdx + 1]
    ? args[stagesIdx + 1].split(',').map(Number)
    : [1, 5, 25, 50, 100];

  let adapter;
  switch (adapterName) {
    case 'datadog': {
      const apiKey = process.env.DD_API_KEY || '';
      const appKey = process.env.DD_APP_KEY || '';
      adapter = createDatadogAdapter(apiKey, appKey);
      break;
    }
    case 'prometheus':
    default:
      adapter = createPrometheusAdapter(metricsUrl);
      break;
  }

  const controller = new CanaryController({
    flag: flagName,
    metricsAdapter: adapter,
    errorThreshold: threshold,
    stages,
    stageInterval: 300,
    gracePeriod: 300,
    confirmationWindow: 3,
  }, (flag, pct) => {
    console.log(`  → Updated ${flag} rollout to ${pct}%`);
  });

  if (jsonMode) {
    console.log(JSON.stringify(controller.getState(), null, 2));
  } else {
    console.log(formatCanaryState(controller.getState()));
    console.log('');
    console.log('Canary controller initialized. Use the canary API to run check/advance cycles.');
    console.log(`  Stages: ${stages.join('% → ')}%`);
    console.log(`  Threshold: ${(threshold * 100).toFixed(1)}% error rate`);
    console.log(`  Adapter: ${adapterName} (${metricsUrl})`);
  }
}

function handleOverlay(args: string[], jsonMode: boolean): void {
  const subCommand = args[0];

  if (subCommand === 'list') {
    const dir = args[1] || '.';
    const overlays = listActiveOverlays(dir);
    if (jsonMode) {
      console.log(JSON.stringify(overlays, null, 2));
    } else if (overlays.length === 0) {
      console.log('No active overlays.');
    } else {
      for (const overlay of overlays) {
        console.log(`📌 ${overlay.scope} (${overlay.overrides.length} override${overlay.overrides.length !== 1 ? 's' : ''})`);
        console.log(`   Expires: ${overlay.expiresAt}`);
        for (const o of overlay.overrides) {
          const parts: string[] = [o.flag];
          if (o.enabled !== undefined) parts.push(`enabled=${o.enabled}`);
          if (o.rollout !== undefined) parts.push(`rollout=${o.rollout}`);
          if (o.variant) parts.push(`variant=${o.variant}`);
          console.log(`   • ${parts.join(' ')}`);
        }
        console.log('');
      }
    }
  } else if (subCommand === 'apply') {
    const flagFile = args[1];
    const dirIdx = args.indexOf('--dir');
    const dir = dirIdx >= 0 && args[dirIdx + 1] ? args[dirIdx + 1] : '.';

    if (!flagFile) {
      console.error('Usage: tinyflag overlay apply <flags-file> --dir <overlay-dir>');
      process.exit(1);
    }

    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content);
    let config = parseFlagConfig(raw);

    const overlays = listActiveOverlays(dir);
    for (const overlay of overlays) {
      config = { ...config, ...applyOverlay(config, overlay) };
    }

    if (jsonMode) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log(`✅ Applied ${overlays.length} overlay(s) to ${flagFile}`);
      console.log(JSON.stringify(config.flags, null, 2));
    }
  } else if (subCommand === 'cleanup') {
    const dir = args[1] || '.';
    const removed = cleanupExpiredOverlays(dir);
    if (jsonMode) {
      console.log(JSON.stringify({ removed }, null, 2));
    } else if (removed.length === 0) {
      console.log('No expired overlays to clean up.');
    } else {
      console.log(`🗑️  Removed ${removed.length} expired overlay(s):`);
      for (const r of removed) console.log(`  - ${r}`);
    }
  } else {
    console.error('Usage: tinyflag overlay <list|apply|cleanup> [options]');
    process.exit(1);
  }
}

main();
