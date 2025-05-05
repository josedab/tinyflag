import { scanFlagUsage, generateStaleReport, formatStaleReport } from '../stale.js';
import type { StalenessConfig } from '../stale.js';
import { loadAndValidate } from './utils.js';

export function handleStale(args: string[], jsonMode: boolean): void {
  const ciMode = args.includes('--ci');
  const filteredArgs = args.filter((a) => a !== '--ci');

  // Parse --flags option
  const flagsIdx = filteredArgs.indexOf('--flags');
  const flagsFile = flagsIdx !== -1 ? filteredArgs[flagsIdx + 1] : undefined;
  const scanDir = filteredArgs.find((a) => !a.startsWith('-') && a !== flagsFile) || '.';

  // Parse staleness config options
  const noRefDaysIdx = filteredArgs.indexOf('--no-ref-days');
  const noRefDays = noRefDaysIdx !== -1 ? parseInt(filteredArgs[noRefDaysIdx + 1], 10) : undefined;
  const excludeTagsIdx = filteredArgs.indexOf('--exclude-tags');
  const excludeTagsStr = excludeTagsIdx !== -1 ? filteredArgs[excludeTagsIdx + 1] : undefined;

  if (!flagsFile) {
    console.error('Error: Missing --flags option\n');
    console.log('Usage: tinyflag stale [dir] --flags <file> [--ci] [--json] [--no-ref-days N] [--exclude-tags tag1,tag2]');
    process.exit(1);
  }

  const stalenessConfig: StalenessConfig = {};
  if (noRefDays !== undefined) stalenessConfig.noReferenceDays = noRefDays;
  if (excludeTagsStr) stalenessConfig.excludeTags = excludeTagsStr.split(',').map((s) => s.trim());

  const config = loadAndValidate(flagsFile);
  const usages = scanFlagUsage(scanDir);
  const report = generateStaleReport(config.flags, usages, stalenessConfig);

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'stale', ...report }, null, 2));
  } else {
    console.log(formatStaleReport(report));
  }

  if (ciMode) {
    const totalIssues =
      report.unusedFlags.length + report.undefinedRefs.length + report.zeroRolloutFlags.length +
      (report.pastSunsetFlags?.length || 0);
    if (totalIssues > 0) {
      process.exit(1);
    }
  }
}
