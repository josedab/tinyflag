import { readFileSync, existsSync } from 'fs';
import { parseYaml } from 'tinyflag';
import type { FlagConfig } from 'tinyflag';

/** Owner entry mapping flags (by name or glob) to responsible owners. */
export interface FlagOwnerEntry {
  pattern: string;
  owners: string[];
  reviewers?: string[];
  approvalRequired?: boolean;
}

/** Parsed flag-owners config. */
export interface FlagOwnersConfig {
  version: number;
  defaultOwners?: string[];
  entries: FlagOwnerEntry[];
}

/** Ownership validation result for a single flag. */
export interface OwnershipResult {
  flag: string;
  owners: string[];
  reviewers: string[];
  approvalRequired: boolean;
  hasOwner: boolean;
}

/** Approval check result for a PR. */
export interface ApprovalCheckResult {
  passed: boolean;
  changedFlags: string[];
  results: OwnershipResult[];
  missingApprovals: Array<{
    flag: string;
    requiredOwners: string[];
    approvedBy: string[];
    missing: string[];
  }>;
}

/**
 * Parse a flag-owners.yml file into structured config.
 *
 * Expected format:
 * ```yaml
 * version: 1
 * defaultOwners:
 *   - "@platform-team"
 * flags:
 *   - pattern: "checkout-*"
 *     owners: ["@payments-team"]
 *     reviewers: ["@security-team"]
 *     approvalRequired: true
 *   - pattern: "dark-mode"
 *     owners: ["@frontend-team"]
 * ```
 */
export function parseFlagOwners(content: string): FlagOwnersConfig {
  const raw = parseYaml(content) as Record<string, unknown>;

  const version = typeof raw.version === 'number' ? raw.version : 1;
  const defaultOwners = Array.isArray(raw.defaultOwners) ? (raw.defaultOwners as string[]) : [];

  const entries: FlagOwnerEntry[] = [];
  const flagEntries = raw.flags;
  if (Array.isArray(flagEntries)) {
    for (const entry of flagEntries) {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        entries.push({
          pattern: String(e.pattern || ''),
          owners: Array.isArray(e.owners) ? (e.owners as string[]) : [],
          reviewers: Array.isArray(e.reviewers) ? (e.reviewers as string[]) : undefined,
          approvalRequired: typeof e.approvalRequired === 'boolean' ? e.approvalRequired : true,
        });
      }
    }
  }

  return { version, defaultOwners, entries };
}

/**
 * Load flag-owners.yml from a file path.
 */
export function loadFlagOwners(filePath: string): FlagOwnersConfig {
  if (!existsSync(filePath)) {
    throw new Error(`Flag owners file not found: ${filePath}`);
  }
  const content = readFileSync(filePath, 'utf8');
  return parseFlagOwners(content);
}

/**
 * Match a flag name against an ownership pattern (supports glob * wildcard).
 */
function matchOwnerPattern(pattern: string, flagName: string): boolean {
  if (pattern === flagName) return true;
  if (!pattern.includes('*')) return false;

  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
  return regex.test(flagName);
}

/**
 * Resolve ownership for a single flag.
 */
export function resolveOwnership(flagName: string, config: FlagOwnersConfig): OwnershipResult {
  for (const entry of config.entries) {
    if (matchOwnerPattern(entry.pattern, flagName)) {
      return {
        flag: flagName,
        owners: entry.owners,
        reviewers: entry.reviewers ?? [],
        approvalRequired: entry.approvalRequired ?? true,
        hasOwner: entry.owners.length > 0,
      };
    }
  }

  // Fall back to default owners
  return {
    flag: flagName,
    owners: config.defaultOwners ?? [],
    reviewers: [],
    approvalRequired: (config.defaultOwners ?? []).length > 0,
    hasOwner: (config.defaultOwners ?? []).length > 0,
  };
}

/**
 * Check approval status for a set of changed flags.
 */
export function checkApprovals(
  changedFlags: string[],
  config: FlagOwnersConfig,
  approvedBy: string[],
): ApprovalCheckResult {
  const results: OwnershipResult[] = [];
  const missingApprovals: ApprovalCheckResult['missingApprovals'] = [];

  for (const flag of changedFlags) {
    const ownership = resolveOwnership(flag, config);
    results.push(ownership);

    if (ownership.approvalRequired && ownership.owners.length > 0) {
      const approved = ownership.owners.filter((o) => approvedBy.includes(o));
      const missing = ownership.owners.filter((o) => !approvedBy.includes(o));
      if (missing.length > 0) {
        missingApprovals.push({
          flag,
          requiredOwners: ownership.owners,
          approvedBy: approved,
          missing,
        });
      }
    }
  }

  return {
    passed: missingApprovals.length === 0,
    changedFlags,
    results,
    missingApprovals,
  };
}

/**
 * Format approval check result as human-readable text.
 */
export function formatApprovalResult(result: ApprovalCheckResult): string {
  const lines: string[] = [];

  if (result.passed) {
    lines.push('✅ All flag changes have required approvals');
  } else {
    lines.push('❌ Missing approvals for flag changes:');
    lines.push('');
    for (const m of result.missingApprovals) {
      lines.push(`  Flag: ${m.flag}`);
      lines.push(`    Required: ${m.requiredOwners.join(', ')}`);
      lines.push(`    Approved: ${m.approvedBy.length > 0 ? m.approvedBy.join(', ') : '(none)'}`);
      lines.push(`    Missing:  ${m.missing.join(', ')}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Format ownership info for all flags as a report.
 */
export function formatOwnershipReport(config: FlagConfig, ownersConfig: FlagOwnersConfig): string {
  const lines: string[] = ['Flag Ownership Report', '═'.repeat(50), ''];

  for (const flagName of Object.keys(config.flags).sort()) {
    const ownership = resolveOwnership(flagName, ownersConfig);
    const icon = ownership.hasOwner ? '👤' : '⚠️';
    lines.push(`${icon} ${flagName}`);
    lines.push(
      `   Owners: ${ownership.owners.length > 0 ? ownership.owners.join(', ') : '(unowned)'}`,
    );
    if (ownership.reviewers.length > 0) {
      lines.push(`   Reviewers: ${ownership.reviewers.join(', ')}`);
    }
    lines.push(`   Approval required: ${ownership.approvalRequired ? 'yes' : 'no'}`);
    lines.push('');
  }

  return lines.join('\n');
}
