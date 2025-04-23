import { readFileSync, writeFileSync } from 'fs';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import {
  parseTestSpec,
  runTestSpec,
  runTestSpecs,
  formatTestResults,
  formatJUnitXml,
} from '../testing.js';

export function handleTest(args: string[], jsonMode: boolean): void {
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
  const { config } = parseFlagConfig(parseYaml(flagContent));

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
