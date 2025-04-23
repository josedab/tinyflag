import { readFileSync } from 'fs';
import {
  parseYaml,
  listTenants,
  diffTenantFlags,
  formatTenantList,
  validateTenantIsolation,
} from 'tinyflag';
import type { MultiTenantFlagConfig } from 'tinyflag';

export function handleTenant(args: string[], jsonMode: boolean): void {
  const subCommand = args[0];

  if (subCommand === 'list') {
    const flagFile = args[1];
    if (!flagFile) {
      console.error('Usage: tinyflag tenant list <file>');
      process.exit(1);
    }
    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content) as MultiTenantFlagConfig;
    if (jsonMode) {
      console.log(JSON.stringify({ tenants: listTenants(raw) }, null, 2));
    } else {
      console.log(formatTenantList(raw));
    }
  } else if (subCommand === 'diff') {
    const flagFile = args[1];
    if (!flagFile) {
      console.error('Usage: tinyflag tenant diff <file> --a <tenant1> --b <tenant2>');
      process.exit(1);
    }
    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content) as MultiTenantFlagConfig;

    const aIdx = args.indexOf('--a');
    const bIdx = args.indexOf('--b');
    const tenantA = aIdx >= 0 && args[aIdx + 1] ? args[aIdx + 1] : null;
    const tenantB = bIdx >= 0 && args[bIdx + 1] ? args[bIdx + 1] : null;

    const diffs = diffTenantFlags(raw, tenantA, tenantB);
    if (jsonMode) {
      console.log(JSON.stringify(diffs, null, 2));
    } else if (diffs.length === 0) {
      console.log('No differences found.');
    } else {
      for (const diff of diffs) {
        const icon = diff.type === 'added' ? '➕' : diff.type === 'removed' ? '➖' : '🔄';
        console.log(`${icon} ${diff.flag} (${diff.type})`);
        if (diff.changes) {
          for (const c of diff.changes) {
            console.log(`    ${c}`);
          }
        }
      }
    }
  } else if (subCommand === 'validate') {
    const flagFile = args[1];
    if (!flagFile) {
      console.error('Usage: tinyflag tenant validate <file>');
      process.exit(1);
    }
    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content) as MultiTenantFlagConfig;
    const violations = validateTenantIsolation(raw);
    if (jsonMode) {
      console.log(JSON.stringify({ passed: violations.length === 0, violations }, null, 2));
    } else if (violations.length === 0) {
      console.log('✅ No tenant isolation violations found.');
    } else {
      console.log('❌ Tenant isolation violations:');
      for (const v of violations) {
        console.log(
          `  Flag "${v.flag}" from tenant "${v.sourceTenant}" leaked to "${v.leakedToTenant}"`,
        );
      }
      process.exit(1);
    }
  } else {
    console.error('Usage: tinyflag tenant <list|diff|validate> <file>');
    process.exit(1);
  }
}
