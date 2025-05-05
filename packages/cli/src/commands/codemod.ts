import { loadAndValidate } from './utils.js';
import {
  runCodemod,
  checkArchivedFlagRefs,
  findFlagReferences,
  formatCodemodDiff,
} from '../codemod.js';

export function handleCodemod(args: string[], jsonMode: boolean): void {
  const ciMode = args.includes('--ci');
  const dryRun = args.includes('--dry-run');
  const archivedOnly = args.includes('--archived');
  const filteredArgs = args.filter((a) => !a.startsWith('--') || a === '--flags' || a === '--dir');

  const flagsIdx = args.indexOf('--flags');
  const flagsFile = flagsIdx !== -1 ? args[flagsIdx + 1] : undefined;
  const dirIdx = args.indexOf('--dir');
  const scanDir = dirIdx !== -1 ? args[dirIdx + 1] : '.';

  if (!flagsFile) {
    console.error('Error: Missing --flags option\n');
    console.log('Usage: tinyflag codemod --flags <file> [--dir <dir>] [--archived] [--dry-run] [--ci]');
    process.exit(1);
  }

  const config = loadAndValidate(flagsFile);

  // --ci --archived mode: check if archived flags still have references
  if (ciMode && archivedOnly) {
    const result = checkArchivedFlagRefs(scanDir, config);
    if (jsonMode) {
      console.log(JSON.stringify({
        command: 'codemod-check',
        clean: result.clean,
        staleRefs: result.staleRefs.map((r) => ({
          flag: r.flag,
          file: r.file,
          line: r.line,
          type: r.type,
        })),
      }, null, 2));
    } else if (result.clean) {
      console.log('✅ No archived flag references found in code.');
    } else {
      console.error('❌ Archived flags still referenced in code:');
      for (const ref of result.staleRefs) {
        console.error(`  - "${ref.flag}" at ${ref.file}:${ref.line} (${ref.type})`);
      }
    }
    process.exit(result.clean ? 0 : 1);
    return;
  }

  // Run codemod transforms
  const results = runCodemod(scanDir, config, {
    archivedOnly,
    dryRun: dryRun || ciMode,
  });

  if (jsonMode) {
    console.log(JSON.stringify({
      command: 'codemod',
      dryRun: dryRun || ciMode,
      filesChanged: results.length,
      changes: results.flatMap((r) => r.changes.map((c) => ({
        file: r.file,
        line: c.line,
        type: c.type,
        description: c.description,
      }))),
    }, null, 2));
  } else {
    const diff = formatCodemodDiff(results, scanDir);
    console.log(diff);
    if (dryRun && results.length > 0) {
      console.log('\n💡 Run without --dry-run to apply changes.');
    }
  }

  if (ciMode && results.length > 0) {
    process.exit(1);
  }
}
