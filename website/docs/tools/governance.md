---
sidebar_position: 13
title: Governance
description: RBAC roles, approval workflows, and tamper-proof compliance audit trail.
---

# Governance

TinyFlag provides governance controls for enterprise flag management: role-based access control (RBAC), flag change approval workflows, and a tamper-proof compliance audit trail with HMAC hash chains.

## RBAC Roles

Four built-in roles with hierarchical permissions:

| Role       | View | Edit | Approve | Admin | Export Audit |
| ---------- | ---- | ---- | ------- | ----- | ------------ |
| `viewer`   | ✅   | ❌   | ❌      | ❌    | ❌           |
| `editor`   | ✅   | ✅   | ❌      | ❌    | ❌           |
| `approver` | ✅   | ✅   | ✅      | ❌    | ✅           |
| `admin`    | ✅   | ✅   | ✅      | ✅    | ✅           |

### Checking Permissions

```typescript
import { getPermissions, hasPermission } from 'tinyflag';
import type { GovernanceUser } from 'tinyflag';

const user: GovernanceUser = {
  username: 'alice',
  role: 'editor',
  email: 'alice@company.com',
  teams: ['backend'],
};

hasPermission(user, 'canEdit'); // true
hasPermission(user, 'canApprove'); // false

const perms = getPermissions('admin');
// { canView: true, canEdit: true, canApprove: true, canAdmin: true, canExportAudit: true }
```

## Governance Configuration

Define users, roles, and approval workflows in a `governance.yml` file:

```yaml
version: 1
defaultRole: viewer
auditRetentionDays: 90

users:
  - username: alice
    role: admin
    email: alice@company.com
    teams: [platform]
  - username: bob
    role: editor
    email: bob@company.com
    teams: [backend]
  - username: carol
    role: approver
    email: carol@company.com

workflows:
  - requiredApprovals: 2
    approverRoles: [approver, admin]
    selfApproval: false
    flagPatterns: ['auth-*', 'billing-*'] # Sensitive flags need 2 approvals
  - requiredApprovals: 1
    approverRoles: [approver, admin]
    selfApproval: false
    # No flagPatterns = catch-all for all other flags
```

### Parsing Configuration

```typescript
import { parseGovernanceConfig } from 'tinyflag';

const raw = parseYaml(fs.readFileSync('governance.yml', 'utf-8'));
const config = parseGovernanceConfig(raw);
```

## Approval Workflows

Validate whether a flag change request has sufficient approvals:

```typescript
import { validateApprovalRequest } from 'tinyflag';
import type { ApprovalRequest } from 'tinyflag';

const request: ApprovalRequest = {
  id: 'req-001',
  flag: 'auth-mfa',
  action: 'update',
  author: 'bob',
  approvals: [{ user: 'alice', role: 'admin', timestamp: Date.now() }],
  status: 'pending',
  createdAt: Date.now(),
};

const result = validateApprovalRequest(request, config);
console.log(result);
// { met: false, required: 2, received: 1, missing: 1 }
// 'auth-mfa' matches 'auth-*' pattern → needs 2 approvals
```

Key behaviors:

- **Self-approval**: When `selfApproval: false`, approvals from the request author are excluded.
- **Pattern matching**: `flagPatterns` uses glob matching. The first workflow with a matching pattern is used; workflows without patterns act as catch-all.

## Tamper-Proof Audit Trail

The `ComplianceAuditTrail` maintains an HMAC hash chain — each event's hash depends on the previous event, making tampering detectable.

```typescript
import { ComplianceAuditTrail, formatGovernanceReport } from 'tinyflag';

const trail = new ComplianceAuditTrail('your-hmac-secret-key');

// Append audit events
trail.append({
  flag: 'new-checkout',
  action: 'updated',
  actor: 'alice',
  actorRole: 'admin',
  before: { enabled: false },
  after: { enabled: true },
  timestamp: Date.now(),
});

// Verify chain integrity (detects tampering)
const verification = trail.verify();
console.log(verification.valid); // true
console.log(verification.message); // 'All 1 events verified successfully'

// Get all events
const events = trail.getEvents();

// Filter events
const aliceEvents = trail.getEvents({ actor: 'alice' });
const recentEvents = trail.getEvents({ since: Date.now() - 86400000 });

// Generate a human-readable report
console.log(formatGovernanceReport(config, trail.getEvents()));
```

### Verification

If any event in the chain is modified or removed, `verify()` will detect the break:

```typescript
const result = trail.verify();
if (!result.valid) {
  console.error(`Chain broken at event #${result.brokenAt}: ${result.message}`);
}
```

## Types

```typescript
interface ComplianceAuditEvent {
  sequence: number;
  flag: string;
  action: 'created' | 'updated' | 'deleted' | 'approved' | 'rejected' | 'exported';
  actor: string;
  actorRole: GovernanceRole;
  before?: unknown;
  after?: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
  hash: string; // HMAC-SHA256 of this event
  previousHash: string; // Hash of the previous event (chain link)
}
```
