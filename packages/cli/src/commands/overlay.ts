import { readFileSync } from 'fs';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import { applyOverlay, cleanupExpiredOverlays, listActiveOverlays } from '../ephemeral.js';

export function handleOverlay(args: string[], jsonMode: boolean): void {
  const subCommand = args[0];

  if (subCommand === 'list') {
    const dir = args[1] || '.';
    const overlays = listActiveOverlays(dir);
    if (jsonMode) {
      console.log(JSON.stringify(overlays, null, 2));
    } else if (overlays.length === 0) {
      console.log('No active overlays.');
    } else {
      for (const overlay of overlays) {
        console.log(
          `📌 ${overlay.scope} (${overlay.overrides.length} override${overlay.overrides.length !== 1 ? 's' : ''})`,
        );
        console.log(`   Expires: ${overlay.expiresAt}`);
        for (const o of overlay.overrides) {
          const parts: string[] = [o.flag];
          if (o.enabled !== undefined) parts.push(`enabled=${o.enabled}`);
          if (o.rollout !== undefined) parts.push(`rollout=${o.rollout}`);
          if (o.variant) parts.push(`variant=${o.variant}`);
          console.log(`   • ${parts.join(' ')}`);
        }
        console.log('');
      }
    }
  } else if (subCommand === 'apply') {
    const flagFile = args[1];
    const dirIdx = args.indexOf('--dir');
    const dir = dirIdx >= 0 && args[dirIdx + 1] ? args[dirIdx + 1] : '.';

    if (!flagFile) {
      console.error('Usage: tinyflag overlay apply <flags-file> --dir <overlay-dir>');
      process.exit(1);
    }

    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content);
    let config = parseFlagConfig(raw);

    const overlays = listActiveOverlays(dir);
    for (const overlay of overlays) {
      config = { ...config, ...applyOverlay(config, overlay) };
    }

    if (jsonMode) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log(`✅ Applied ${overlays.length} overlay(s) to ${flagFile}`);
      console.log(JSON.stringify(config.flags, null, 2));
    }
  } else if (subCommand === 'cleanup') {
    const dir = args[1] || '.';
    const removed = cleanupExpiredOverlays(dir);
    if (jsonMode) {
      console.log(JSON.stringify({ removed }, null, 2));
    } else if (removed.length === 0) {
      console.log('No expired overlays to clean up.');
    } else {
      console.log(`🗑️  Removed ${removed.length} expired overlay(s):`);
      for (const r of removed) console.log(`  - ${r}`);
    }
  } else {
    console.error('Usage: tinyflag overlay <list|apply|cleanup> [options]');
    process.exit(1);
  }
}
