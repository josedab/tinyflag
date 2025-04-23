import { detectCircularDependencies, buildDependencyTree } from 'tinyflag';
import { loadAndValidateMulti } from './utils.js';

export function handleDeps(args: string[], jsonMode: boolean): void {
  const filePaths = args.filter((a) => !a.startsWith('-'));
  if (filePaths.length === 0) {
    console.error('Error: Missing flags file path\n');
    console.log('Usage: tinyflag deps <file...>');
    process.exit(1);
  }

  const config = loadAndValidateMulti(filePaths, false);

  // Detect circular dependencies
  const cycles = detectCircularDependencies(config.flags);
  if (cycles.length > 0) {
    console.error('⚠️  Circular dependencies detected:');
    for (const cycle of cycles) {
      console.error(`  ${cycle.join(' → ')}`);
    }
  }

  // Find flags with dependencies
  const flagsWithDeps = Object.entries(config.flags).filter(
    ([, f]) => f.requires && f.requires.length > 0,
  );

  if (flagsWithDeps.length === 0) {
    if (jsonMode) {
      console.log(JSON.stringify({ command: 'deps', dependencies: [], cycles }, null, 2));
    } else {
      console.log('No flag dependencies found.');
    }
    return;
  }

  if (jsonMode) {
    const deps = flagsWithDeps.map(([name, f]) => ({
      flag: name,
      requires: f.requires,
    }));
    console.log(JSON.stringify({ command: 'deps', dependencies: deps, cycles }, null, 2));
    return;
  }

  console.log('🔗 Flag dependency graph:\n');
  for (const [name] of flagsWithDeps) {
    console.log(buildDependencyTree(name, config.flags));
    console.log();
  }
}
