import type { FlagDefinition, UserContext } from './types.js';

/** A single replay log entry recording an evaluation decision. */
export interface ReplayLogEntry {
  /** ISO 8601 timestamp of the evaluation. */
  timestamp: string;
  /** Name of the evaluated flag. */
  flag: string;
  /** User context at evaluation time. */
  context: UserContext | undefined;
  /** Evaluation result. */
  result: boolean;
  /** Variant assigned, if any. */
  variant?: string | null;
  /** Git commit hash of the flag file at evaluation time. */
  flagFileCommit?: string;
}

/** Options for the replay recorder middleware. */
export interface ReplayRecorderOptions {
  /** Custom sink for writing log entries. Default: console.log JSONL. */
  sink?: (entry: ReplayLogEntry) => void;
  /** Git commit hash to associate with entries. */
  commit?: string;
}

/**
 * Create a replay recorder that captures evaluation decisions.
 * Attach to TinyFlag via the exposure event or wrap evaluation calls.
 */
export function createReplayRecorder(options: ReplayRecorderOptions = {}): {
  record(
    flagName: string,
    context: UserContext | undefined,
    result: boolean,
    variant?: string | null,
  ): void;
  getEntries(): ReplayLogEntry[];
  toJsonl(): string;
} {
  const entries: ReplayLogEntry[] = [];
  const sink = options.sink;

  return {
    record(flagName, context, result, variant) {
      const entry: ReplayLogEntry = {
        timestamp: new Date().toISOString(),
        flag: flagName,
        context,
        result,
        ...(variant !== undefined ? { variant } : {}),
        ...(options.commit ? { flagFileCommit: options.commit } : {}),
      };
      entries.push(entry);
      if (sink) sink(entry);
    },

    getEntries() {
      return entries;
    },

    toJsonl() {
      return entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
    },
  };
}

/** Parse a JSONL replay log into entries. */
export function parseReplayLog(jsonl: string): ReplayLogEntry[] {
  return jsonl
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ReplayLogEntry);
}

/** Result of replaying evaluations at a point in time. */
export interface ReplayDiff {
  flag: string;
  context: UserContext | undefined;
  originalResult: boolean;
  replayResult: boolean;
  changed: boolean;
  originalVariant?: string | null;
  replayVariant?: string | null;
}

/** Generate an HTML report for replay diffs. */
export function generateReplayHtmlReport(diffs: ReplayDiff[], replayTimestamp?: string): string {
  const changedDiffs = diffs.filter((d) => d.changed);
  const unchangedCount = diffs.length - changedDiffs.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TinyFlag Replay Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #333; }
    h1 { border-bottom: 2px solid #0066cc; padding-bottom: 0.5rem; }
    .summary { background: #f5f5f5; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .summary .stat { display: inline-block; margin-right: 2rem; }
    .stat .value { font-size: 2rem; font-weight: bold; }
    .stat .label { color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid #ddd; }
    th { background: #f0f0f0; font-weight: 600; }
    .changed { background: #fff3cd; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 500; }
    .badge-true { background: #d4edda; color: #155724; }
    .badge-false { background: #f8d7da; color: #721c24; }
    .badge-changed { background: #fff3cd; color: #856404; }
    code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>🔄 TinyFlag Replay Report</h1>
  ${replayTimestamp ? `<p>Replay timestamp: <code>${replayTimestamp}</code></p>` : ''}

  <div class="summary">
    <div class="stat"><div class="value">${diffs.length}</div><div class="label">Total evaluations</div></div>
    <div class="stat"><div class="value">${changedDiffs.length}</div><div class="label">Changed</div></div>
    <div class="stat"><div class="value">${unchangedCount}</div><div class="label">Unchanged</div></div>
  </div>

  ${
    changedDiffs.length > 0
      ? `
  <h2>⚠️ Changed Evaluations</h2>
  <table>
    <thead><tr><th>Flag</th><th>Original</th><th>Replay</th><th>Context</th></tr></thead>
    <tbody>
      ${changedDiffs
        .map(
          (d) => `
      <tr class="changed">
        <td><code>${d.flag}</code></td>
        <td><span class="badge badge-${d.originalResult}">${d.originalResult}</span></td>
        <td><span class="badge badge-${d.replayResult}">${d.replayResult}</span></td>
        <td><code>${d.context ? JSON.stringify(d.context) : 'none'}</code></td>
      </tr>`,
        )
        .join('')}
    </tbody>
  </table>`
      : '<p>✅ No evaluation changes detected.</p>'
  }

  <footer style="margin-top:2rem;color:#999;font-size:0.85em;">Generated by TinyFlag Replay at ${new Date().toISOString()}</footer>
</body>
</html>`;
}
