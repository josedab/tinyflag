import {
  RolloutOrchestrator,
  createPrometheusHealthCheck,
  createHttpHealthCheck,
  formatRolloutState,
  DEFAULT_STAGES,
} from '../progressive.js';
import type { RolloutStage, RolloutState } from 'tinyflag';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const STATE_FILE = '.tinyflag-rollout.json';

function loadState(flag?: string): RolloutState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Record<string, RolloutState>;
    if (flag) return data[flag] ?? null;
    return null;
  } catch {
    return null;
  }
}

function saveState(state: RolloutState): void {
  let data: Record<string, RolloutState> = {};
  if (existsSync(STATE_FILE)) {
    try {
      data = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    } catch {
      data = {};
    }
  }
  data[state.flag] = state;
  writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

function parseStages(stagesArg: string): RolloutStage[] {
  return stagesArg.split(',').map((s, i) => {
    const [name, pct] = s.includes(':') ? s.split(':') : [`stage-${i}`, s];
    return { name: name.trim(), percentage: parseInt(pct.trim(), 10) };
  });
}

export function handleRollout(args: string[], jsonMode: boolean): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    console.log(`Usage: tinyflag rollout <subcommand> [options]

Subcommands:
  start <flag>      Start a progressive rollout
  status [flag]     Show rollout status
  promote <flag>    Promote to next stage (--force to skip criteria check)
  rollback <flag>   Rollback to 0%
  pause <flag>      Pause rollout
  resume <flag>     Resume paused rollout

Options:
  --stages <list>          Stage definitions (e.g., "canary:1,ring:10,ga:100")
  --health-check <type>    Health check provider: prometheus, http (default: prometheus)
  --url <url>              Health check endpoint URL
  --max-error-rate <rate>  Max error rate threshold (default: 0.05)
  --max-latency <ms>       Max latency P99 threshold in ms
  --hold-time <seconds>    Min hold time per stage (default: 300)
  --force                  Skip promotion criteria check`);
    return;
  }

  switch (subcommand) {
    case 'start':
      handleRolloutStart(args.slice(1), jsonMode);
      break;
    case 'status':
      handleRolloutStatus(args.slice(1), jsonMode);
      break;
    case 'promote':
      handleRolloutPromote(args.slice(1), jsonMode);
      break;
    case 'rollback':
      handleRolloutRollback(args.slice(1), jsonMode);
      break;
    case 'pause':
      handleRolloutPause(args.slice(1), jsonMode);
      break;
    case 'resume':
      handleRolloutResume(args.slice(1), jsonMode);
      break;
    default:
      console.error(`Unknown rollout subcommand: ${subcommand}`);
      process.exit(1);
  }
}

function handleRolloutStart(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag rollout start <flag> [options]');
    process.exit(1);
  }

  const stagesIdx = args.indexOf('--stages');
  const stages =
    stagesIdx >= 0 && args[stagesIdx + 1]
      ? parseStages(args[stagesIdx + 1])
      : DEFAULT_STAGES;

  const healthIdx = args.indexOf('--health-check');
  const healthType = healthIdx >= 0 && args[healthIdx + 1] ? args[healthIdx + 1] : 'prometheus';

  const urlIdx = args.indexOf('--url');
  const url = urlIdx >= 0 && args[urlIdx + 1] ? args[urlIdx + 1] : 'http://localhost:9090';

  const errorIdx = args.indexOf('--max-error-rate');
  const maxErrorRate = errorIdx >= 0 && args[errorIdx + 1] ? parseFloat(args[errorIdx + 1]) : 0.05;

  const latencyIdx = args.indexOf('--max-latency');
  const maxLatencyP99 = latencyIdx >= 0 && args[latencyIdx + 1] ? parseFloat(args[latencyIdx + 1]) : undefined;

  const holdIdx = args.indexOf('--hold-time');
  const minHoldTime = holdIdx >= 0 && args[holdIdx + 1] ? parseInt(args[holdIdx + 1], 10) : 300;

  const healthCheck =
    healthType === 'http'
      ? createHttpHealthCheck(url)
      : createPrometheusHealthCheck(url);

  const orchestrator = new RolloutOrchestrator(
    {
      flag: flagName,
      stages,
      defaultCriteria: {
        maxErrorRate,
        maxLatencyP99,
        minHoldTime,
        requiredPassingChecks: 3,
        minRequestCount: 10,
      },
      healthCheck,
    },
    (flag, pct) => {
      console.log(`  → Updated ${flag} rollout to ${pct}%`);
    },
  );

  orchestrator.start().then(() => {
    const state = orchestrator.getState();
    saveState(state);

    if (jsonMode) {
      console.log(JSON.stringify(state, null, 2));
    } else {
      console.log(formatRolloutState(state));
      console.log('');
      console.log(`Stages: ${stages.map((s) => `${s.name}@${s.percentage}%`).join(' → ')}`);
      console.log(`Health: ${healthType} (${url})`);
      console.log(`Max error rate: ${(maxErrorRate * 100).toFixed(1)}%`);
      console.log(`Hold time: ${minHoldTime}s per stage`);
    }
  });
}

function handleRolloutStatus(args: string[], jsonMode: boolean): void {
  const flagName = args[0];

  if (flagName) {
    const state = loadState(flagName);
    if (!state) {
      console.error(`No rollout found for flag: ${flagName}`);
      process.exit(1);
    }

    if (jsonMode) {
      console.log(JSON.stringify(state, null, 2));
    } else {
      console.log(formatRolloutState(state));
    }
  } else {
    if (!existsSync(STATE_FILE)) {
      console.log('No active rollouts.');
      return;
    }

    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Record<string, RolloutState>;
    const flags = Object.keys(data);

    if (flags.length === 0) {
      console.log('No active rollouts.');
      return;
    }

    if (jsonMode) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('Active Rollouts:');
      console.log('═'.repeat(60));
      for (const flag of flags) {
        const s = data[flag];
        const icon = s.status === 'running' ? '🟢' : s.status === 'completed' ? '✅' : s.status === 'rolled-back' ? '🔴' : '⏸️';
        console.log(`  ${icon} ${flag}: ${s.status} — ${s.currentStageName}@${s.currentPercentage}%`);
      }
    }
  }
}

function handleRolloutPromote(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag rollout promote <flag> [--force]');
    process.exit(1);
  }

  const force = args.includes('--force');
  const state = loadState(flagName);
  if (!state) {
    console.error(`No rollout found for flag: ${flagName}`);
    process.exit(1);
  }

  if (state.status !== 'running') {
    console.error(`Cannot promote — rollout status is: ${state.status}`);
    process.exit(1);
  }

  // Simulate promotion by advancing stage
  const nextIndex = state.currentStageIndex + 1;
  if (force || (state.consecutivePassingChecks >= 3)) {
    if (nextIndex >= (state.history.filter((e) => e.type === 'stage-entered').length + 1)) {
      state.status = 'completed';
      state.currentPercentage = 100;
      console.log(`✅ Rollout for ${flagName} completed at 100%`);
    } else {
      state.currentStageIndex = nextIndex;
      state.consecutivePassingChecks = 0;
      state.consecutiveFailingChecks = 0;
      state.stageEnteredAt = Date.now();
      state.history.push({
        type: 'promoted',
        timestamp: Date.now(),
        stageName: state.currentStageName,
        stageIndex: nextIndex,
        percentage: state.currentPercentage,
        message: `Promoted${force ? ' (forced)' : ''}`,
      });
      console.log(`⬆️  Promoted ${flagName} to stage ${nextIndex}`);
    }
    saveState(state);
  } else {
    console.error(`Cannot promote — only ${state.consecutivePassingChecks} passing checks (need 3). Use --force to override.`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
  }
}

function handleRolloutRollback(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag rollout rollback <flag>');
    process.exit(1);
  }

  const state = loadState(flagName);
  if (!state) {
    console.error(`No rollout found for flag: ${flagName}`);
    process.exit(1);
  }

  state.status = 'rolled-back';
  state.currentPercentage = 0;
  state.history.push({
    type: 'rollback',
    timestamp: Date.now(),
    stageName: state.currentStageName,
    stageIndex: state.currentStageIndex,
    percentage: 0,
    message: 'Manual rollback via CLI',
  });

  saveState(state);

  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.log(`🔴 Rolled back ${flagName} to 0%`);
  }
}

function handleRolloutPause(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag rollout pause <flag>');
    process.exit(1);
  }

  const state = loadState(flagName);
  if (!state) {
    console.error(`No rollout found for flag: ${flagName}`);
    process.exit(1);
  }

  if (state.status !== 'running') {
    console.error(`Cannot pause — rollout status is: ${state.status}`);
    process.exit(1);
  }

  state.status = 'paused';
  state.history.push({
    type: 'paused',
    timestamp: Date.now(),
    stageName: state.currentStageName,
    stageIndex: state.currentStageIndex,
    percentage: state.currentPercentage,
    message: 'Paused via CLI',
  });

  saveState(state);

  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.log(`⏸️  Paused ${flagName} at ${state.currentStageName} (${state.currentPercentage}%)`);
  }
}

function handleRolloutResume(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag rollout resume <flag>');
    process.exit(1);
  }

  const state = loadState(flagName);
  if (!state) {
    console.error(`No rollout found for flag: ${flagName}`);
    process.exit(1);
  }

  if (state.status !== 'paused') {
    console.error(`Cannot resume — rollout status is: ${state.status}`);
    process.exit(1);
  }

  state.status = 'running';
  state.history.push({
    type: 'resumed',
    timestamp: Date.now(),
    stageName: state.currentStageName,
    stageIndex: state.currentStageIndex,
    percentage: state.currentPercentage,
    message: 'Resumed via CLI',
  });

  saveState(state);

  if (jsonMode) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.log(`▶️  Resumed ${flagName} at ${state.currentStageName} (${state.currentPercentage}%)`);
  }
}
