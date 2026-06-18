import type { FlagDefinition } from 'tinyflag';
import { scanSourceFiles } from './source-scanner.js';

const FLAG_USAGE_PATTERN =
  /(?:isEnabled|getVariant|useFlag|getConfig)\s*\(\s*['"]([a-z0-9-]+)['"]/g;
const TINYFLAG_IGNORE_PATTERN = /\/\/\s*tinyflag-ignore/;

/** Configuration for staleness rules. */
export interface StalenessConfig {
  /** Days without code references before a flag is considered stale. Default: 30. */
  noReferenceDays?: number;
  /** Days with zero rollout before a flag is considered stale. Default: 14. */
  zeroRolloutDays?: number;
  /** Flag lifecycle states that should be flagged as stale. Default: ['sunset']. */
  staleLifecycleStates?: string[];
  /** Exclude flags with these tags from staleness analysis. */
  excludeTags?: string[];
}

export interface StaleReport {
  /** Flags defined in config but not referenced in code. */
  unusedFlags: string[];
  /** Flag names referenced in code but not defined in config. */
  undefinedRefs: Array<{ flag: string; file: string; line: number }>;
  /** Flags with rollout: 0 that are still enabled. */
  zeroRolloutFlags: string[];
  /** Flags in sunset state past their sunset date. */
  pastSunsetFlags?: Array<{ flag: string; sunsetAt: string; daysPast: number }>;
  /** Flags that are candidates for archival. */
  archivalCandidates?: Array<{ flag: string; reason: string }>;
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
  for (const file of scanSourceFiles(dir, { excludeDirectories: excludeDirs })) {
    scanFile(file.path, file.content, usages);
  }
  return usages;
}

function scanFile(
  filePath: string,
  content: string,
  usages: Map<string, Array<{ file: string; line: number }>>,
): void {
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
  definedFlags: Record<
    string,
    {
      enabled: boolean;
      rollout?: number | unknown;
      lifecycle?: { state: string; sunsetAt?: string };
      tags?: readonly string[];
    }
  >,
  codeUsages: Map<string, Array<{ file: string; line: number }>>,
  stalenessConfig?: StalenessConfig,
): StaleReport {
  const config = stalenessConfig || {};
  const excludeTags = new Set(config.excludeTags || []);
  const definedNames = new Set(Object.keys(definedFlags));
  const referencedNames = new Set(codeUsages.keys());

  // Filter out excluded tags
  const filteredNames = [...definedNames].filter((name) => {
    const flag = definedFlags[name];
    if (flag.tags) {
      for (const tag of flag.tags) {
        if (excludeTags.has(tag)) return false;
      }
    }
    return true;
  });

  // Flags defined but not used in code
  const unusedFlags = filteredNames.filter((name) => !referencedNames.has(name)).sort();

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
    .filter(([name, def]) => {
      if (!filteredNames.includes(name)) return false;
      return def.enabled && def.rollout === 0;
    })
    .map(([name]) => name)
    .sort();

  // Check for flags past their sunset date
  const pastSunsetFlags: Array<{ flag: string; sunsetAt: string; daysPast: number }> = [];
  const archivalCandidates: Array<{ flag: string; reason: string }> = [];
  const now = Date.now();

  for (const name of filteredNames) {
    const flag = definedFlags[name];

    if (flag.lifecycle?.state === 'sunset' && flag.lifecycle.sunsetAt) {
      const sunsetDate = new Date(flag.lifecycle.sunsetAt).getTime();
      if (!isNaN(sunsetDate) && sunsetDate < now) {
        const daysPast = Math.floor((now - sunsetDate) / (1000 * 60 * 60 * 24));
        pastSunsetFlags.push({ flag: name, sunsetAt: flag.lifecycle.sunsetAt, daysPast });
        archivalCandidates.push({ flag: name, reason: `Sunset ${daysPast} day(s) ago` });
      }
    }

    // Archived but still has code references
    if (flag.lifecycle?.state === 'archived' && referencedNames.has(name)) {
      archivalCandidates.push({
        flag: name,
        reason: 'Archived but still has code references — run codemod',
      });
    }

    // Unused + enabled for a long time = cleanup candidate
    if (!referencedNames.has(name) && flag.enabled && !flag.lifecycle) {
      archivalCandidates.push({ flag: name, reason: 'Enabled but not referenced in code' });
    }
  }

  return {
    unusedFlags,
    undefinedRefs,
    zeroRolloutFlags,
    pastSunsetFlags: pastSunsetFlags.length > 0 ? pastSunsetFlags : undefined,
    archivalCandidates: archivalCandidates.length > 0 ? archivalCandidates : undefined,
  };
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

  if (report.pastSunsetFlags && report.pastSunsetFlags.length > 0) {
    lines.push('🌅 Past sunset flags (sunset date has passed):');
    for (const item of report.pastSunsetFlags) {
      lines.push(`  - ${item.flag}: sunset ${item.daysPast} day(s) ago (${item.sunsetAt})`);
    }
    lines.push('');
  }

  if (report.archivalCandidates && report.archivalCandidates.length > 0) {
    lines.push('📦 Archival candidates:');
    for (const item of report.archivalCandidates) {
      lines.push(`  - ${item.flag}: ${item.reason}`);
    }
    lines.push('');
  }

  if (lines.length === 0) {
    return '✅ No stale flags detected.';
  }

  const total =
    report.unusedFlags.length +
    report.undefinedRefs.length +
    report.zeroRolloutFlags.length +
    (report.pastSunsetFlags?.length || 0) +
    (report.archivalCandidates?.length || 0);
  lines.push(`Found ${total} issue(s).`);
  return lines.join('\n');
}
