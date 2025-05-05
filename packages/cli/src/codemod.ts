import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, extname, relative } from 'path';
import type { FlagConfig, FlagDefinition } from 'tinyflag';

/** A code location referencing a flag. */
export interface FlagCodeReference {
  flag: string;
  file: string;
  line: number;
  column: number;
  type: 'isEnabled' | 'getVariant' | 'useFlag' | 'getConfig';
  fullMatch: string;
}

/** Result of a codemod transform. */
export interface CodemodResult {
  file: string;
  original: string;
  transformed: string;
  changes: CodemodChange[];
}

/** A single codemod change. */
export interface CodemodChange {
  line: number;
  type: 'remove-branch' | 'replace-variant' | 'inline-config' | 'remove-call';
  description: string;
  before: string;
  after: string;
}

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.next', 'build']);

// Patterns for finding flag usage
const FLAG_PATTERNS = [
  { regex: /(?:ff|flags|tinyflag|featureFlags)\s*\.\s*isEnabled\s*\(\s*['"]([a-z0-9-]+)['"]\s*(?:,\s*[^)]+)?\s*\)/g, type: 'isEnabled' as const },
  { regex: /(?:ff|flags|tinyflag|featureFlags)\s*\.\s*getVariant\s*\(\s*['"]([a-z0-9-]+)['"]\s*(?:,\s*[^)]+)?\s*\)/g, type: 'getVariant' as const },
  { regex: /useFlag\s*\(\s*['"]([a-z0-9-]+)['"]\s*\)/g, type: 'useFlag' as const },
  { regex: /(?:ff|flags|tinyflag|featureFlags)\s*\.\s*getConfig\s*(?:<[^>]+>)?\s*\(\s*['"]([a-z0-9-]+)['"]\s*(?:,\s*[^)]+)?\s*\)/g, type: 'getConfig' as const },
];

/**
 * Walk a directory and find all flag references in TypeScript/JavaScript files.
 */
export function findFlagReferences(
  dir: string,
  excludeDirs: Set<string> = EXCLUDE_DIRS,
): FlagCodeReference[] {
  const refs: FlagCodeReference[] = [];

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
        scanFileForRefs(fullPath, refs);
      }
    }
  }

  walk(dir);
  return refs;
}

function scanFileForRefs(filePath: string, refs: FlagCodeReference[]): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FLAG_PATTERNS) {
      const regex = new RegExp(pattern.regex.source, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        refs.push({
          flag: match[1],
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          type: pattern.type,
          fullMatch: match[0],
        });
      }
    }
  }
}

/**
 * Transform code by removing dead branches for boolean flags that are fully rolled out or archived.
 */
export function transformFile(
  filePath: string,
  config: FlagConfig,
  options: {
    archivedFlags?: Set<string>;
    fullyRolledOutFlags?: Set<string>;
    winnerVariants?: Map<string, string>;
    dryRun?: boolean;
  } = {},
): CodemodResult | null {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  const changes: CodemodChange[] = [];
  const transformedLines = [...lines];

  const archivedFlags = options.archivedFlags ?? new Set(
    Object.entries(config.flags)
      .filter(([, def]) => def.lifecycle?.state === 'archived')
      .map(([name]) => name),
  );

  const fullyRolledOut = options.fullyRolledOutFlags ?? new Set(
    Object.entries(config.flags)
      .filter(([, def]) => def.enabled && (def.rollout === undefined || def.rollout === 100) && !def.rules?.length)
      .map(([name]) => name),
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle isEnabled() calls for archived flags → replace with `false`
    for (const flagName of archivedFlags) {
      const isEnabledPattern = new RegExp(
        `(?:ff|flags|tinyflag|featureFlags)\\s*\\.\\s*isEnabled\\s*\\(\\s*['"]${escapeRegex(flagName)}['"]\\s*(?:,\\s*[^)]+)?\\s*\\)`,
        'g',
      );
      if (isEnabledPattern.test(line)) {
        const newLine = line.replace(isEnabledPattern, 'false');
        if (newLine !== line) {
          changes.push({
            line: i + 1,
            type: 'remove-branch',
            description: `Replace archived flag "${flagName}" with false`,
            before: line.trim(),
            after: newLine.trim(),
          });
          transformedLines[i] = newLine;
        }
      }
    }

    // Handle isEnabled() calls for fully rolled out flags → replace with `true`
    for (const flagName of fullyRolledOut) {
      const isEnabledPattern = new RegExp(
        `(?:ff|flags|tinyflag|featureFlags)\\s*\\.\\s*isEnabled\\s*\\(\\s*['"]${escapeRegex(flagName)}['"]\\s*(?:,\\s*[^)]+)?\\s*\\)`,
        'g',
      );
      if (isEnabledPattern.test(transformedLines[i])) {
        const newLine = transformedLines[i].replace(isEnabledPattern, 'true');
        if (newLine !== transformedLines[i]) {
          changes.push({
            line: i + 1,
            type: 'remove-branch',
            description: `Replace fully rolled-out flag "${flagName}" with true`,
            before: transformedLines[i].trim(),
            after: newLine.trim(),
          });
          transformedLines[i] = newLine;
        }
      }
    }

    // Handle getVariant() for flags with declared winner
    if (options.winnerVariants) {
      for (const [flagName, winner] of options.winnerVariants) {
        const getVariantPattern = new RegExp(
          `(?:ff|flags|tinyflag|featureFlags)\\s*\\.\\s*getVariant\\s*\\(\\s*['"]${escapeRegex(flagName)}['"]\\s*(?:,\\s*[^)]+)?\\s*\\)`,
          'g',
        );
        if (getVariantPattern.test(transformedLines[i])) {
          const newLine = transformedLines[i].replace(getVariantPattern, `'${winner}'`);
          if (newLine !== transformedLines[i]) {
            changes.push({
              line: i + 1,
              type: 'replace-variant',
              description: `Replace getVariant("${flagName}") with winner "${winner}"`,
              before: transformedLines[i].trim(),
              after: newLine.trim(),
            });
            transformedLines[i] = newLine;
          }
        }
      }
    }
  }

  if (changes.length === 0) return null;

  const transformed = transformedLines.join('\n');

  if (!options.dryRun) {
    writeFileSync(filePath, transformed, 'utf-8');
  }

  return {
    file: filePath,
    original: content,
    transformed,
    changes,
  };
}

/**
 * Run codemod across a directory.
 */
export function runCodemod(
  dir: string,
  config: FlagConfig,
  options: {
    archivedOnly?: boolean;
    dryRun?: boolean;
    winnerVariants?: Map<string, string>;
  } = {},
): CodemodResult[] {
  const results: CodemodResult[] = [];

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (EXCLUDE_DIRS.has(entry)) continue;
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
        const archivedFlags = options.archivedOnly
          ? new Set(
              Object.entries(config.flags)
                .filter(([, def]) => def.lifecycle?.state === 'archived')
                .map(([name]) => name),
            )
          : undefined;

        const result = transformFile(fullPath, config, {
          dryRun: options.dryRun,
          archivedFlags: archivedFlags,
          fullyRolledOutFlags: options.archivedOnly ? new Set() : undefined,
          winnerVariants: options.winnerVariants,
        });
        if (result) results.push(result);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Check if any archived flags still have code references (for CI).
 */
export function checkArchivedFlagRefs(
  dir: string,
  config: FlagConfig,
): { clean: boolean; staleRefs: FlagCodeReference[] } {
  const archivedFlags = new Set(
    Object.entries(config.flags)
      .filter(([, def]) => def.lifecycle?.state === 'archived')
      .map(([name]) => name),
  );

  if (archivedFlags.size === 0) {
    return { clean: true, staleRefs: [] };
  }

  const allRefs = findFlagReferences(dir);
  const staleRefs = allRefs.filter((ref) => archivedFlags.has(ref.flag));

  return { clean: staleRefs.length === 0, staleRefs };
}

/** Format codemod results as a diff preview. */
export function formatCodemodDiff(results: CodemodResult[], baseDir: string): string {
  if (results.length === 0) return '✅ No changes needed.';

  const lines: string[] = [];
  let totalChanges = 0;

  for (const result of results) {
    const relPath = relative(baseDir, result.file);
    lines.push(`\n📄 ${relPath} (${result.changes.length} change${result.changes.length > 1 ? 's' : ''}):`);
    for (const change of result.changes) {
      lines.push(`  L${change.line}: ${change.description}`);
      lines.push(`    - ${change.before}`);
      lines.push(`    + ${change.after}`);
      totalChanges++;
    }
  }

  lines.unshift(`🔧 ${totalChanges} change(s) across ${results.length} file(s)`);
  return lines.join('\n');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
