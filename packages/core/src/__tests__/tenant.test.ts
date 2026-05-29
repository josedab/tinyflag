import { describe, it, expect } from 'vitest';
import {
  resolveTenantFlags,
  evaluateTenantFlag,
  evaluateTenantVariant,
  listTenants,
  diffTenantFlags,
  validateTenantIsolation,
  formatTenantList,
} from '../tenant.js';
import type { MultiTenantFlagConfig } from '../tenant.js';

const CONFIG: MultiTenantFlagConfig = {
  version: 1,
  flags: {
    'dark-mode': { enabled: false, description: 'Dark mode' },
    'checkout-v2': { enabled: true, rollout: 50 },
    'beta-features': { enabled: true, description: 'Beta' },
  },
  tenants: {
    'acme-corp': {
      description: 'Acme Corporation',
      flags: {
        'dark-mode': { enabled: true },
        'checkout-v2': { rollout: 100 },
      },
    },
    'beta-inc': {
      description: 'Beta Inc',
      flags: {
        'dark-mode': { enabled: true },
        'beta-features': { enabled: false },
      },
    },
    'empty-tenant': {
      description: 'No overrides',
      flags: {},
    },
  },
};

describe('multi-tenant', () => {
  describe('resolveTenantFlags', () => {
    it('merges tenant overrides on top of global defaults', () => {
      const flags = resolveTenantFlags(CONFIG, 'acme-corp');
      expect(flags['dark-mode'].enabled).toBe(true);
      expect(flags['checkout-v2'].rollout).toBe(100);
      expect(flags['beta-features'].enabled).toBe(true);
    });

    it('returns global flags for unknown tenant', () => {
      const flags = resolveTenantFlags(CONFIG, 'unknown');
      expect(flags['dark-mode'].enabled).toBe(false);
    });

    it('returns global flags for tenant with no overrides', () => {
      const flags = resolveTenantFlags(CONFIG, 'empty-tenant');
      expect(flags['dark-mode'].enabled).toBe(false);
      expect(flags['checkout-v2'].rollout).toBe(50);
    });
  });

  describe('evaluateTenantFlag', () => {
    it('evaluates with tenant context', () => {
      const result = evaluateTenantFlag(
        CONFIG,
        'dark-mode',
        { tenantId: 'acme-corp' },
      );
      expect(result).toBe(true);
    });

    it('uses global defaults for unknown tenant', () => {
      const result = evaluateTenantFlag(
        CONFIG,
        'dark-mode',
        { tenantId: 'unknown' },
      );
      expect(result).toBe(false);
    });

    it('returns false for non-existent flag', () => {
      const result = evaluateTenantFlag(
        CONFIG,
        'nonexistent',
        { tenantId: 'acme-corp' },
      );
      expect(result).toBe(false);
    });

    it('applies rollout with user context', () => {
      // user-3 has bucket 5 for checkout-v2, so 5 < 100 = true for acme-corp
      const result = evaluateTenantFlag(
        CONFIG,
        'checkout-v2',
        { tenantId: 'acme-corp' },
        { userId: 'user-3' },
      );
      expect(result).toBe(true);
    });
  });

  describe('evaluateTenantVariant', () => {
    it('returns null variant when no variants defined', () => {
      const result = evaluateTenantVariant(
        CONFIG,
        'dark-mode',
        { tenantId: 'acme-corp' },
      );
      expect(result.variant).toBeNull();
      expect(result.enabled).toBe(true);
    });
  });

  describe('listTenants', () => {
    it('returns sorted tenant IDs', () => {
      expect(listTenants(CONFIG)).toEqual(['acme-corp', 'beta-inc', 'empty-tenant']);
    });

    it('returns empty for config without tenants', () => {
      expect(listTenants({ flags: {} })).toEqual([]);
    });
  });

  describe('diffTenantFlags', () => {
    it('shows differences between tenants', () => {
      const diffs = diffTenantFlags(CONFIG, 'acme-corp', 'beta-inc');
      expect(diffs.length).toBeGreaterThan(0);
      const checkoutDiff = diffs.find((d) => d.flag === 'checkout-v2');
      expect(checkoutDiff).toBeTruthy();
      expect(checkoutDiff!.type).toBe('modified');
    });

    it('shows differences between tenant and global', () => {
      const diffs = diffTenantFlags(CONFIG, 'acme-corp', null);
      const darkModeDiff = diffs.find((d) => d.flag === 'dark-mode');
      expect(darkModeDiff).toBeTruthy();
      expect(darkModeDiff!.type).toBe('modified');
    });
  });

  describe('validateTenantIsolation', () => {
    it('passes for config without tenant-only flags', () => {
      const violations = validateTenantIsolation(CONFIG);
      expect(violations).toHaveLength(0);
    });

    it('detects cross-tenant flag leakage', () => {
      const config: MultiTenantFlagConfig = {
        flags: { global: { enabled: true } },
        tenants: {
          'a': { flags: { 'private-a': { enabled: true } } },
          'b': { flags: { 'private-a': { enabled: true } } },
        },
      };
      const violations = validateTenantIsolation(config);
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe('formatTenantList', () => {
    it('formats tenant list with descriptions', () => {
      const output = formatTenantList(CONFIG);
      expect(output).toContain('acme-corp');
      expect(output).toContain('Acme Corporation');
      expect(output).toContain('2 flag overrides');
    });

    it('shows message when no tenants', () => {
      const output = formatTenantList({ flags: {} });
      expect(output).toContain('No tenants configured');
    });
  });
});
