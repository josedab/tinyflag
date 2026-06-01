import { describe, it, expect } from 'vitest';
import {
  parseFlagOwners,
  resolveOwnership,
  checkApprovals,
  formatApprovalResult,
} from '../governance.js';

const SAMPLE_OWNERS = `
version: 1
defaultOwners:
  - "@platform-team"
flags:
  - pattern: "checkout-*"
    owners: ["@payments-team"]
    reviewers: ["@security-team"]
    approvalRequired: true
  - pattern: "dark-mode"
    owners: ["@frontend-team"]
    approvalRequired: false
  - pattern: "beta-*"
    owners: ["@product-team", "@engineering-team"]
`;

describe('governance', () => {
  describe('parseFlagOwners', () => {
    it('parses flag-owners.yml format', () => {
      const config = parseFlagOwners(SAMPLE_OWNERS);
      expect(config.version).toBe(1);
      expect(config.defaultOwners).toEqual(['@platform-team']);
      expect(config.entries).toHaveLength(3);
      expect(config.entries[0].pattern).toBe('checkout-*');
      expect(config.entries[0].owners).toEqual(['@payments-team']);
    });
  });

  describe('resolveOwnership', () => {
    const config = parseFlagOwners(SAMPLE_OWNERS);

    it('matches exact flag name', () => {
      const result = resolveOwnership('dark-mode', config);
      expect(result.owners).toEqual(['@frontend-team']);
      expect(result.approvalRequired).toBe(false);
    });

    it('matches glob pattern', () => {
      const result = resolveOwnership('checkout-v2', config);
      expect(result.owners).toEqual(['@payments-team']);
      expect(result.reviewers).toEqual(['@security-team']);
    });

    it('falls back to default owners', () => {
      const result = resolveOwnership('unknown-flag', config);
      expect(result.owners).toEqual(['@platform-team']);
      expect(result.hasOwner).toBe(true);
    });
  });

  describe('checkApprovals', () => {
    const config = parseFlagOwners(SAMPLE_OWNERS);

    it('passes when all approvals present', () => {
      const result = checkApprovals(
        ['checkout-v2'],
        config,
        ['@payments-team'],
      );
      expect(result.passed).toBe(true);
      expect(result.missingApprovals).toHaveLength(0);
    });

    it('fails when approval missing', () => {
      const result = checkApprovals(
        ['checkout-v2'],
        config,
        ['@random-user'],
      );
      expect(result.passed).toBe(false);
      expect(result.missingApprovals).toHaveLength(1);
      expect(result.missingApprovals[0].missing).toEqual(['@payments-team']);
    });

    it('skips approval check when not required', () => {
      const result = checkApprovals(['dark-mode'], config, []);
      expect(result.passed).toBe(true);
    });
  });

  describe('formatApprovalResult', () => {
    it('shows success message', () => {
      const result = formatApprovalResult({
        passed: true,
        changedFlags: ['dark-mode'],
        results: [],
        missingApprovals: [],
      });
      expect(result).toContain('✅');
    });

    it('shows failure details', () => {
      const result = formatApprovalResult({
        passed: false,
        changedFlags: ['checkout-v2'],
        results: [],
        missingApprovals: [
          {
            flag: 'checkout-v2',
            requiredOwners: ['@payments-team'],
            approvedBy: [],
            missing: ['@payments-team'],
          },
        ],
      });
      expect(result).toContain('❌');
      expect(result).toContain('checkout-v2');
      expect(result).toContain('@payments-team');
    });
  });
});
