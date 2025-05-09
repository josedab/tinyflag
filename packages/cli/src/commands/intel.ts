import { readFileSync, existsSync } from 'fs';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import {
  suggestRolloutPercentage,
  detectAnomalies,
  suggestCleanup,
  formatRecommendations,
  formatAnomalies,
  formatCleanupSuggestions,
} from 'tinyflag';
import type { EvalEvent } from 'tinyflag';

function loadEvents(eventsFile: string): EvalEvent[] {
  if (!existsSync(eventsFile)) return [];
  try {
    const content = readFileSync(eventsFile, 'utf8');
    // Support JSONL format (one event per line)
    if (content.trim().startsWith('[')) {
      return JSON.parse(content) as EvalEvent[];
    }
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EvalEvent);
  } catch {
    return [];
  }
}

export function handleIntel(args: string[], jsonMode: boolean): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    console.log(`Usage: tinyflag intel <subcommand> [options]

Subcommands:
  suggest              Suggest optimal rollout percentages
  anomalies            Detect anomalies correlated with flag changes
  cleanup              Suggest flags for cleanup

Options:
  --flags <file>       Flag config file (default: flags.yml)
  --events <file>      Evaluation events file (JSONL or JSON array)
  --flag <name>        Analyze a specific flag
  --window <hours>     Analysis window in hours (default: 24)`);
    return;
  }

  const flagsIdx = args.indexOf('--flags');
  const flagsFile = flagsIdx >= 0 && args[flagsIdx + 1] ? args[flagsIdx + 1] : 'flags.yml';

  const eventsIdx = args.indexOf('--events');
  const eventsFile = eventsIdx >= 0 && args[eventsIdx + 1] ? args[eventsIdx + 1] : '.tinyflag-events.jsonl';

  const flagIdx = args.indexOf('--flag');
  const flagFilter = flagIdx >= 0 && args[flagIdx + 1] ? args[flagIdx + 1] : undefined;

  const windowIdx = args.indexOf('--window');
  const windowHours = windowIdx >= 0 && args[windowIdx + 1] ? parseInt(args[windowIdx + 1], 10) : 24;

  if (!existsSync(flagsFile)) {
    console.error(`Error: Flags file not found: ${flagsFile}`);
    process.exit(1);
  }

  const content = readFileSync(flagsFile, 'utf8');
  const raw = parseYaml(content);
  const config = parseFlagConfig(raw);
  const events = loadEvents(eventsFile);

  switch (subcommand) {
    case 'suggest': {
      const flags = flagFilter ? [flagFilter] : Object.keys(config.flags);
      const recommendations = flags
        .filter((f) => config.flags[f])
        .map((f) => suggestRolloutPercentage(f, config.flags[f], events));

      if (jsonMode) {
        console.log(JSON.stringify(recommendations, null, 2));
      } else {
        if (events.length === 0) {
          console.log('⚠️  No evaluation events found. Provide events via --events <file>');
          console.log('   Events file should be JSONL with {flag, enabled, userId, timestamp, errorOccurred?, latencyMs?}');
          console.log('');
        }
        console.log(formatRecommendations(recommendations));
      }
      break;
    }

    case 'anomalies': {
      const flags = flagFilter ? [flagFilter] : Object.keys(config.flags);
      const windowMs = windowHours * 3600 * 1000;
      const allAnomalies = flags.flatMap((f) => detectAnomalies(f, events, windowMs));

      if (jsonMode) {
        console.log(JSON.stringify(allAnomalies, null, 2));
      } else {
        if (events.length === 0) {
          console.log('⚠️  No evaluation events found. Provide events via --events <file>');
          console.log('');
        }
        console.log(formatAnomalies(allAnomalies));
      }
      break;
    }

    case 'cleanup': {
      const suggestions = suggestCleanup(config, events);

      if (jsonMode) {
        console.log(JSON.stringify(suggestions, null, 2));
      } else {
        console.log(formatCleanupSuggestions(suggestions));
      }
      break;
    }

    default:
      console.error(`Unknown intel subcommand: ${subcommand}`);
      process.exit(1);
  }
}
