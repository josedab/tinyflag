import type { RolloutState } from './progressive-core.js';

export function formatRolloutState(state: RolloutState): string {
  const lines: string[] = [];
  const statusIcons: Record<string, string> = {
    pending: '⏳',
    running: '🟢',
    paused: '⏸️',
    promoting: '⬆️',
    'rolled-back': '🔴',
    completed: '✅',
    error: '❌',
  };

  lines.push(`Progressive Rollout: ${state.flag}`);
  lines.push('═'.repeat(50));
  lines.push(`Status:     ${statusIcons[state.status] || '❓'} ${state.status}`);
  lines.push(
    `Stage:      ${state.currentStageName || '(not started)'} (${state.currentPercentage}%)`,
  );
  lines.push(`Stage idx:  ${state.currentStageIndex + 1}`);
  lines.push(
    `Checks:     ${state.consecutivePassingChecks} passing, ${state.consecutiveFailingChecks} failing`,
  );

  if (state.stageEnteredAt > 0) {
    const holdSec = Math.floor((Date.now() - state.stageEnteredAt) / 1000);
    lines.push(`Hold time:  ${holdSec}s`);
  }

  lines.push('');
  lines.push('Timeline (last 15):');
  for (const event of state.history.slice(-15)) {
    const time = new Date(event.timestamp).toISOString().slice(11, 19);
    lines.push(`  ${time} [${event.stageName || '-'}@${event.percentage}%] ${event.message}`);
  }

  return lines.join('\n');
}
