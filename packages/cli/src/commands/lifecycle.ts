import type { FlagDefinition } from 'tinyflag';
import { loadAndValidate } from './utils.js';

export function handleLifecycle(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag lifecycle <file> [--json]');
    process.exit(1);
  }

  const config = loadAndValidate(filePath);
  const distribution: Record<string, string[]> = {
    draft: [],
    active: [],
    sunset: [],
    archived: [],
    unset: [],
  };

  for (const [name, flag] of Object.entries(config.flags)) {
    const state =
      (flag as FlagDefinition & { lifecycle?: { state: string } }).lifecycle?.state ?? 'unset';
    (distribution[state] ??= []).push(name);
  }

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'lifecycle', distribution }, null, 2));
    return;
  }

  console.log('📊 Flag lifecycle distribution:\n');
  for (const [state, flags] of Object.entries(distribution)) {
    if (flags.length === 0) continue;
    const icon =
      state === 'active'
        ? '🟢'
        : state === 'draft'
          ? '📝'
          : state === 'sunset'
            ? '🌅'
            : state === 'archived'
              ? '📦'
              : '⚪';
    console.log(`  ${icon} ${state}: ${flags.length} flag(s)`);
    for (const f of flags) {
      console.log(`     - ${f}`);
    }
  }
}
