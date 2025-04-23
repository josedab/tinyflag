import { lintConfig, loadLintConfig, formatLintResults, formatLintSarif } from '../lint.js';
import { loadAndValidate } from './utils.js';

export function handleLint(args: string[], jsonMode: boolean): void {
  const filePath = args.find((a) => !a.startsWith('-'));
  if (!filePath) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag lint <file> [--format json|sarif] [--config <rc-path>]');
    process.exit(1);
  }

  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : undefined;
  const configIdx = args.indexOf('--config');
  const configPath = configIdx !== -1 ? args[configIdx + 1] : undefined;

  const config = loadAndValidate(filePath);
  const lintCfg = loadLintConfig(configPath);
  const results = lintConfig(config, lintCfg);

  if (format === 'sarif') {
    console.log(JSON.stringify(formatLintSarif(results, filePath), null, 2));
    const hasErrors = results.some((r) => r.severity === 'error');
    if (hasErrors) process.exit(1);
    return;
  }

  if (jsonMode || format === 'json') {
    console.log(JSON.stringify({ command: 'lint', file: filePath, results }, null, 2));
    const hasErrors = results.some((r) => r.severity === 'error');
    if (hasErrors) process.exit(1);
    return;
  }

  console.log(formatLintResults(results));
  const hasErrors = results.some((r) => r.severity === 'error');
  if (hasErrors) process.exit(1);
}
