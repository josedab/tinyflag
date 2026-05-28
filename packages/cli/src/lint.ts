import { readFileSync, existsSync, writeFileSync } from 'fs';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import type { FlagConfig, FlagDefinition } from 'tinyflag';

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintResult {
  rule: string;
  severity: LintSeverity;
  flag?: string;
  message: string;
  fixable?: boolean;
}

export interface LintRule {
  name: string;
  severity: LintSeverity;
  check(config: FlagConfig, options?: Record<string, unknown>): LintResult[];
  fix?(config: FlagConfig, options?: Record<string, unknown>): FlagConfig;
}

export interface LintConfig {
  rules?: Record<string, LintSeverity | false | { severity: LintSeverity; options?: Record<string, unknown> }>;
  extends?: string[];
}

const FLAG_NAME_CONVENTION = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

// Built-in rules
const builtinRules: LintRule[] = [
  {
    name: 'require-description',
    severity: 'warning',
    check(config) {
      const results: LintResult[] = [];
      for (const [name, flag] of Object.entries(config.flags)) {
        if (!flag.description || flag.description.trim() === '') {
          results.push({
            rule: 'require-description',
            severity: 'warning',
            flag: name,
            message: `Flag "${name}" is missing a description`,
            fixable: false,
          });
        }
      }
      return results;
    },
  },
  {
    name: 'require-tags',
    severity: 'warning',
    check(config) {
      const results: LintResult[] = [];
      for (const [name, flag] of Object.entries(config.flags)) {
        if (!flag.tags || flag.tags.length === 0) {
          results.push({
            rule: 'require-tags',
            severity: 'warning',
            flag: name,
            message: `Flag "${name}" has no tags`,
            fixable: false,
          });
        }
      }
      return results;
    },
  },
  {
    name: 'max-flags-per-file',
    severity: 'warning',
    check(config, options) {
      const max = (options?.max as number) ?? 50;
      const count = Object.keys(config.flags).length;
      if (count > max) {
        return [{
          rule: 'max-flags-per-file',
          severity: 'warning',
          message: `File contains ${count} flags (max: ${max}). Consider splitting into multiple files.`,
        }];
      }
      return [];
    },
  },
  {
    name: 'no-100-rollout-without-tag',
    severity: 'warning',
    check(config) {
      const results: LintResult[] = [];
      for (const [name, flag] of Object.entries(config.flags)) {
        if (
          flag.enabled &&
          typeof flag.rollout === 'number' &&
          flag.rollout === 100 &&
          (!flag.tags || !flag.tags.includes('permanent'))
        ) {
          results.push({
            rule: 'no-100-rollout-without-tag',
            severity: 'warning',
            flag: name,
            message: `Flag "${name}" has 100% rollout without "permanent" tag. Consider removing the flag or tagging it.`,
          });
        }
      }
      return results;
    },
  },
  {
    name: 'naming-convention',
    severity: 'error',
    check(config) {
      const results: LintResult[] = [];
      for (const name of Object.keys(config.flags)) {
        if (!FLAG_NAME_CONVENTION.test(name)) {
          results.push({
            rule: 'naming-convention',
            severity: 'error',
            flag: name,
            message: `Flag "${name}" does not follow kebab-case naming convention`,
          });
        }
      }
      return results;
    },
  },
  {
    name: 'no-empty-rules',
    severity: 'warning',
    check(config) {
      const results: LintResult[] = [];
      for (const [name, flag] of Object.entries(config.flags)) {
        if (flag.rules) {
          for (let i = 0; i < flag.rules.length; i++) {
            const rule = flag.rules[i];
            if (Object.keys(rule.conditions).length === 0 && !rule.segment) {
              results.push({
                rule: 'no-empty-rules',
                severity: 'warning',
                flag: name,
                message: `Flag "${name}" rule[${i}] has empty conditions (matches all users)`,
              });
            }
          }
        }
      }
      return results;
    },
  },
  {
    name: 'no-disabled-with-rules',
    severity: 'info',
    check(config) {
      const results: LintResult[] = [];
      for (const [name, flag] of Object.entries(config.flags)) {
        if (!flag.enabled && flag.rules && flag.rules.length > 0) {
          results.push({
            rule: 'no-disabled-with-rules',
            severity: 'info',
            flag: name,
            message: `Flag "${name}" is disabled but has ${flag.rules.length} rule(s) that will never be evaluated`,
          });
        }
      }
      return results;
    },
  },
];

/** Load lint config from .tinyflagrc file. */
export function loadLintConfig(configPath?: string): LintConfig {
  const paths = configPath ? [configPath] : ['.tinyflagrc', '.tinyflagrc.json'];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf-8');
        return JSON.parse(content) as LintConfig;
      } catch {
        return {};
      }
    }
  }
  return {};
}

/** Run all applicable lint rules against a config. */
export function lintConfig(config: FlagConfig, lintCfg: LintConfig = {}): LintResult[] {
  const results: LintResult[] = [];

  for (const rule of builtinRules) {
    const ruleConfig = lintCfg.rules?.[rule.name];

    // Skip explicitly disabled rules
    if (ruleConfig === false) continue;

    let severity = rule.severity;
    let options: Record<string, unknown> | undefined;

    if (typeof ruleConfig === 'string') {
      severity = ruleConfig;
    } else if (typeof ruleConfig === 'object' && ruleConfig !== null) {
      severity = ruleConfig.severity;
      options = ruleConfig.options;
    }

    const ruleResults = rule.check(config, options);
    for (const r of ruleResults) {
      results.push({ ...r, severity });
    }
  }

  return results;
}

/** Format lint results as human-readable text. */
export function formatLintResults(results: LintResult[]): string {
  if (results.length === 0) return '✅ No lint issues found.';

  const lines: string[] = [];
  const errors = results.filter((r) => r.severity === 'error');
  const warnings = results.filter((r) => r.severity === 'warning');
  const infos = results.filter((r) => r.severity === 'info');

  for (const r of results) {
    const icon = r.severity === 'error' ? '❌' : r.severity === 'warning' ? '⚠️' : 'ℹ️';
    const fixable = r.fixable ? ' (fixable)' : '';
    lines.push(`  ${icon} [${r.rule}] ${r.message}${fixable}`);
  }

  lines.push('');
  lines.push(`Summary: ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info(s)`);

  return lines.join('\n');
}

/** Format lint results as SARIF for GitHub Code Scanning integration. */
export function formatLintSarif(results: LintResult[], filePath: string): object {
  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'tinyflag-lint',
          version: '0.1.0',
          rules: builtinRules.map((r) => ({
            id: r.name,
            shortDescription: { text: r.name },
            defaultConfiguration: { level: r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'note' },
          })),
        },
      },
      results: results.map((r) => ({
        ruleId: r.rule,
        level: r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'note',
        message: { text: r.message },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri: filePath },
            region: { startLine: 1 },
          },
        }],
      })),
    }],
  };
}
