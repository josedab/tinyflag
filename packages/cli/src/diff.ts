import type { FlagConfig, FlagDefinition } from 'tinyflag';

export interface FlagChange {
  name: string;
  type: 'added' | 'removed' | 'modified';
  details?: string[];
}

/** Compare two flag configs and return a list of changes. */
export function diffConfigs(before: FlagConfig, after: FlagConfig): FlagChange[] {
  const changes: FlagChange[] = [];
  const allNames = new Set([...Object.keys(before.flags), ...Object.keys(after.flags)]);

  for (const name of [...allNames].sort()) {
    const prev = before.flags[name];
    const curr = after.flags[name];

    if (!prev && curr) {
      const details = [`enabled: ${curr.enabled}`];
      if (curr.rollout !== undefined) details.push(`rollout: ${curr.rollout}%`);
      changes.push({ name, type: 'added', details });
    } else if (prev && !curr) {
      changes.push({ name, type: 'removed' });
    } else if (prev && curr) {
      const details = diffFlag(prev, curr);
      if (details.length > 0) {
        changes.push({ name, type: 'modified', details });
      }
    }
  }

  return changes;
}

function diffFlag(before: FlagDefinition, after: FlagDefinition): string[] {
  const details: string[] = [];

  if (before.enabled !== after.enabled) {
    details.push(`enabled: ${before.enabled} → ${after.enabled}`);
  }
  if (before.rollout !== after.rollout) {
    details.push(`rollout: ${before.rollout ?? 'none'}% → ${after.rollout ?? 'none'}%`);
  }
  if (before.description !== after.description) {
    details.push(`description changed`);
  }
  if (JSON.stringify(before.tags) !== JSON.stringify(after.tags)) {
    details.push(`tags changed`);
  }
  if (JSON.stringify(before.rules) !== JSON.stringify(after.rules)) {
    details.push(`rules changed`);
  }
  if (JSON.stringify(before.variants) !== JSON.stringify(after.variants)) {
    details.push(`variants changed`);
  }

  return details;
}

/** Format changes into a human-readable string. */
export function formatChanges(changes: FlagChange[], fromRef?: string, toRef?: string): string {
  if (changes.length === 0) return 'No flag changes.';

  const header = fromRef && toRef ? `🚩 Flag changes (${fromRef} → ${toRef}):` : '🚩 Flag changes:';
  const lines = [header];
  for (const change of changes) {
    switch (change.type) {
      case 'added':
        lines.push(`  + ${change.name} (${change.details?.join(', ')})`);
        break;
      case 'removed':
        lines.push(`  - ${change.name} (removed)`);
        break;
      case 'modified':
        lines.push(`  ~ ${change.name}:`);
        for (const detail of change.details ?? []) {
          lines.push(`      ${detail}`);
        }
        break;
    }
  }
  return lines.join('\n');
}

/** Format changes as a GitHub PR comment body. */
export function formatChangesMarkdown(changes: FlagChange[]): string {
  if (changes.length === 0) return '';

  const lines = ['## 🚩 Flag changes detected\n'];
  for (const change of changes) {
    switch (change.type) {
      case 'added':
        lines.push(`- **+** \`${change.name}\` added (${change.details?.join(', ')})`);
        break;
      case 'removed':
        lines.push(`- **-** \`${change.name}\` removed`);
        break;
      case 'modified':
        lines.push(`- **~** \`${change.name}\`: ${change.details?.join('; ')}`);
        break;
    }
  }
  return lines.join('\n');
}
