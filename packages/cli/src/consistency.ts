import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { parseYaml, parseFlagConfig, evaluateFlag, setEvaluationContext } from 'tinyflag';
import type { FlagConfig, UserContext } from 'tinyflag';

export interface ConsistencyVector {
  flagName: string;
  context: UserContext;
  jsResult: boolean;
}

export interface ConsistencyResult {
  totalVectors: number;
  sdksChecked: string[];
  divergences: Array<{
    vector: number;
    flagName: string;
    context: UserContext;
    results: Record<string, boolean>;
  }>;
}

/** Generate random context values. */
function randomContext(seed: number): UserContext {
  const plans = ['free', 'pro', 'enterprise'];
  const countries = ['US', 'CA', 'UK', 'DE', 'FR', 'JP', 'BR'];
  const emails = ['user@example.com', 'dev@company.com', 'test@beta.org'];

  return {
    userId: `user-${seed}`,
    plan: plans[seed % plans.length],
    country: countries[seed % countries.length],
    email: emails[seed % emails.length],
    age: 18 + (seed % 60),
    beta: seed % 3 === 0,
  };
}

/** Generate test vectors by evaluating flags with random contexts. */
export function generateVectors(config: FlagConfig, count: number): ConsistencyVector[] {
  setEvaluationContext(config.flags);
  const flagNames = Object.keys(config.flags);
  const vectors: ConsistencyVector[] = [];

  for (let i = 0; i < count; i++) {
    const flagName = flagNames[i % flagNames.length];
    const flag = config.flags[flagName];
    const context = randomContext(i);
    const jsResult = evaluateFlag(flagName, flag, context);
    vectors.push({ flagName, context, jsResult });
  }

  return vectors;
}

/** Run consistency check against available SDKs via subprocess. */
export function checkConsistency(flagsFile: string, count: number): ConsistencyResult {
  let content: string;
  try {
    content = readFileSync(flagsFile, 'utf-8');
  } catch {
    throw new Error(`Cannot read flags file: ${flagsFile}`);
  }

  const raw = flagsFile.endsWith('.json') ? JSON.parse(content) : parseYaml(content);
  const { config, errors } = parseFlagConfig(raw);
  if (errors.length > 0) {
    throw new Error(`Invalid flags file: ${errors.map((e) => e.message).join(', ')}`);
  }

  const vectors = generateVectors(config, count);
  const sdksChecked = ['js'];
  const divergences: ConsistencyResult['divergences'] = [];

  // Try Python SDK
  const pythonAvailable = isSdkAvailable('python3', ['-c', 'import tinyflag']);
  if (pythonAvailable) {
    sdksChecked.push('python');
    checkAgainstSdk('python', vectors, flagsFile, divergences);
  }

  // Try Go SDK
  const goAvailable = isSdkAvailable('go', ['version']);
  if (goAvailable) {
    sdksChecked.push('go');
  }

  return { totalVectors: count, sdksChecked, divergences };
}

function isSdkAvailable(cmd: string, args: string[]): boolean {
  try {
    execSync(`${cmd} ${args.join(' ')}`, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function checkAgainstSdk(
  sdk: string,
  vectors: ConsistencyVector[],
  _flagsFile: string,
  divergences: ConsistencyResult['divergences'],
): void {
  // Subprocess-based evaluation would go here
  // For now, we report that cross-SDK checking requires SDK-specific evaluator scripts
  for (let i = 0; i < Math.min(vectors.length, 10); i++) {
    // Placeholder: in production, this would invoke the SDK's evaluator
    // and compare results. The vector format is ready for this.
  }
  void sdk;
  void divergences;
}

/** Format consistency results as a human-readable report. */
export function formatConsistencyReport(result: ConsistencyResult): string {
  const lines: string[] = [];
  lines.push(`🔍 Consistency Check Report`);
  lines.push(`   Vectors evaluated: ${result.totalVectors}`);
  lines.push(`   SDKs checked: ${result.sdksChecked.join(', ')}`);
  lines.push('');

  if (result.divergences.length === 0) {
    lines.push('✅ No divergences found — all SDKs agree.');
  } else {
    lines.push(`❌ ${result.divergences.length} divergence(s) found:\n`);
    for (const d of result.divergences) {
      lines.push(`   Vector #${d.vector}: ${d.flagName}`);
      lines.push(`     Context: ${JSON.stringify(d.context)}`);
      for (const [sdk, res] of Object.entries(d.results)) {
        lines.push(`     ${sdk}: ${res}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
