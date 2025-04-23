import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { parseYaml, parseFlagConfig } from 'tinyflag';

interface AuditLogEntry {
  hash: string;
  author: string;
  date: string;
  subject: string;
  changes: { flag: string; action: 'added' | 'removed' | 'modified'; summary: string }[];
}

function parseGitAuditLog(gitLog: string, filePath: string): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  const commits = gitLog.split(/^COMMIT:/m).filter(Boolean);

  for (const commit of commits) {
    const headerEnd = commit.indexOf('\n');
    if (headerEnd === -1) continue;

    const header = commit.substring(0, headerEnd);
    const [hash, author, date, ...subjectParts] = header.split('|');
    const subject = subjectParts.join('|');
    const diff = commit.substring(headerEnd + 1);

    const changes: AuditLogEntry['changes'] = [];

    const addedFlags = new Set<string>();
    const removedFlags = new Set<string>();

    for (const line of diff.split('\n')) {
      // Look for flag-level changes in YAML diff
      const addMatch = line.match(/^\+\s{2}([\w-]+):\s*$/);
      const removeMatch = line.match(/^-\s{2}([\w-]+):\s*$/);

      if (addMatch) addedFlags.add(addMatch[1]);
      if (removeMatch) removedFlags.add(removeMatch[1]);
    }

    for (const flag of addedFlags) {
      if (removedFlags.has(flag)) {
        changes.push({ flag, action: 'modified', summary: 'definition changed' });
        removedFlags.delete(flag);
      } else {
        changes.push({ flag, action: 'added', summary: 'flag created' });
      }
    }
    for (const flag of removedFlags) {
      changes.push({ flag, action: 'removed', summary: 'flag deleted' });
    }

    // Detect inline property changes (enabled, rollout, etc.)
    const enabledChanges = diff.match(/^[+-]\s{4}enabled:\s*(true|false)/gm);
    const rolloutChanges = diff.match(/^[+-]\s{4}rollout:\s*\d+/gm);

    if (enabledChanges && changes.length === 0) {
      changes.push({ flag: '(flags)', action: 'modified', summary: 'enabled state changed' });
    }
    if (rolloutChanges && changes.length === 0) {
      changes.push({ flag: '(flags)', action: 'modified', summary: 'rollout percentage changed' });
    }

    if (changes.length === 0 && diff.trim()) {
      changes.push({ flag: filePath, action: 'modified', summary: 'file modified' });
    }

    entries.push({ hash, author, date, subject, changes });
  }

  return entries;
}

export function handleAudit(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag audit <file> [--json]');
    process.exit(1);
  }

  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  } catch {
    console.error('Error: Not inside a git repository. The audit command requires git.');
    process.exit(1);
  }

  let gitLog: string;
  try {
    gitLog = execSync(`git log --follow --format="COMMIT:%H|%an|%aI|%s" -p -- "${filePath}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    console.error(`Error: Could not read git history for "${filePath}".`);
    process.exit(1);
  }

  const entries = parseGitAuditLog(gitLog, filePath);

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'audit', file: filePath, entries }, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log(`No git history found for ${filePath}`);
    return;
  }

  console.log(`📋 Flag change history for ${filePath}\n`);
  for (const entry of entries) {
    console.log(`  ${entry.date}  ${entry.hash.slice(0, 7)}  ${entry.author}`);
    console.log(`  ${entry.subject}`);
    for (const change of entry.changes) {
      const icon = change.action === 'added' ? '🆕' : change.action === 'removed' ? '🗑️' : '✏️';
      console.log(`    ${icon} ${change.flag}: ${change.summary}`);
    }
    console.log();
  }
}
