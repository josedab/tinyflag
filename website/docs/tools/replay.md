---
sidebar_position: 8
title: Replay & Debugging
description: Record and replay flag evaluations to detect regressions when flag definitions change.
---

# Replay & Debugging

TinyFlag's replay system records flag evaluation decisions and replays them against new flag configurations to detect behavioral regressions before they reach production.

## Recording Evaluations

```typescript
import { TinyFlag, createReplayRecorder } from 'tinyflag';

const ff = new TinyFlag({ source: './flags.yml' });
await ff.init();

const recorder = createReplayRecorder({
  commit: 'abc123', // optional: associate with a git commit
});

// Record evaluations
ff.on('exposure', (event) => {
  recorder.record(event.flag, { userId: event.userId }, event.enabled, event.variant);
});

// ... run your application ...

// Export as JSONL
const jsonl = recorder.toJsonl();
fs.writeFileSync('./replay-log.jsonl', jsonl);
```

## Parsing Replay Logs

```typescript
import { parseReplayLog } from 'tinyflag';

const entries = parseReplayLog(fs.readFileSync('./replay-log.jsonl', 'utf-8'));
console.log(`${entries.length} evaluations recorded`);
```

Each entry contains:

```typescript
interface ReplayLogEntry {
  timestamp: string; // ISO 8601
  flag: string; // Flag name
  context: UserContext; // User context at evaluation time
  result: boolean; // Original evaluation result
  variant?: string | null; // Variant assignment
  flagFileCommit?: string; // Git commit hash
}
```

## Generating HTML Reports

Visualize evaluation diffs as an HTML report:

```typescript
import { generateReplayHtmlReport } from 'tinyflag';
import type { ReplayDiff } from 'tinyflag';

const diffs: ReplayDiff[] = entries.map((entry) => ({
  flag: entry.flag,
  context: entry.context,
  originalResult: entry.result,
  replayResult: ff.isEnabled(entry.flag, entry.context), // re-evaluate with new flags
  changed: entry.result !== ff.isEnabled(entry.flag, entry.context),
}));

const html = generateReplayHtmlReport(diffs, new Date().toISOString());
fs.writeFileSync('./replay-report.html', html);
```

The report shows total evaluations, changed evaluations, and unchanged evaluations with a color-coded table.

## Use Cases

- **Pre-deploy validation**: Record production evaluations, then replay against the new flag file to catch regressions
- **Flag change review**: Generate a diff report for PR reviews showing which users would be affected
- **Debugging**: Replay a specific user's evaluation path to understand why they saw a particular experience
