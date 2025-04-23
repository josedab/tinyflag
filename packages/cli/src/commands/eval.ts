import { readFileSync, writeFileSync } from 'fs';
import {
  parseYaml,
  parseFlagConfig,
  evaluateFlag,
  evaluateWithPersona,
  setEvaluationContext,
  parseReplayLog,
  generateReplayHtmlReport,
} from 'tinyflag';
import type { FlagConfig, UserContext, ReplayDiff } from 'tinyflag';
import { loadAndValidate } from './utils.js';

export function handleEval(args: string[], jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName || flagName.startsWith('-')) {
    console.error('Error: Missing flag name\n');
    console.log(
      'Usage: tinyflag eval <flag> --file <file> [--persona <name>] [--context key=val...]',
    );
    process.exit(1);
  }

  const fileIdx = args.indexOf('--file');
  const filePath = fileIdx !== -1 ? args[fileIdx + 1] : undefined;
  if (!filePath) {
    console.error('Error: Missing --file option\n');
    console.log(
      'Usage: tinyflag eval <flag> --file <file> [--persona <name>] [--context key=val...]',
    );
    process.exit(1);
  }

  const config = loadAndValidate(filePath);
  setEvaluationContext(config.flags);

  const personaIdx = args.indexOf('--persona');
  const personaName = personaIdx !== -1 ? args[personaIdx + 1] : undefined;

  // Build context from --context key=val pairs
  const context: UserContext = {};
  const contextIdx = args.indexOf('--context');
  if (contextIdx !== -1) {
    for (let i = contextIdx + 1; i < args.length; i++) {
      if (args[i].startsWith('--')) break;
      const eqIdx = args[i].indexOf('=');
      if (eqIdx === -1) continue;
      const key = args[i].substring(0, eqIdx);
      const val = args[i].substring(eqIdx + 1);
      context[key] =
        val === 'true' ? true : val === 'false' ? false : isNaN(Number(val)) ? val : Number(val);
    }
  }

  const flag = config.flags[flagName];
  if (!flag) {
    console.error(`Error: Flag "${flagName}" not found`);
    process.exit(1);
  }

  let result: boolean;
  if (personaName) {
    const persona = (config as FlagConfig).personas?.[personaName];
    if (!persona) {
      console.error(`Error: Persona "${personaName}" not found`);
      process.exit(1);
    }
    result = evaluateWithPersona(
      flagName,
      flag,
      persona,
      Object.keys(context).length > 0 ? context : undefined,
    );
  } else {
    result = evaluateFlag(flagName, flag, Object.keys(context).length > 0 ? context : undefined);
  }

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          command: 'eval',
          flag: flagName,
          ...(personaName ? { persona: personaName } : {}),
          context: Object.keys(context).length > 0 ? context : undefined,
          result,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`${result ? '✅' : '❌'} ${flagName} → ${result}`);
  }
}

export function handleReplay(args: string[], jsonMode: boolean): void {
  const logFile = args.find((a) => !a.startsWith('-'));
  if (!logFile) {
    console.error('Error: Missing replay log file\n');
    console.log(
      'Usage: tinyflag replay <log.jsonl> --flags <file> [--at <timestamp>] [--html <output>] [--json]',
    );
    process.exit(1);
  }

  const flagsIdx = args.indexOf('--flags');
  const flagsFile = flagsIdx !== -1 ? args[flagsIdx + 1] : undefined;
  if (!flagsFile) {
    console.error('Error: Missing --flags option\n');
    console.log(
      'Usage: tinyflag replay <log.jsonl> --flags <file> [--at <timestamp>] [--html <output>]',
    );
    process.exit(1);
  }

  const atIdx = args.indexOf('--at');
  const atTimestamp = atIdx !== -1 ? args[atIdx + 1] : undefined;
  const htmlIdx = args.indexOf('--html');
  const htmlOutput = htmlIdx !== -1 ? args[htmlIdx + 1] : undefined;

  let logContent: string;
  try {
    logContent = readFileSync(logFile, 'utf-8');
  } catch {
    console.error(`Error: Cannot read log file "${logFile}"`);
    process.exit(1);
  }

  const entries = parseReplayLog(logContent);
  const config = loadAndValidate(flagsFile);
  setEvaluationContext(config.flags);

  // Filter entries by timestamp if --at is provided
  const filtered = atTimestamp
    ? entries.filter((e) => new Date(e.timestamp).getTime() <= new Date(atTimestamp).getTime())
    : entries;

  // Re-evaluate each entry against current flags
  const diffs: ReplayDiff[] = filtered.map((entry) => {
    const flag = config.flags[entry.flag];
    const replayResult = flag ? evaluateFlag(entry.flag, flag, entry.context) : false;
    return {
      flag: entry.flag,
      context: entry.context,
      originalResult: entry.result,
      replayResult,
      changed: entry.result !== replayResult,
      ...(entry.variant !== undefined ? { originalVariant: entry.variant } : {}),
    };
  });

  const changedCount = diffs.filter((d) => d.changed).length;

  if (htmlOutput) {
    const html = generateReplayHtmlReport(diffs, atTimestamp);
    writeFileSync(htmlOutput, html, 'utf-8');
    console.log(`✅ HTML report written to ${htmlOutput}`);
  }

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          command: 'replay',
          logFile,
          flagsFile,
          ...(atTimestamp ? { at: atTimestamp } : {}),
          totalEntries: filtered.length,
          changed: changedCount,
          diffs: diffs.filter((d) => d.changed),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`🔄 Replay: ${filtered.length} evaluations, ${changedCount} changed\n`);
  if (changedCount > 0) {
    for (const d of diffs.filter((d) => d.changed)) {
      console.log(`  ⚠️  ${d.flag}: ${d.originalResult} → ${d.replayResult}`);
    }
  } else {
    console.log('  ✅ No changes detected — current flags produce identical results.');
  }
}
