import { loadAndValidate } from './utils.js';
import type { FlagConfig, SegmentDefinition } from 'tinyflag';

export function handleSegments(args: string[], jsonMode: boolean): void {
  const subCommand = args[0];

  switch (subCommand) {
    case 'list':
      handleSegmentsList(args.slice(1), jsonMode);
      break;
    case '--impact':
    case 'impact':
      handleSegmentsImpact(args.slice(1), jsonMode);
      break;
    default:
      console.error('Usage: tinyflag segments list <file>');
      console.log('       tinyflag segments impact <segment> --flags <file>');
      process.exit(1);
  }
}

function handleSegmentsList(args: string[], jsonMode: boolean): void {
  const filePath = args[0];
  if (!filePath) {
    console.error('Error: Missing flags file path');
    process.exit(1);
  }

  const config = loadAndValidate(filePath);
  const segments = config.segments || {};

  if (jsonMode) {
    console.log(JSON.stringify({ command: 'segments-list', segments }, null, 2));
    return;
  }

  const segNames = Object.keys(segments).sort();
  if (segNames.length === 0) {
    console.log('No segments defined.');
    return;
  }

  console.log(`📋 Segments (${segNames.length}):\n`);
  for (const name of segNames) {
    const seg = segments[name];
    const extendsStr = seg.extends?.length ? ` extends [${seg.extends.join(', ')}]` : '';
    const operatorStr = seg.operator ? ` (${seg.operator})` : '';
    const versionStr = seg.version ? ` v${seg.version}` : '';
    const descStr = seg.description ? ` — ${seg.description}` : '';
    console.log(`  ${name}${versionStr}${extendsStr}${operatorStr}${descStr}`);

    const condEntries = Object.entries(seg.conditions);
    for (const [key, value] of condEntries) {
      console.log(`    ${key}: ${JSON.stringify(value)}`);
    }

    // Check for circular references
    const circularPath = detectCircularSegment(name, segments);
    if (circularPath) {
      console.log(`    ⚠️  Circular reference: ${circularPath.join(' → ')}`);
    }
    console.log('');
  }
}

function handleSegmentsImpact(args: string[], jsonMode: boolean): void {
  const flagsIdx = args.indexOf('--flags');
  const flagsFile = flagsIdx !== -1 ? args[flagsIdx + 1] : undefined;
  const segmentName = args.find((a) => !a.startsWith('-') && a !== flagsFile);

  if (!segmentName || !flagsFile) {
    console.error('Error: Missing arguments');
    console.log('Usage: tinyflag segments impact <segment> --flags <file>');
    process.exit(1);
  }

  const config = loadAndValidate(flagsFile);
  const segments = config.segments || {};

  if (!segments[segmentName]) {
    console.error(`Error: Segment "${segmentName}" not found`);
    process.exit(1);
  }

  // Find all flags that reference this segment
  const impactedFlags: Array<{ flag: string; ruleIndex: number }> = [];
  for (const [flagName, flagDef] of Object.entries(config.flags)) {
    if (flagDef.rules) {
      for (let i = 0; i < flagDef.rules.length; i++) {
        const rule = flagDef.rules[i];
        if (rule.segment === segmentName) {
          impactedFlags.push({ flag: flagName, ruleIndex: i });
        }
      }
    }
  }

  // Find segments that extend this segment
  const dependentSegments: string[] = [];
  for (const [name, seg] of Object.entries(segments)) {
    if (seg.extends?.includes(segmentName)) {
      dependentSegments.push(name);
    }
  }

  if (jsonMode) {
    console.log(JSON.stringify({
      command: 'segments-impact',
      segment: segmentName,
      definition: segments[segmentName],
      impactedFlags,
      dependentSegments,
    }, null, 2));
    return;
  }

  console.log(`🎯 Impact Analysis: segment "${segmentName}"\n`);

  const seg = segments[segmentName];
  console.log('  Definition:');
  for (const [key, value] of Object.entries(seg.conditions)) {
    console.log(`    ${key}: ${JSON.stringify(value)}`);
  }
  if (seg.extends?.length) {
    console.log(`    extends: [${seg.extends.join(', ')}] (${seg.operator || 'AND'})`);
  }
  if (seg.version) console.log(`    version: ${seg.version}`);
  console.log('');

  if (impactedFlags.length > 0) {
    console.log(`  🚩 Flags using this segment (${impactedFlags.length}):`);
    for (const { flag, ruleIndex } of impactedFlags) {
      console.log(`    - ${flag} (rule ${ruleIndex + 1})`);
    }
  } else {
    console.log('  ✅ No flags reference this segment directly.');
  }

  if (dependentSegments.length > 0) {
    console.log(`\n  🔗 Segments extending this segment (${dependentSegments.length}):`);
    for (const name of dependentSegments) {
      console.log(`    - ${name}`);
    }
  }

  const totalImpact = impactedFlags.length + dependentSegments.length;
  console.log(`\n  📊 Total impact: ${totalImpact} reference(s)`);
}

/** Detect circular references in segment inheritance. */
function detectCircularSegment(
  name: string,
  segments: Record<string, SegmentDefinition>,
  visited: string[] = [],
): string[] | null {
  if (visited.includes(name)) {
    return [...visited, name];
  }

  const seg = segments[name];
  if (!seg?.extends) return null;

  for (const parent of seg.extends) {
    const result = detectCircularSegment(parent, segments, [...visited, name]);
    if (result) return result;
  }

  return null;
}
