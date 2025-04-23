---
sidebar_position: 5
title: Multi-Tenant
description: Per-tenant flag overrides and isolation validation.
---

# Multi-Tenant Flags

TinyFlag supports per-tenant flag overrides for SaaS applications. Define global defaults and let tenants override specific flags.

## Configuration

```yaml
version: 1
flags:
  new-dashboard:
    enabled: true
    rollout: 50
  advanced-analytics:
    enabled: false

tenants:
  acme-corp:
    description: Enterprise customer
    flags:
      new-dashboard:
        rollout: 100        # Full rollout for ACME
      advanced-analytics:
        enabled: true        # Enabled for ACME
  startup-inc:
    description: Free tier customer
    flags:
      new-dashboard:
        rollout: 0           # Disabled for this tenant
```

## Evaluating Tenant Flags

```typescript
import {
  resolveTenantFlags,
  evaluateTenantFlag,
  evaluateTenantVariant,
} from 'tinyflag';

// Resolve all flags for a tenant (merges global + tenant overrides)
const flags = resolveTenantFlags(config, 'acme-corp');

// Evaluate a flag for a specific tenant and user
const enabled = evaluateTenantFlag(config, 'advanced-analytics', { tenantId: 'acme-corp' }, { userId: 'user-1' });

// Evaluate variants for a tenant
const { variant } = evaluateTenantVariant(config, 'experiment', { tenantId: 'acme-corp' }, { userId: 'user-1' });
```

## Listing and Comparing Tenants

```typescript
import { listTenants, diffTenantFlags, formatTenantList } from 'tinyflag';

// List all tenants
const tenants = listTenants(config); // ['acme-corp', 'startup-inc']

// Human-readable format
console.log(formatTenantList(config));
// Tenants:
//   acme-corp — Enterprise customer (2 flag overrides)
//   startup-inc — Free tier customer (1 flag override)

// Compare two tenants
const diffs = diffTenantFlags(config, 'acme-corp', 'startup-inc');
// Compare tenant vs global defaults
const globalDiffs = diffTenantFlags(config, 'acme-corp', null);
```

## Tenant Isolation Validation

Verify that tenant-specific flags don't leak across tenants:

```typescript
import { validateTenantIsolation } from 'tinyflag';

const violations = validateTenantIsolation(config);
if (violations.length > 0) {
  for (const v of violations) {
    console.warn(`Flag "${v.flag}" from ${v.sourceTenant} leaked to ${v.leakedToTenant}`);
  }
}
```
