import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import {
  initOptimizerState,
  recordBanditConversion,
  updateWeights,
  formatOptimizerState,
} from 'tinyflag';
import type { OptimizerState } from 'tinyflag';

const STATE_FILE = '.tinyflag-optimizer.json';

function loadOptimizerStates(): Record<string, OptimizerState> {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveOptimizerStates(states: Record<string, OptimizerState>): void {
  writeFileSync(STATE_FILE, JSON.stringify(states, null, 2));
}

export function handleOptimize(args: string[], jsonMode: boolean): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    console.log(`Usage: tinyflag optimize <subcommand> [options]

Subcommands:
  init <flag>            Initialize optimizer for a flag's variants
  record <flag>          Record conversion events
  update [flag]          Run Thompson Sampling to update weights
  status [flag]          Show optimizer status

Options:
  --flags <file>         Flag config file (default: flags.yml)
  --variant <name>       Variant name for recording
  --converted            Mark as converted (default: false)
  --threshold <0-1>      Winner declaration threshold (default: 0.95)
  --simulations <n>      Number of Thompson Sampling simulations (default: 10000)`);
    return;
  }

  switch (subcommand) {
    case 'init':
      handleOptimizeInit(args.slice(1), jsonMode);
      break;
    case 'record':
      handleOptimizeRecord(args.slice(1), jsonMode);
      break;
    case 'update':
      handleOptimizeUpdate(args.slice(1), jsonMode);
      break;
    case 'status':
      handleOptimizeStatus(args.slice(1), jsonMode);
      break;
    default:
      console.error(`Unknown optimize subcommand: ${subcommand}`);
      process.exit(1);
  }
}

function handleOptimizeInit(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag optimize init <flag> --flags <file>');
    process.exit(1);
  }

  const flagsIdx = args.indexOf('--flags');
  const flagsFile = flagsIdx >= 0 && args[flagsIdx + 1] ? args[flagsIdx + 1] : 'flags.yml';

  if (!existsSync(flagsFile)) {
    console.error(`Error: Flags file not found: ${flagsFile}`);
    process.exit(1);
  }

  const content = readFileSync(flagsFile, 'utf8');
  const raw = parseYaml(content);
  const config = parseFlagConfig(raw);
  const flag = config.flags[flagName];

  if (!flag) {
    console.error(`Error: Flag not found: ${flagName}`);
    process.exit(1);
  }

  if (!flag.variants || flag.variants.length < 2) {
    console.error(`Error: Flag "${flagName}" needs at least 2 variants for optimization`);
    process.exit(1);
  }

  const variantNames = flag.variants.map((v) => v.name);
  const state = initOptimizerState(flagName, variantNames);

  const states = loadOptimizerStates();
  states[flagName] = state;
  saveOptimizerStates(states);

  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.log(`✅ Initialized optimizer for "${flagName}" with variants: ${variantNames.join(', ')}`);
  }
}

function handleOptimizeRecord(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag optimize record <flag> --variant <name> [--converted]');
    process.exit(1);
  }

  const variantIdx = args.indexOf('--variant');
  const variantName = variantIdx >= 0 && args[variantIdx + 1] ? args[variantIdx + 1] : undefined;

  if (!variantName) {
    console.error('Error: --variant <name> is required');
    process.exit(1);
  }

  const converted = args.includes('--converted');

  const states = loadOptimizerStates();
  if (!states[flagName]) {
    console.error(`Error: No optimizer state for "${flagName}". Run 'tinyflag optimize init' first.`);
    process.exit(1);
  }

  states[flagName] = recordBanditConversion(states[flagName], variantName, converted);
  saveOptimizerStates(states);

  if (jsonMode) {
    console.log(JSON.stringify({ recorded: true, variant: variantName, converted }));
  } else {
    console.log(`📊 Recorded ${converted ? 'conversion' : 'impression'} for ${flagName}/${variantName}`);
  }
}

function handleOptimizeUpdate(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  const states = loadOptimizerStates();

  const threshIdx = args.indexOf('--threshold');
  const threshold = threshIdx >= 0 && args[threshIdx + 1] ? parseFloat(args[threshIdx + 1]) : 0.95;

  const simIdx = args.indexOf('--simulations');
  const simulations = simIdx >= 0 && args[simIdx + 1] ? parseInt(args[simIdx + 1], 10) : 10000;

  const flagsToUpdate = flagName ? [flagName] : Object.keys(states);

  for (const flag of flagsToUpdate) {
    if (!states[flag]) {
      console.error(`No optimizer state for "${flag}"`);
      continue;
    }

    states[flag] = updateWeights(states[flag], { winnerThreshold: threshold }, simulations);

    if (jsonMode) {
      console.log(JSON.stringify(states[flag], null, 2));
    } else {
      console.log(formatOptimizerState(states[flag]));
      console.log('');
    }
  }

  saveOptimizerStates(states);
}

function handleOptimizeStatus(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  const states = loadOptimizerStates();

  if (Object.keys(states).length === 0) {
    console.log('No active optimizers. Run `tinyflag optimize init <flag>` to start.');
    return;
  }

  const flagsToShow = flagName ? [flagName] : Object.keys(states);

  for (const flag of flagsToShow) {
    if (!states[flag]) {
      console.error(`No optimizer state for "${flag}"`);
      continue;
    }

    if (jsonMode) {
      console.log(JSON.stringify(states[flag], null, 2));
    } else {
      console.log(formatOptimizerState(states[flag]));
      console.log('');
    }
  }
}
