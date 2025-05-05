import { readFileSync, existsSync } from 'fs';
import { loadAndValidate } from './utils.js';
import { ExperimentTracker, formatExperimentResults } from 'tinyflag';

export function handleExperiment(args: string[], jsonMode: boolean): void {
  const subCommand = args[0];

  if (subCommand === 'results') {
    handleExperimentResults(args.slice(1), jsonMode);
    return;
  }

  console.error('Usage: tinyflag experiment results <flag> --flags <file> [--data <file>]');
  process.exit(1);
}

function handleExperimentResults(args: string[], jsonMode: boolean): void {
  const flagsIdx = args.indexOf('--flags');
  const flagsFile = flagsIdx !== -1 ? args[flagsIdx + 1] : undefined;
  const dataIdx = args.indexOf('--data');
  const dataFile = dataIdx !== -1 ? args[dataIdx + 1] : undefined;
  const flagName = args.find((a) => !a.startsWith('-') && a !== flagsFile && a !== dataFile);

  if (!flagsFile || !flagName) {
    console.error('Error: Missing required arguments\n');
    console.log('Usage: tinyflag experiment results <flag> --flags <file> [--data <file>]');
    process.exit(1);
  }

  const config = loadAndValidate(flagsFile);
  const flagDef = config.flags[flagName];

  if (!flagDef) {
    console.error(`Error: Flag "${flagName}" not found`);
    process.exit(1);
  }

  if (!flagDef.experiment) {
    console.error(`Error: Flag "${flagName}" has no experiment configuration`);
    process.exit(1);
  }

  const tracker = new ExperimentTracker();

  // Load data from JSON file if provided
  if (dataFile) {
    if (!existsSync(dataFile)) {
      console.error(`Error: Data file not found: "${dataFile}"`);
      process.exit(1);
    }
    try {
      const data = JSON.parse(readFileSync(dataFile, 'utf-8'));
      if (Array.isArray(data.exposures)) {
        for (const e of data.exposures) {
          tracker.trackExposure(e.flag || flagName, e.variant, e.userId);
        }
      }
      if (Array.isArray(data.conversions)) {
        for (const c of data.conversions) {
          tracker.trackConversion(c.flag || flagName, c.variant, c.userId, c.value);
        }
      }
    } catch (error) {
      console.error(`Error parsing data file: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  const result = tracker.analyze(flagName, flagDef);

  if (!result) {
    console.error(`Error: Could not analyze experiment for "${flagName}"`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'experiment-results', ...result }, null, 2));
  } else {
    console.log(formatExperimentResults(result));
  }
}
