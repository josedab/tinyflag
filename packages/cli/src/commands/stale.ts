import { scanFlagUsage, generateStaleReport, formatStaleReport } from '../stale.js';
import { loadAndValidate } from './utils.js';

export function handleStale(args: string[], jsonMode: boolean): void {
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
    const totalIssues =
      report.unusedFlags.length + report.undefinedRefs.length + report.zeroRolloutFlags.length;
    if (totalIssues > 0) {
      process.exit(1);
    }
  }
}
