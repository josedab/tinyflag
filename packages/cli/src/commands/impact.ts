import type { FlagConfig } from 'tinyflag';
import { analyzeImpact, formatImpactReport } from '../impact.js';
import { loadAndValidate } from './utils.js';

export function handleImpact(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag impact <flag> --dir <dir> [--flags <file>]');
    process.exit(1);
  }

  const dirIdx = args.indexOf('--dir');
  const dir = dirIdx >= 0 && args[dirIdx + 1] ? args[dirIdx + 1] : '.';

  const flagsIdx = args.indexOf('--flags');
  let config: FlagConfig | undefined;
  if (flagsIdx >= 0 && args[flagsIdx + 1]) {
    config = loadAndValidate(args[flagsIdx + 1]);
  }

  const analysis = analyzeImpact(dir, flagName, config);

  if (jsonMode) {
    console.log(JSON.stringify(analysis, null, 2));
  } else {
    console.log(formatImpactReport(analysis));
  }
}
