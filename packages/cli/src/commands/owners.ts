import { readFileSync } from 'fs';
import { parseYaml, parseFlagConfig } from 'tinyflag';
import {
  loadFlagOwners,
  resolveOwnership,
  checkApprovals,
  formatApprovalResult,
  formatOwnershipReport,
} from '../governance.js';

export function handleOwners(args: string[], jsonMode: boolean): void {
  const subCommand = args[0];

  const ownersIdx = args.indexOf('--owners');
  const ownersFile =
    ownersIdx >= 0 && args[ownersIdx + 1] ? args[ownersIdx + 1] : 'flag-owners.yml';

  if (subCommand === 'check') {
    // Check approvals for changed flags
    const flagFile = args[1];
    if (!flagFile) {
      console.error(
        'Usage: tinyflag owners check <file> --owners <owners-file> --approvers user1,user2 --changed flag1,flag2',
      );
      process.exit(1);
    }

    const approversIdx = args.indexOf('--approvers');
    const approvers =
      approversIdx >= 0 && args[approversIdx + 1] ? args[approversIdx + 1].split(',') : [];

    const changedIdx = args.indexOf('--changed');
    const changedFlags =
      changedIdx >= 0 && args[changedIdx + 1] ? args[changedIdx + 1].split(',') : [];

    const ownersConfig = loadFlagOwners(ownersFile);
    const result = checkApprovals(changedFlags, ownersConfig, approvers);

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatApprovalResult(result));
    }

    process.exit(result.passed ? 0 : 1);
  } else {
    // Show ownership report for all flags
    const flagFile = subCommand;
    if (!flagFile) {
      console.error('Usage: tinyflag owners <file> [--owners <owners-file>]');
      process.exit(1);
    }

    const content = readFileSync(flagFile, 'utf8');
    const raw = parseYaml(content);
    const config = parseFlagConfig(raw);
    const ownersConfig = loadFlagOwners(ownersFile);

    if (jsonMode) {
      const results = Object.keys(config.flags).map((f) => resolveOwnership(f, ownersConfig));
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(formatOwnershipReport(config, ownersConfig));
    }
  }
}
