/**
 * Feature Flag Governance for TinyFlag.
 *
 * Provides RBAC role definitions, flag change approval workflows,
 * and compliance audit trail with tamper-proof event log.
 */

import { createHmac, createHash } from 'crypto';

// --- RBAC ---

/** Governance role levels (ordered by permission scope). */
export type GovernanceRole = 'viewer' | 'editor' | 'admin' | 'approver';

/** Permissions granted to each role. */
export interface RolePermissions {
  canView: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canAdmin: boolean;
  canExportAudit: boolean;
}

/** Map roles to permission sets. */
const ROLE_PERMISSIONS: Record<GovernanceRole, RolePermissions> = {
  viewer: {
    canView: true,
    canEdit: false,
    canApprove: false,
    canAdmin: false,
    canExportAudit: false,
  },
  editor: {
    canView: true,
    canEdit: true,
    canApprove: false,
    canAdmin: false,
    canExportAudit: false,
  },
  approver: {
    canView: true,
    canEdit: true,
    canApprove: true,
    canAdmin: false,
    canExportAudit: true,
  },
  admin: { canView: true, canEdit: true, canApprove: true, canAdmin: true, canExportAudit: true },
};

/** User entry in governance config. */
export interface GovernanceUser {
  username: string;
  role: GovernanceRole;
  email?: string;
  teams?: string[];
}

/** Approval workflow configuration. */
export interface ApprovalWorkflow {
  /** Minimum number of approvals required. Default: 1. */
  requiredApprovals: number;
  /** Roles that can approve. Default: ['approver', 'admin']. */
  approverRoles: GovernanceRole[];
  /** Whether the author can self-approve. Default: false. */
  selfApproval: boolean;
  /** Flag name patterns requiring approval (glob). Empty means all flags. */
  flagPatterns?: string[];
}

/** Governance configuration (loaded from governance.yml). */
export interface GovernanceConfig {
  version: number;
  users: GovernanceUser[];
  workflows: ApprovalWorkflow[];
  defaultRole: GovernanceRole;
  auditRetentionDays?: number;
}

/** Get permissions for a role. */
export function getPermissions(role: GovernanceRole): RolePermissions {
  return { ...ROLE_PERMISSIONS[role] };
}

/** Check if a user has a specific permission. */
export function hasPermission(user: GovernanceUser, permission: keyof RolePermissions): boolean {
  return ROLE_PERMISSIONS[user.role][permission];
}

/** Parse governance.yml content into config. */
export function parseGovernanceConfig(raw: Record<string, unknown>): GovernanceConfig {
  const version = typeof raw.version === 'number' ? raw.version : 1;
  const defaultRole = (
    typeof raw.defaultRole === 'string' ? raw.defaultRole : 'viewer'
  ) as GovernanceRole;

  const users: GovernanceUser[] = [];
  if (Array.isArray(raw.users)) {
    for (const u of raw.users) {
      if (typeof u === 'object' && u !== null) {
        const entry = u as Record<string, unknown>;
        users.push({
          username: String(entry.username || ''),
          role: String(entry.role || 'viewer') as GovernanceRole,
          email: typeof entry.email === 'string' ? entry.email : undefined,
          teams: Array.isArray(entry.teams) ? (entry.teams as string[]) : undefined,
        });
      }
    }
  }

  const workflows: ApprovalWorkflow[] = [];
  if (Array.isArray(raw.workflows)) {
    for (const w of raw.workflows) {
      if (typeof w === 'object' && w !== null) {
        const entry = w as Record<string, unknown>;
        workflows.push({
          requiredApprovals:
            typeof entry.requiredApprovals === 'number' ? entry.requiredApprovals : 1,
          approverRoles: Array.isArray(entry.approverRoles)
            ? (entry.approverRoles as GovernanceRole[])
            : ['approver', 'admin'],
          selfApproval: entry.selfApproval === true,
          flagPatterns: Array.isArray(entry.flagPatterns)
            ? (entry.flagPatterns as string[])
            : undefined,
        });
      }
    }
  }

  if (workflows.length === 0) {
    workflows.push({
      requiredApprovals: 1,
      approverRoles: ['approver', 'admin'],
      selfApproval: false,
    });
  }

  return {
    version,
    users,
    workflows,
    defaultRole,
    auditRetentionDays: typeof raw.auditRetentionDays === 'number' ? raw.auditRetentionDays : 90,
  };
}

// --- Approval Workflow ---

/** A pending approval request. */
export interface ApprovalRequest {
  id: string;
  flag: string;
  action: 'create' | 'update' | 'delete';
  author: string;
  approvals: Array<{ user: string; role: GovernanceRole; timestamp: number }>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
}

/** Validate whether an approval request meets workflow requirements. */
export function validateApprovalRequest(
  request: ApprovalRequest,
  config: GovernanceConfig,
): { met: boolean; required: number; received: number; missing: number } {
  const workflow = findMatchingWorkflow(request.flag, config.workflows);
  const validApprovals = request.approvals.filter((a) => {
    if (!workflow.selfApproval && a.user === request.author) return false;
    return workflow.approverRoles.includes(a.role);
  });

  const received = validApprovals.length;
  const required = workflow.requiredApprovals;
  return {
    met: received >= required,
    required,
    received,
    missing: Math.max(0, required - received),
  };
}

function matchGlob(pattern: string, value: string): boolean {
  if (pattern === value) return true;
  if (!pattern.includes('*')) return false;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('^' + escaped.replace(/\*/g, '.*') + '$');
  return regex.test(value);
}

function findMatchingWorkflow(flag: string, workflows: ApprovalWorkflow[]): ApprovalWorkflow {
  for (const w of workflows) {
    if (!w.flagPatterns || w.flagPatterns.length === 0) continue;
    if (w.flagPatterns.some((p) => matchGlob(p, flag))) return w;
  }
  // Return the first catch-all workflow (no patterns)
  const catchAll = workflows.find((w) => !w.flagPatterns || w.flagPatterns.length === 0);
  return catchAll ?? workflows[0];
}

// --- Tamper-proof Audit Trail ---

/** Compliance audit event with integrity chain. */
export interface ComplianceAuditEvent {
  sequence: number;
  flag: string;
  action: 'created' | 'updated' | 'deleted' | 'approved' | 'rejected' | 'exported';
  actor: string;
  actorRole: GovernanceRole;
  before?: unknown;
  after?: unknown;
  timestamp: number;
  metadata?: Record<string, unknown>;
  /** HMAC hash of this event for tamper detection. */
  hash: string;
  /** Hash of the previous event (chain integrity). */
  previousHash: string;
}

/** Create a tamper-proof audit trail manager. */
export class ComplianceAuditTrail {
  private events: ComplianceAuditEvent[] = [];
  private hmacKey: string;
  private lastHash: string = '0000000000000000000000000000000000000000000000000000000000000000';

  constructor(hmacKey: string, existingEvents?: ComplianceAuditEvent[]) {
    this.hmacKey = hmacKey;
    if (existingEvents && existingEvents.length > 0) {
      this.events = existingEvents;
      this.lastHash = existingEvents[existingEvents.length - 1].hash;
    }
  }

  /** Append an event to the audit trail. */
  append(
    event: Omit<ComplianceAuditEvent, 'sequence' | 'hash' | 'previousHash'>,
  ): ComplianceAuditEvent {
    const sequence = this.events.length + 1;
    const previousHash = this.lastHash;

    const payload = JSON.stringify({
      sequence,
      flag: event.flag,
      action: event.action,
      actor: event.actor,
      actorRole: event.actorRole,
      before: event.before,
      after: event.after,
      timestamp: event.timestamp,
      previousHash,
    });

    const hash = createHmac('sha256', this.hmacKey).update(payload).digest('hex');

    const fullEvent: ComplianceAuditEvent = {
      ...event,
      sequence,
      hash,
      previousHash,
    };

    this.events.push(fullEvent);
    this.lastHash = hash;
    return fullEvent;
  }

  /** Verify the integrity of the entire audit trail. */
  verify(): { valid: boolean; brokenAt?: number; message: string } {
    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];

      if (event.previousHash !== prevHash) {
        return {
          valid: false,
          brokenAt: i + 1,
          message: `Chain broken at event ${i + 1}: previousHash mismatch`,
        };
      }

      const payload = JSON.stringify({
        sequence: event.sequence,
        flag: event.flag,
        action: event.action,
        actor: event.actor,
        actorRole: event.actorRole,
        before: event.before,
        after: event.after,
        timestamp: event.timestamp,
        previousHash: event.previousHash,
      });

      const expectedHash = createHmac('sha256', this.hmacKey).update(payload).digest('hex');
      if (event.hash !== expectedHash) {
        return {
          valid: false,
          brokenAt: i + 1,
          message: `Tampered event at ${i + 1}: hash mismatch`,
        };
      }

      prevHash = event.hash;
    }

    return { valid: true, message: `All ${this.events.length} events verified` };
  }

  /** Get all events. */
  getEvents(): readonly ComplianceAuditEvent[] {
    return this.events;
  }

  /** Get events filtered by flag, actor, or time range. */
  query(filters: {
    flag?: string;
    actor?: string;
    action?: ComplianceAuditEvent['action'];
    since?: number;
    until?: number;
  }): ComplianceAuditEvent[] {
    return this.events.filter((e) => {
      if (filters.flag && !matchGlob(filters.flag, e.flag)) return false;
      if (filters.actor && e.actor !== filters.actor) return false;
      if (filters.action && e.action !== filters.action) return false;
      if (filters.since && e.timestamp < filters.since) return false;
      if (filters.until && e.timestamp > filters.until) return false;
      return true;
    });
  }

  /** Export events to CSV format. */
  exportCsv(events?: ComplianceAuditEvent[]): string {
    const rows = events ?? this.events;
    const header = 'sequence,timestamp,flag,action,actor,actorRole,hash\n';
    const lines = rows.map(
      (e) =>
        `${e.sequence},${new Date(e.timestamp).toISOString()},${e.flag},${e.action},${e.actor},${e.actorRole},${e.hash}`,
    );
    return header + lines.join('\n');
  }

  /** Export events to JSON format. */
  exportJson(events?: ComplianceAuditEvent[]): string {
    return JSON.stringify(events ?? this.events, null, 2);
  }
}

/** Format governance config as human-readable report. */
export function formatGovernanceReport(config: GovernanceConfig): string {
  const lines: string[] = [];

  lines.push('Governance Configuration');
  lines.push('═'.repeat(50));
  lines.push(`Version: ${config.version}`);
  lines.push(`Default role: ${config.defaultRole}`);
  lines.push(`Audit retention: ${config.auditRetentionDays ?? 90} days`);
  lines.push('');

  lines.push(`Users (${config.users.length}):`);
  for (const user of config.users) {
    const perms = getPermissions(user.role);
    const badges = [];
    if (perms.canAdmin) badges.push('👑');
    if (perms.canApprove) badges.push('✅');
    if (perms.canEdit) badges.push('✏️');
    lines.push(
      `  ${badges.join('')} ${user.username} — ${user.role}${user.teams ? ` [${user.teams.join(', ')}]` : ''}`,
    );
  }
  lines.push('');

  lines.push(`Workflows (${config.workflows.length}):`);
  for (const wf of config.workflows) {
    const scope = wf.flagPatterns ? wf.flagPatterns.join(', ') : '(all flags)';
    lines.push(
      `  • ${wf.requiredApprovals} approval(s) from ${wf.approverRoles.join('/')} — scope: ${scope}`,
    );
  }

  return lines.join('\n');
}
