import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import {
  generateTestMatrix,
  generateK6Script,
  generateArtilleryConfig,
  generatePerfReport,
  formatTestMatrix,
  formatPerfReport,
} from 'tinyflag';
import type { PerfMetrics } from 'tinyflag';
import { join } from 'path';
import { loadAndValidate } from './utils.js';

export function handlePerf(args: string[], jsonMode: boolean): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    console.log(`Usage: tinyflag perf <subcommand> [options]

Subcommands:
  matrix               Generate test matrix from flag definitions
  generate             Generate test scripts (k6, artillery)
  report               Generate performance comparison report

Options:
  --flags <file>       Flag config file (default: flags.yml)
  --url <url>          Base URL for test scripts
  --format <k6|art>    Test script format (default: k6)
  --output <dir>       Output directory for scripts
  --max <n>            Maximum combinations (default: 64)
  --tags <t1,t2>       Filter flags by tags
  --budget <ms>        Latency budget in ms (default: 200)
  --results <file>     Performance results JSON file (for report)`);
    return;
  }

  const flagsIdx = args.indexOf('--flags');
  const flagsFile = flagsIdx >= 0 && args[flagsIdx + 1] ? args[flagsIdx + 1] : 'flags.yml';

  switch (subcommand) {
    case 'matrix':
      handlePerfMatrix(args.slice(1), flagsFile, jsonMode);
      break;
    case 'generate':
      handlePerfGenerate(args.slice(1), flagsFile, jsonMode);
      break;
    case 'report':
      handlePerfReport(args.slice(1), flagsFile, jsonMode);
      break;
    default:
      console.error(`Unknown perf subcommand: ${subcommand}`);
      process.exit(1);
  }
}

function handlePerfMatrix(args: string[], flagsFile: string, jsonMode: boolean): void {
  if (!existsSync(flagsFile)) {
    console.error(`Error: Flags file not found: ${flagsFile}`);
    process.exit(1);
  }

  const config = loadAndValidate(flagsFile);

  const maxIdx = args.indexOf('--max');
  const maxCombinations = maxIdx >= 0 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 64;

  const tagsIdx = args.indexOf('--tags');
  const tags = tagsIdx >= 0 && args[tagsIdx + 1] ? args[tagsIdx + 1].split(',') : undefined;

  const matrix = generateTestMatrix(config, { maxCombinations, tags });

  if (jsonMode) {
    console.log(JSON.stringify(matrix, null, 2));
  } else {
    console.log(formatTestMatrix(matrix));
  }
}

function handlePerfGenerate(args: string[], flagsFile: string, jsonMode: boolean): void {
  if (!existsSync(flagsFile)) {
    console.error(`Error: Flags file not found: ${flagsFile}`);
    process.exit(1);
  }

  const config = loadAndValidate(flagsFile);

  const urlIdx = args.indexOf('--url');
  const baseUrl = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : 'http://localhost:3000';

  const formatIdx = args.indexOf('--format');
  const format = formatIdx >= 0 && args[formatIdx + 1] ? args[formatIdx + 1] : 'k6';

  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx >= 0 && args[outputIdx + 1] ? args[outputIdx + 1] : '.tinyflag-perf';

  const maxIdx = args.indexOf('--max');
  const maxCombinations = maxIdx >= 0 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 16;

  const matrix = generateTestMatrix(config, { maxCombinations });

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  let generated = 0;
  for (const combo of matrix.combinations) {
    let script: string;
    let filename: string;

    if (format === 'artillery' || format === 'art') {
      script = generateArtilleryConfig(combo, baseUrl);
      filename = `${combo.id}.yml`;
    } else {
      script = generateK6Script(combo, baseUrl);
      filename = `${combo.id}.js`;
    }

    writeFileSync(join(outputDir, filename), script);
    generated++;
  }

  if (jsonMode) {
    console.log(
      JSON.stringify({ generated, outputDir, format, combinations: matrix.combinations.length }),
    );
  } else {
    console.log(`✅ Generated ${generated} ${format} test scripts in ${outputDir}/`);
    console.log(`   Combinations: ${matrix.combinations.length}`);
    console.log(
      `   Run: ${format === 'k6' ? `k6 run ${outputDir}/combo-0.js` : `artillery run ${outputDir}/combo-0.yml`}`,
    );
  }
}

function handlePerfReport(args: string[], flagsFile: string, jsonMode: boolean): void {
  const resultsIdx = args.indexOf('--results');
  const resultsFile = resultsIdx >= 0 && args[resultsIdx + 1] ? args[resultsIdx + 1] : undefined;

  const budgetIdx = args.indexOf('--budget');
  const latencyBudget =
    budgetIdx >= 0 && args[budgetIdx + 1] ? parseInt(args[budgetIdx + 1], 10) : 200;

  if (!resultsFile || !existsSync(resultsFile)) {
    console.error('Error: --results <file> is required with performance test results JSON');
    console.error(
      'Expected format: [{"combinationId": "combo-0", "latencyP50": 10, "latencyP95": 50, "latencyP99": 100, "throughput": 1000, "errorRate": 0.01, "duration": 30}]',
    );
    process.exit(1);
  }

  if (!existsSync(flagsFile)) {
    console.error(`Error: Flags file not found: ${flagsFile}`);
    process.exit(1);
  }

  const config = loadAndValidate(flagsFile);

  const matrix = generateTestMatrix(config, { maxCombinations: 64 });
  const results: PerfMetrics[] = JSON.parse(readFileSync(resultsFile, 'utf8'));

  const report = generatePerfReport(matrix, results, latencyBudget);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatPerfReport(report));
  }

  if (!report.allWithinBudget) {
    process.exit(1);
  }
}
