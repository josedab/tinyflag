import { describe, it, expect } from 'vitest';
import {
  getPermissions,
  hasPermission,
  parseGovernanceConfig,
  validateApprovalRequest,
  ComplianceAuditTrail,
  formatGovernanceReport,
  type GovernanceConfig,
  type GovernanceUser,
  type ApprovalRequest,
} from '../governance.js';

describe('getPermissions', () => {
  it('returns viewer permissions', () => {
    const p = getPermissions('viewer');
    expect(p.canView).toBe(true);
    expect(p.canEdit).toBe(false);
    expect(p.canApprove).toBe(false);
    expect(p.canAdmin).toBe(false);
    expect(p.canExportAudit).toBe(false);
  });

  it('returns editor permissions', () => {
    const p = getPermissions('editor');
    expect(p.canView).toBe(true);
    expect(p.canEdit).toBe(true);
    expect(p.canApprove).toBe(false);
    expect(p.canAdmin).toBe(false);
  });

  it('returns approver permissions', () => {
    const p = getPermissions('approver');
    expect(p.canView).toBe(true);
    expect(p.canEdit).toBe(true);
    expect(p.canApprove).toBe(true);
    expect(p.canAdmin).toBe(false);
    expect(p.canExportAudit).toBe(true);
  });

  it('returns admin permissions', () => {
    const p = getPermissions('admin');
    expect(p.canView).toBe(true);
    expect(p.canEdit).toBe(true);
    expect(p.canApprove).toBe(true);
    expect(p.canAdmin).toBe(true);
    expect(p.canExportAudit).toBe(true);
  });

  it('returns a copy, not a reference', () => {
    const p1 = getPermissions('admin');
    const p2 = getPermissions('admin');
    expect(p1).toEqual(p2);
    expect(p1).not.toBe(p2);
  });
});

describe('hasPermission', () => {
  it('returns true for valid permission', () => {
    const user: GovernanceUser = { username: 'alice', role: 'admin' };
    expect(hasPermission(user, 'canAdmin')).toBe(true);
  });

  it('returns false for insufficient role', () => {
    const user: GovernanceUser = { username: 'bob', role: 'viewer' };
    expect(hasPermission(user, 'canEdit')).toBe(false);
    expect(hasPermission(user, 'canApprove')).toBe(false);
    expect(hasPermission(user, 'canAdmin')).toBe(false);
  });

  it('editor can edit but not approve', () => {
    const user: GovernanceUser = { username: 'carol', role: 'editor' };
    expect(hasPermission(user, 'canEdit')).toBe(true);
    expect(hasPermission(user, 'canApprove')).toBe(false);
  });
});

describe('parseGovernanceConfig', () => {
  it('parses valid config', () => {
    const raw = {
      version: 2,
      defaultRole: 'editor',
      users: [
        { username: 'alice', role: 'admin', email: 'a@test.com', teams: ['platform'] },
        { username: 'bob', role: 'viewer' },
      ],
      workflows: [
        {
          requiredApprovals: 2,
          approverRoles: ['admin'],
          selfApproval: true,
          flagPatterns: ['prod-*'],
        },
      ],
      auditRetentionDays: 365,
    };
    const config = parseGovernanceConfig(raw);
    expect(config.version).toBe(2);
    expect(config.defaultRole).toBe('editor');
    expect(config.users).toHaveLength(2);
    expect(config.users[0].username).toBe('alice');
    expect(config.users[0].teams).toEqual(['platform']);
    expect(config.workflows[0].requiredApprovals).toBe(2);
    expect(config.workflows[0].selfApproval).toBe(true);
    expect(config.auditRetentionDays).toBe(365);
  });

  it('applies defaults for missing fields', () => {
    const config = parseGovernanceConfig({});
    expect(config.version).toBe(1);
    expect(config.defaultRole).toBe('viewer');
    expect(config.users).toEqual([]);
    expect(config.workflows).toHaveLength(1);
    expect(config.workflows[0].requiredApprovals).toBe(1);
    expect(config.workflows[0].approverRoles).toEqual(['approver', 'admin']);
    expect(config.workflows[0].selfApproval).toBe(false);
    expect(config.auditRetentionDays).toBe(90);
  });

  it('handles malformed users array', () => {
    const config = parseGovernanceConfig({ users: [null, 42, 'bad', { username: 'ok' }] });
    expect(config.users).toHaveLength(1);
    expect(config.users[0].username).toBe('ok');
  });

  it('defaults user role to viewer if missing', () => {
    const config = parseGovernanceConfig({ users: [{ username: 'test' }] });
    expect(config.users[0].role).toBe('viewer');
  });

  it('creates default workflow when workflows array is empty', () => {
    const config = parseGovernanceConfig({ workflows: [] });
    expect(config.workflows).toHaveLength(1);
    expect(config.workflows[0].requiredApprovals).toBe(1);
  });

  it('handles empty user list', () => {
    const config = parseGovernanceConfig({ users: [] });
    expect(config.users).toEqual([]);
  });
});

describe('validateApprovalRequest', () => {
  const config: GovernanceConfig = {
    version: 1,
    defaultRole: 'viewer',
    users: [],
    workflows: [
      { requiredApprovals: 2, approverRoles: ['approver', 'admin'], selfApproval: false },
    ],
    auditRetentionDays: 90,
  };

  it('returns met=true when enough approvals', () => {
    const request: ApprovalRequest = {
      id: 'req-1',
      flag: 'my-flag',
      action: 'update',
      author: 'alice',
      approvals: [
        { user: 'bob', role: 'approver', timestamp: Date.now() },
        { user: 'carol', role: 'admin', timestamp: Date.now() },
      ],
      status: 'pending',
      createdAt: Date.now(),
    };
    const result = validateApprovalRequest(request, config);
    expect(result.met).toBe(true);
    expect(result.received).toBe(2);
    expect(result.required).toBe(2);
    expect(result.missing).toBe(0);
  });

  it('blocks self-approval when selfApproval=false', () => {
    const request: ApprovalRequest = {
      id: 'req-2',
      flag: 'my-flag',
      action: 'create',
      author: 'alice',
      approvals: [
        { user: 'alice', role: 'admin', timestamp: Date.now() },
        { user: 'bob', role: 'approver', timestamp: Date.now() },
      ],
      status: 'pending',
      createdAt: Date.now(),
    };
    const result = validateApprovalRequest(request, config);
    expect(result.received).toBe(1);
    expect(result.met).toBe(false);
    expect(result.missing).toBe(1);
  });

  it('rejects approvals from wrong role', () => {
    const request: ApprovalRequest = {
      id: 'req-3',
      flag: 'my-flag',
      action: 'delete',
      author: 'alice',
      approvals: [
        { user: 'bob', role: 'viewer', timestamp: Date.now() },
        { user: 'carol', role: 'editor', timestamp: Date.now() },
      ],
      status: 'pending',
      createdAt: Date.now(),
    };
    const result = validateApprovalRequest(request, config);
    expect(result.met).toBe(false);
    expect(result.received).toBe(0);
    expect(result.missing).toBe(2);
  });

  it('uses pattern-matched workflow', () => {
    const patternConfig: GovernanceConfig = {
      version: 1,
      defaultRole: 'viewer',
      users: [],
      workflows: [
        {
          requiredApprovals: 3,
          approverRoles: ['admin'],
          selfApproval: false,
          flagPatterns: ['critical-*'],
        },
        { requiredApprovals: 1, approverRoles: ['approver', 'admin'], selfApproval: false },
      ],
      auditRetentionDays: 90,
    };
    const request: ApprovalRequest = {
      id: 'req-4',
      flag: 'critical-feature',
      action: 'update',
      author: 'alice',
      approvals: [{ user: 'bob', role: 'admin', timestamp: Date.now() }],
      status: 'pending',
      createdAt: Date.now(),
    };
    const result = validateApprovalRequest(request, patternConfig);
    expect(result.required).toBe(3);
    expect(result.met).toBe(false);
    expect(result.missing).toBe(2);
  });
});

describe('ComplianceAuditTrail', () => {
  it('appends events and assigns sequence numbers', () => {
    const trail = new ComplianceAuditTrail('secret-key');
    const event = trail.append({
      flag: 'my-flag',
      action: 'created',
      actor: 'alice',
      actorRole: 'admin',
      timestamp: 1000,
    });
    expect(event.sequence).toBe(1);
    expect(event.hash).toBeTruthy();
    expect(event.previousHash).toBe(
      '0000000000000000000000000000000000000000000000000000000000000000',
    );

    const event2 = trail.append({
      flag: 'my-flag',
      action: 'updated',
      actor: 'bob',
      actorRole: 'editor',
      timestamp: 2000,
    });
    expect(event2.sequence).toBe(2);
    expect(event2.previousHash).toBe(event.hash);
  });

  it('verifies chain integrity', () => {
    const trail = new ComplianceAuditTrail('key');
    trail.append({ flag: 'f1', action: 'created', actor: 'a', actorRole: 'admin', timestamp: 1 });
    trail.append({ flag: 'f2', action: 'updated', actor: 'b', actorRole: 'editor', timestamp: 2 });
    trail.append({
      flag: 'f3',
      action: 'deleted',
      actor: 'c',
      actorRole: 'approver',
      timestamp: 3,
    });
    const result = trail.verify();
    expect(result.valid).toBe(true);
    expect(result.message).toContain('3 events');
  });

  it('detects tampered events', () => {
    const trail = new ComplianceAuditTrail('key');
    trail.append({ flag: 'f1', action: 'created', actor: 'a', actorRole: 'admin', timestamp: 1 });
    trail.append({ flag: 'f2', action: 'updated', actor: 'b', actorRole: 'editor', timestamp: 2 });

    // Tamper with an event
    const events = trail.getEvents();
    (events as any)[1].actor = 'hacker';

    const result = trail.verify();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.message).toContain('hash mismatch');
  });

  it('detects chain break via previousHash tampering', () => {
    const trail = new ComplianceAuditTrail('key');
    trail.append({ flag: 'f1', action: 'created', actor: 'a', actorRole: 'admin', timestamp: 1 });
    trail.append({ flag: 'f2', action: 'updated', actor: 'b', actorRole: 'editor', timestamp: 2 });

    (trail.getEvents() as any)[1].previousHash = 'bad';
    const result = trail.verify();
    expect(result.valid).toBe(false);
    expect(result.message).toContain('previousHash mismatch');
  });

  it('loads existing events via constructor', () => {
    const trail1 = new ComplianceAuditTrail('key');
    trail1.append({ flag: 'f1', action: 'created', actor: 'a', actorRole: 'admin', timestamp: 1 });
    const existingEvents = [...trail1.getEvents()];

    const trail2 = new ComplianceAuditTrail('key', existingEvents);
    trail2.append({ flag: 'f2', action: 'updated', actor: 'b', actorRole: 'editor', timestamp: 2 });

    const result = trail2.verify();
    expect(result.valid).toBe(true);
    expect(trail2.getEvents()).toHaveLength(2);
  });

  it('queries events by filter', () => {
    const trail = new ComplianceAuditTrail('key');
    trail.append({
      flag: 'f1',
      action: 'created',
      actor: 'alice',
      actorRole: 'admin',
      timestamp: 100,
    });
    trail.append({
      flag: 'f2',
      action: 'updated',
      actor: 'bob',
      actorRole: 'editor',
      timestamp: 200,
    });
    trail.append({
      flag: 'f1',
      action: 'deleted',
      actor: 'alice',
      actorRole: 'admin',
      timestamp: 300,
    });

    expect(trail.query({ flag: 'f1' })).toHaveLength(2);
    expect(trail.query({ actor: 'bob' })).toHaveLength(1);
    expect(trail.query({ action: 'created' })).toHaveLength(1);
    expect(trail.query({ since: 200 })).toHaveLength(2);
    expect(trail.query({ until: 200 })).toHaveLength(2);
    expect(trail.query({ since: 150, until: 250 })).toHaveLength(1);
  });

  it('exports CSV', () => {
    const trail = new ComplianceAuditTrail('key');
    trail.append({
      flag: 'f1',
      action: 'created',
      actor: 'alice',
      actorRole: 'admin',
      timestamp: 1000,
    });
    const csv = trail.exportCsv();
    expect(csv).toContain('sequence,timestamp,flag,action,actor,actorRole,hash');
    expect(csv).toContain('f1');
    expect(csv).toContain('alice');
  });

  it('exports JSON', () => {
    const trail = new ComplianceAuditTrail('key');
    trail.append({
      flag: 'f1',
      action: 'created',
      actor: 'alice',
      actorRole: 'admin',
      timestamp: 1000,
    });
    const json = trail.exportJson();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].flag).toBe('f1');
  });

  it('verifies empty trail as valid', () => {
    const trail = new ComplianceAuditTrail('key');
    const result = trail.verify();
    expect(result.valid).toBe(true);
    expect(result.message).toContain('0 events');
  });
});

describe('formatGovernanceReport', () => {
  it('formats a governance report', () => {
    const config: GovernanceConfig = {
      version: 1,
      defaultRole: 'viewer',
      users: [
        { username: 'alice', role: 'admin', teams: ['platform'] },
        { username: 'bob', role: 'viewer' },
      ],
      workflows: [
        { requiredApprovals: 2, approverRoles: ['approver', 'admin'], selfApproval: false },
      ],
      auditRetentionDays: 90,
    };
    const report = formatGovernanceReport(config);
    expect(report).toContain('Governance Configuration');
    expect(report).toContain('alice');
    expect(report).toContain('bob');
    expect(report).toContain('2 approval(s)');
  });
});
