import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

/** A detected flag pattern in source code. */
export interface FlagSuggestion {
  /** Source file path. */
  file: string;
  /** Line number (1-based). */
  line: number;
  /** The original code pattern detected. */
  pattern: string;
  /** Suggested flag name (kebab-case). */
  flagName: string;
  /** Suggested flag type. */
  type: 'boolean' | 'string';
  /** Suggested default value. */
  defaultValue: boolean | string;
  /** Generated YAML definition. */
  yaml: string;
  /** Category of the pattern detected. */
  category: 'config' | 'env' | 'conditional' | 'feature-check';
}

// Patterns that indicate feature flags or conditional features
const PATTERNS = [
  // process.env.FEATURE_X / process.env.ENABLE_X
  {
    regex: /process\.env\.(?:FEATURE_|ENABLE_|FF_|FLAG_|TOGGLE_)(\w+)/g,
    category: 'env' as const,
    extractName: (match: RegExpMatchArray) => toKebabCase(match[1]),
    type: 'boolean' as const,
  },
  // config.featureX / config.enableX / config.isX
  {
    regex:
      /(?:config|settings|options|features)\.(?:feature|enable|is|has|show|use|allow)([A-Z]\w*)/g,
    category: 'config' as const,
    extractName: (match: RegExpMatchArray) => toKebabCase(match[1]),
    type: 'boolean' as const,
  },
  // isEnabled('flag-name') / isFeatureEnabled('flag')
  {
    regex: /is(?:Feature)?Enabled\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    category: 'feature-check' as const,
    extractName: (match: RegExpMatchArray) => toKebabCase(match[1]),
    type: 'boolean' as const,
  },
  // featureFlags.flagName / featureFlags['flag-name']
  {
    regex: /featureFlags\s*(?:\.(\w+)|\[\s*['"`]([^'"`]+)['"`]\s*\])/g,
    category: 'feature-check' as const,
    extractName: (match: RegExpMatchArray) => toKebabCase(match[1] || match[2]),
    type: 'boolean' as const,
  },
  // if (FEATURE_X) / if (ENABLE_X)
  {
    regex: /if\s*\(\s*(?:FEATURE_|ENABLE_|FF_)(\w+)\s*\)/g,
    category: 'conditional' as const,
    extractName: (match: RegExpMatchArray) => toKebabCase(match[1]),
    type: 'boolean' as const,
  },
  // useFeature('name') / useFlag('name')
  {
    regex: /use(?:Feature|Flag)\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    category: 'feature-check' as const,
    extractName: (match: RegExpMatchArray) => toKebabCase(match[1]),
    type: 'boolean' as const,
  },
];

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
}

function generateYaml(suggestion: FlagSuggestion): string {
  return [
    `  ${suggestion.flagName}:`,
    `    enabled: ${suggestion.defaultValue}`,
    `    description: Auto-detected from ${suggestion.category} pattern in ${suggestion.file}:${suggestion.line}`,
  ].join('\n');
}

/**
 * Scan a directory for TypeScript/JavaScript files and detect feature flag patterns.
 */
export function scanForFlagPatterns(
  dir: string,
  options: { extensions?: string[]; ignore?: string[] } = {},
): FlagSuggestion[] {
  const extensions = options.extensions ?? ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];
  const ignore = options.ignore ?? ['node_modules', 'dist', '.git', 'coverage', '.next', 'build'];
  const suggestions: FlagSuggestion[] = [];
  const seen = new Set<string>();

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ignore.includes(entry) || entry.startsWith('.')) continue;

      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extensions.includes(extname(entry))) {
        scanFile(fullPath, dir, suggestions, seen);
      }
    }
  }

  walk(dir);

  // Deduplicate by flag name, keep the first occurrence
  const unique: FlagSuggestion[] = [];
  const flagNames = new Set<string>();
  for (const s of suggestions) {
    if (!flagNames.has(s.flagName)) {
      flagNames.add(s.flagName);
      unique.push(s);
    }
  }

  return unique;
}

function scanFile(
  filePath: string,
  baseDir: string,
  suggestions: FlagSuggestion[],
  seen: Set<string>,
): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  const relPath = relative(baseDir, filePath);
  const lines = content.split('\n');

  for (const pattern of PATTERNS) {
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        const flagName = pattern.extractName(match);
        if (!flagName || flagName.length < 2) continue;

        const key = `${flagName}:${pattern.category}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const suggestion: FlagSuggestion = {
          file: relPath,
          line: lineIdx + 1,
          pattern: match[0],
          flagName,
          type: pattern.type,
          defaultValue: false,
          yaml: '',
          category: pattern.category,
        };
        suggestion.yaml = generateYaml(suggestion);
        suggestions.push(suggestion);
      }
    }
  }
}

/**
 * Format suggestions as a complete YAML flag config.
 */
export function formatSuggestionsAsYaml(suggestions: FlagSuggestion[]): string {
  if (suggestions.length === 0) return '# No flag patterns detected\nversion: 1\nflags: {}\n';

  const lines = ['version: 1', 'flags:'];
  for (const s of suggestions) {
    lines.push(s.yaml);
  }
  return lines.join('\n') + '\n';
}

/**
 * Format suggestions as a human-readable report.
 */
export function formatSuggestionsReport(suggestions: FlagSuggestion[]): string {
  if (suggestions.length === 0) return 'No flag patterns detected in the codebase.';

  const lines = [`Found ${suggestions.length} potential feature flag(s):\n`];

  for (const s of suggestions) {
    lines.push(`  🏴 ${s.flagName}`);
    lines.push(`    File: ${s.file}:${s.line}`);
    lines.push(`    Pattern: ${s.pattern}`);
    lines.push(`    Category: ${s.category}`);
    lines.push(`    Type: ${s.type} (default: ${s.defaultValue})`);
    lines.push('');
  }

  return lines.join('\n');
}
