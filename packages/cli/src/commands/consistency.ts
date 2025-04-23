import { checkConsistency, formatConsistencyReport } from '../consistency.js';

export function handleConsistencyCheck(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag consistency-check <file> [--vectors <count>] [--json]');
    process.exit(1);
  }

  const vectorsIdx = args.indexOf('--vectors');
  const count = vectorsIdx !== -1 ? parseInt(args[vectorsIdx + 1], 10) : 10000;
  if (isNaN(count) || count < 1) {
    console.error('Error: --vectors must be a positive integer');
    process.exit(1);
  }

  try {
    const result = checkConsistency(filePath, count);
    if (jsonMode) {
      console.log(JSON.stringify({ command: 'consistency-check', ...result }, null, 2));
    } else {
      console.log(formatConsistencyReport(result));
    }

    if (result.divergences.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Consistency check failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
