import { writeFileSync } from 'fs';
import {
  scanForFlagPatterns,
  formatSuggestionsAsYaml,
  formatSuggestionsReport,
} from '../suggest.js';

export function handleSuggest(args: string[], jsonMode: boolean): void {
  const dir = args[0] || '.';
  const outputIdx = args.indexOf('-o');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const suggestions = scanForFlagPatterns(dir);

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'suggest', directory: dir, suggestions }, null, 2));
    return;
  }

  if (suggestions.length === 0) {
    console.log('No feature flag patterns detected in the codebase.');
    return;
  }

  console.log(formatSuggestionsReport(suggestions));

  if (outputPath) {
    const yaml = formatSuggestionsAsYaml(suggestions);
    writeFileSync(outputPath, yaml, 'utf-8');
    console.log(`✅ Suggested flags written to ${outputPath}`);
  } else {
    console.log('Suggested YAML:\n');
    console.log(formatSuggestionsAsYaml(suggestions));
  }
}
