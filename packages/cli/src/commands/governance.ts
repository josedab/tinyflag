import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parseYaml } from 'tinyflag';
import {
  parseGovernanceConfig,
  ComplianceAuditTrail,
  formatGovernanceReport,
  validateApprovalRequest,
} from 'tinyflag';
import type { GovernanceConfig, ApprovalRequest, GovernanceRole } from 'tinyflag';

const DEFAULT_GOVERNANCE_FILE = 'governance.yml';
const DEFAULT_AUDIT_FILE = '.tinyflag-audit.json';
const DEFAULT_HMAC_KEY = 'tinyflag-audit-key';

function loadGovernanceConfig(filePath: string): GovernanceConfig {
  if (!existsSync(filePath)) {
    throw new Error(`Governance config not found: ${filePath}. Create governance.yml to get started.`);
  }
  const content = readFileSync(filePath, 'utf8');
  const raw = parseYaml(content) as Record<string, unknown>;
  return parseGovernanceConfig(raw);
}

function loadAuditTrail(auditFile: string): ComplianceAuditTrail {
  const hmacKey = process.env.TINYFLAG_AUDIT_KEY || DEFAULT_HMAC_KEY;
  if (existsSync(auditFile)) {
    try {
      const data = JSON.parse(readFileSync(auditFile, 'utf8'));
      return new ComplianceAuditTrail(hmacKey, Array.isArray(data) ? data : []);
    } catch {
      return new ComplianceAuditTrail(hmacKey);
    }
  }
  return new ComplianceAuditTrail(hmacKey);
}

export function handleGovernance(args: string[], jsonMode: boolean): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    console.log(`Usage: tinyflag governance <subcommand> [options]

Subcommands:
  show                   Show governance configuration
  check <flag>           Check if a flag change requires approval
  audit export           Export compliance audit trail
  audit verify           Verify audit trail integrity
  audit log              Show recent audit events

Options:
  --config <file>        Governance config file (default: governance.yml)
  --audit-file <file>    Audit trail file (default: .tinyflag-audit.json)
  --format <csv|json>    Export format (default: json)
  --flag <name>          Filter by flag name
  --actor <name>         Filter by actor
  --since <ISO8601>      Filter events after date
  --output <file>        Write export to file`);
    return;
  }

  const configIdx = args.indexOf('--config');
  const configFile = configIdx >= 0 && args[configIdx + 1] ? args[configIdx + 1] : DEFAULT_GOVERNANCE_FILE;

  const auditIdx = args.indexOf('--audit-file');
  const auditFile = auditIdx >= 0 && args[auditIdx + 1] ? args[auditIdx + 1] : DEFAULT_AUDIT_FILE;

  switch (subcommand) {
    case 'show':
      handleGovernanceShow(configFile, jsonMode);
      break;
    case 'check':
      handleGovernanceCheck(args.slice(1), configFile, jsonMode);
      break;
    case 'audit':
      handleGovernanceAudit(args.slice(1), configFile, auditFile, jsonMode);
      break;
    default:
      console.error(`Unknown governance subcommand: ${subcommand}`);
      process.exit(1);
  }
}

function handleGovernanceShow(configFile: string, jsonMode: boolean): void {
  try {
    const config = loadGovernanceConfig(configFile);

    if (jsonMode) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log(formatGovernanceReport(config));
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

function handleGovernanceCheck(args: string[], configFile: string, jsonMode: boolean): void {
  const flagName = args[0];
  if (!flagName) {
    console.error('Usage: tinyflag governance check <flag> --author <user> --approvers user1,user2');
    process.exit(1);
  }

  const authorIdx = args.indexOf('--author');
  const author = authorIdx >= 0 && args[authorIdx + 1] ? args[authorIdx + 1] : 'unknown';

  const approversIdx = args.indexOf('--approvers');
  const approverNames = approversIdx >= 0 && args[approversIdx + 1] ? args[approversIdx + 1].split(',') : [];

  try {
    const config = loadGovernanceConfig(configFile);

    const request: ApprovalRequest = {
      id: `req-${Date.now()}`,
      flag: flagName,
      action: 'update',
      author,
      approvals: approverNames.map((name) => {
        const user = config.users.find((u) => u.username === name);
        return { user: name, role: (user?.role ?? 'viewer') as GovernanceRole, timestamp: Date.now() };
      }),
      status: 'pending',
      createdAt: Date.now(),
    };

    const result = validateApprovalRequest(request, config);

    if (jsonMode) {
      console.log(JSON.stringify({ flag: flagName, ...result }, null, 2));
    } else {
      if (result.met) {
        console.log(`✅ Approval requirements met for "${flagName}" (${result.received}/${result.required})`);
      } else {
        console.log(`❌ Missing approvals for "${flagName}": need ${result.missing} more (${result.received}/${result.required})`);
      }
    }

    process.exit(result.met ? 0 : 1);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

function handleGovernanceAudit(args: string[], configFile: string, auditFile: string, jsonMode: boolean): void {
  const action = args[0];

  switch (action) {
    case 'export':
      handleAuditExport(args.slice(1), auditFile, jsonMode);
      break;
    case 'verify':
      handleAuditVerify(auditFile, jsonMode);
      break;
    case 'log':
      handleAuditLog(args.slice(1), auditFile, jsonMode);
      break;
    default:
      console.error('Usage: tinyflag governance audit <export|verify|log>');
      process.exit(1);
  }
}

function handleAuditExport(args: string[], auditFile: string, jsonMode: boolean): void {
  const formatIdx = args.indexOf('--format');
  const format = formatIdx >= 0 && args[formatIdx + 1] ? args[formatIdx + 1] : 'json';

  const outputIdx = args.indexOf('--output');
  const outputFile = outputIdx >= 0 && args[outputIdx + 1] ? args[outputIdx + 1] : undefined;

  const flagIdx = args.indexOf('--flag');
  const flagFilter = flagIdx >= 0 && args[flagIdx + 1] ? args[flagIdx + 1] : undefined;

  const actorIdx = args.indexOf('--actor');
  const actorFilter = actorIdx >= 0 && args[actorIdx + 1] ? args[actorIdx + 1] : undefined;

  const sinceIdx = args.indexOf('--since');
  const sinceFilter = sinceIdx >= 0 && args[sinceIdx + 1] ? new Date(args[sinceIdx + 1]).getTime() : undefined;

  const trail = loadAuditTrail(auditFile);
  const events = trail.query({
    flag: flagFilter,
    actor: actorFilter,
    since: sinceFilter,
  });

  let output: string;
  if (format === 'csv') {
    output = trail.exportCsv(events);
  } else {
    output = trail.exportJson(events);
  }

  if (outputFile) {
    writeFileSync(outputFile, output, 'utf8');
    console.log(`Exported ${events.length} events to ${outputFile} (${format})`);
  } else {
    console.log(output);
  }
}

function handleAuditVerify(auditFile: string, jsonMode: boolean): void {
  const trail = loadAuditTrail(auditFile);
  const result = trail.verify();

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.valid) {
      console.log(`✅ ${result.message}`);
    } else {
      console.log(`❌ ${result.message}`);
    }
  }

  process.exit(result.valid ? 0 : 1);
}

function handleAuditLog(args: string[], auditFile: string, jsonMode: boolean): void {
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : 20;

  const trail = loadAuditTrail(auditFile);
  const events = trail.getEvents();
  const recent = events.slice(-limit);

  if (jsonMode) {
    console.log(JSON.stringify(recent, null, 2));
  } else {
    if (recent.length === 0) {
      console.log('No audit events found.');
      return;
    }

    console.log(`📋 Compliance Audit Log (last ${recent.length} of ${events.length})`);
    console.log('═'.repeat(60));
    for (const e of recent) {
      const time = new Date(e.timestamp).toISOString();
      const icon = e.action === 'created' ? '🆕' : e.action === 'deleted' ? '🗑️' : e.action === 'approved' ? '✅' : '✏️';
      console.log(`  ${icon} #${e.sequence} ${time} ${e.actor}(${e.actorRole}) ${e.action} "${e.flag}"`);
    }
  }
}
