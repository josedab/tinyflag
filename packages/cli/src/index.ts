import {
  handleGenerate,
  handleValidate,
  handleDiff,
  handleDeps,
  handleStale,
  handleSign,
  handleVerify,
  handleKeygen,
  handleInline,
  handleSuggest,
  handleAudit,
  handlePull,
  handlePush,
  handleEval,
  handleReplay,
  handleLifecycle,
  handleLint,
  handleConsistencyCheck,
  handleOwners,
  handleTenant,
  handleImpact,
  handleTest,
  handleCanary,
  handleOverlay,
  handleExperiment,
  handleCodemod,
  handleSegments,
} from './commands/index.js';

const USAGE = `
Usage: tinyflag <command> [options]

Commands:
  generate <file> [-o <output>]   Generate TypeScript types from a flags file
  generate <file> --openapi [-o]  Generate OpenAPI 3.1 spec from a flags file
  generate <file> --graphql [-o]  Generate GraphQL schema from a flags file
  generate <file> --check -o <f>  Check if generated types are up-to-date (CI)
  validate <file...>              Validate one or more flags files (merged in order)
  validate <file> --watch         Validate and re-validate on file changes
  validate <file> --strict        Validate with strict mode (reject unknown fields)
  validate <file> --env prod      Validate with environment overlay (base + env file)
  diff <ref1>..<ref2> [--file f]  Show flag changes between git refs
  diff --env a --env b [--file f] Show differences between environments
  deps <file...>                  Show flag dependency graph
  stale <dir> --flags <file>      Detect stale/unused flags
  sign <file> --key <private-key> Sign a flag file with Ed25519
  verify <file> --pub <key...>    Verify a signed flag file
  keygen [-o <prefix>]            Generate Ed25519 key pair
  audit <file>                    Show flag change history from git log
  pull <url> -o <output>          Pull flag config from remote URL
  push <url> --file <file>        Push flag config to remote URL
  inline <file> [--format esm]    Inline flags as JS module for edge runtimes
  suggest <dir>                   Scan code for feature flag patterns and suggest definitions
  eval <flag> --file <f>          Evaluate a flag (use --persona <name> or --context key=val)
  lifecycle <file>                Show lifecycle state distribution of flags
  consistency-check <file>        Check evaluation consistency across SDKs
  lint <file>                     Lint flag file for issues (--format json/sarif)
  owners <file>                   Show flag ownership (--owners <owners-file>)
  owners check <file>             Check PR approvals (--approvers user1,user2)
  tenant list <file>              List tenants in config
  tenant diff <file>              Compare flags between tenants (--a tenant1 --b tenant2)
  impact <flag> --dir <dir>       Analyze flag blast radius (--flags <file>)
  test <specs-dir> --flags <f>    Run declarative flag test specs (--junit <out>)
  canary <flag>                   Start canary rollout (--adapter prometheus --url <url>)
  overlay list <dir>              List active ephemeral overlays
  overlay apply <file> --dir <d>  Apply flag overlay to base config
  overlay cleanup <dir>           Remove expired overlays
  replay <log> --flags <file>     Replay evaluations (--at timestamp, --html report.html)
  experiment results <flag>       Show experiment analysis (--flags <file> --data <file>)
  codemod --flags <file>          Remove dead flag code (--archived --dry-run --ci)
  segments list <file>            List segment definitions
  segments impact <seg> --flags f Analyze segment impact on flags
  help                            Show this help message

Options:
  --json                          Output structured JSON instead of human-readable text

Examples:
  npx tinyflag generate ./flags.yml
  npx tinyflag generate ./flags.yml -o ./src/flags.d.ts
  npx tinyflag validate ./flags.yml
  npx tinyflag validate ./base.yml ./prod.yml
  npx tinyflag validate ./flags.yml --json
  npx tinyflag diff main..HEAD
  npx tinyflag diff main..HEAD --file config/flags.yml
  npx tinyflag keygen -o ./keys/tinyflag
  npx tinyflag sign ./flags.yml --key ./keys/tinyflag.key
  npx tinyflag verify ./flags.yml --pub ./keys/tinyflag.pub
`.trim();

const COMMANDS = [
  'generate', 'validate', 'diff', 'deps', 'stale', 'sign', 'verify', 'keygen',
  'audit', 'pull', 'push', 'inline', 'suggest', 'eval', 'lifecycle',
  'consistency-check', 'lint', 'owners', 'tenant', 'impact', 'test', 'canary',
  'overlay', 'replay', 'experiment', 'codemod', 'segments', 'help',
];

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function suggestCommand(input: string): string | null {
  let best = '';
  let bestDist = Infinity;
  for (const cmd of COMMANDS) {
    const dist = levenshtein(input, cmd);
    if (dist < bestDist) {
      bestDist = dist;
      best = cmd;
    }
  }
  return bestDist <= 3 ? best : null;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    console.log(USAGE);
    process.exit(0);
  }

  const jsonMode = args.includes('--json');
  const watchMode = args.includes('--watch');
  const strictMode = args.includes('--strict');
  const filteredArgs = args.filter((a) => a !== '--json' && a !== '--watch' && a !== '--strict');

  const command = filteredArgs[0];

  switch (command) {
    case 'generate':
      handleGenerate(filteredArgs.slice(1), jsonMode);
      break;
    case 'validate':
      handleValidate(filteredArgs.slice(1), jsonMode, watchMode, strictMode);
      break;
    case 'diff':
      handleDiff(filteredArgs.slice(1), jsonMode);
      break;
    case 'deps':
      handleDeps(filteredArgs.slice(1), jsonMode);
      break;
    case 'stale':
      handleStale(filteredArgs.slice(1), jsonMode);
      break;
    case 'sign':
      handleSign(filteredArgs.slice(1));
      break;
    case 'verify':
      handleVerify(filteredArgs.slice(1), jsonMode);
      break;
    case 'keygen':
      handleKeygen(filteredArgs.slice(1));
      break;
    case 'audit':
      handleAudit(filteredArgs.slice(1), jsonMode);
      break;
    case 'pull':
      handlePull(filteredArgs.slice(1), jsonMode);
      break;
    case 'push':
      handlePush(filteredArgs.slice(1), jsonMode);
      break;
    case 'inline':
      handleInline(filteredArgs.slice(1));
      break;
    case 'suggest':
      handleSuggest(filteredArgs.slice(1), jsonMode);
      break;
    case 'eval':
      handleEval(filteredArgs.slice(1), jsonMode);
      break;
    case 'lifecycle':
      handleLifecycle(filteredArgs.slice(1), jsonMode);
      break;
    case 'consistency-check':
      handleConsistencyCheck(filteredArgs.slice(1), jsonMode);
      break;
    case 'lint':
      handleLint(filteredArgs.slice(1), jsonMode);
      break;
    case 'owners':
      handleOwners(filteredArgs.slice(1), jsonMode);
      break;
    case 'tenant':
      handleTenant(filteredArgs.slice(1), jsonMode);
      break;
    case 'impact':
      handleImpact(filteredArgs.slice(1), jsonMode);
      break;
    case 'test':
      handleTest(filteredArgs.slice(1), jsonMode);
      break;
    case 'canary':
      handleCanary(filteredArgs.slice(1), jsonMode);
      break;
    case 'overlay':
      handleOverlay(filteredArgs.slice(1), jsonMode);
      break;
    case 'replay':
      handleReplay(filteredArgs.slice(1), jsonMode);
      break;
    case 'experiment':
      handleExperiment(filteredArgs.slice(1), jsonMode);
      break;
    case 'codemod':
      handleCodemod(filteredArgs.slice(1), jsonMode);
      break;
    case 'segments':
      handleSegments(filteredArgs.slice(1), jsonMode);
      break;
    default: {
      console.error(`Unknown command: ${command}\n`);
      const suggestion = suggestCommand(command);
      if (suggestion) {
        console.error(`Did you mean: ${suggestion}?\n`);
      }
      console.log(USAGE);
      process.exit(1);
    }
  }
}

main();
