import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const FLAG_USAGE_PATTERN = /(?:isEnabled|getVariant)\s*\(\s*['"]([a-z0-9-]+)['"]/g;
const TINYFLAG_IGNORE_PATTERN = /\/\/\s*tinyflag-ignore/;

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export interface StaleReport {
  /** Flags defined in config but not referenced in code. */
  unusedFlags: string[];
  /** Flag names referenced in code but not defined in config. */
  undefinedRefs: Array<{ flag: string; file: string; line: number }>;
  /** Flags with rollout: 0 that are still enabled. */
  zeroRolloutFlags: string[];
}

/**
 * Scan a directory tree for flag references in TypeScript/JavaScript files.
 * Falls back to regex-based scanning (no AST parser dependency needed).
 */
export function scanFlagUsage(
  dir: string,
  excludeDirs: Set<string> = new Set([
    'node_modules',
    'dist',
    '.git',
    'coverage',
    '.next',
    'build',
  ]),
): Map<string, Array<{ file: string; line: number }>> {
  const usages = new Map<string, Array<{ file: string; line: number }>>();

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (excludeDirs.has(entry)) continue;
      const fullPath = join(currentDir, entry);

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && SCANNABLE_EXTENSIONS.has(extname(entry))) {
        scanFile(fullPath, usages);
      }
    }
  }

  walk(dir);
  return usages;
}

function scanFile(
  filePath: string,
  usages: Map<string, Array<{ file: string; line: number }>>,
): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for tinyflag-ignore comment on previous line or same line
    if (TINYFLAG_IGNORE_PATTERN.test(line)) continue;
    if (i > 0 && TINYFLAG_IGNORE_PATTERN.test(lines[i - 1])) continue;

    let match: RegExpExecArray | null;
    const linePattern = new RegExp(FLAG_USAGE_PATTERN.source, 'g');
    while ((match = linePattern.exec(line)) !== null) {
      const flagName = match[1];
      if (!usages.has(flagName)) {
        usages.set(flagName, []);
      }
      usages.get(flagName)!.push({ file: filePath, line: i + 1 });
    }
  }
}

/**
 * Generate a stale flag report by cross-referencing definitions vs code usage.
 */
export function generateStaleReport(
  definedFlags: Record<string, { enabled: boolean; rollout?: number }>,
  codeUsages: Map<string, Array<{ file: string; line: number }>>,
): StaleReport {
  const definedNames = new Set(Object.keys(definedFlags));
  const referencedNames = new Set(codeUsages.keys());

  // Flags defined but not used in code
  const unusedFlags = [...definedNames].filter((name) => !referencedNames.has(name)).sort();

  // Flags referenced in code but not defined
  const undefinedRefs: Array<{ flag: string; file: string; line: number }> = [];
  for (const [flag, locations] of codeUsages) {
    if (!definedNames.has(flag)) {
      for (const loc of locations) {
        undefinedRefs.push({ flag, file: loc.file, line: loc.line });
      }
    }
  }

  // Flags with rollout: 0 that are enabled
  const zeroRolloutFlags = Object.entries(definedFlags)
    .filter(([, def]) => def.enabled && def.rollout === 0)
    .map(([name]) => name)
    .sort();

  return { unusedFlags, undefinedRefs, zeroRolloutFlags };
}

/**
 * Format a stale report for human-readable CLI output.
 */
export function formatStaleReport(report: StaleReport): string {
  const lines: string[] = [];

  if (report.unusedFlags.length > 0) {
    lines.push('🗑️  Unused flags (defined but not referenced in code):');
    for (const flag of report.unusedFlags) {
      lines.push(`  - ${flag}`);
    }
    lines.push('');
  }

  if (report.undefinedRefs.length > 0) {
    lines.push('⚠️  Undefined references (used in code but not defined):');
    for (const ref of report.undefinedRefs) {
      lines.push(`  - "${ref.flag}" at ${ref.file}:${ref.line}`);
    }
    lines.push('');
  }

  if (report.zeroRolloutFlags.length > 0) {
    lines.push('📊 Zero-rollout flags (enabled but rollout: 0):');
    for (const flag of report.zeroRolloutFlags) {
      lines.push(`  - ${flag}`);
    }
    lines.push('');
  }

  if (lines.length === 0) {
    return '✅ No stale flags detected.';
  }

  const total =
    report.unusedFlags.length + report.undefinedRefs.length + report.zeroRolloutFlags.length;
  lines.push(`Found ${total} issue(s).`);
  return lines.join('\n');
}
