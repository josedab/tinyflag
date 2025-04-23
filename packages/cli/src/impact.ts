import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import type { FlagConfig, FlagDefinition } from 'tinyflag';

/** Patterns that indicate flag usage in code. */
const FLAG_USAGE_PATTERN =
  /(?:isEnabled|getVariant|evaluateFlag|useFlag|useFeatureFlag)\s*\(\s*['"]([a-z0-9-]+)['"]/g;

/** Annotation pattern: // tinyflag-uses: flag-name */
const ANNOTATION_PATTERN =
  /\/\/\s*tinyflag-uses:\s*([a-z0-9][a-z0-9-]*(?:\s*,\s*[a-z0-9][a-z0-9-]*)*)/g;

const SCANNABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.py',
  '.go',
  '.rs',
  '.kt',
  '.java',
]);

/** A location where a flag is referenced in code. */
export interface FlagReference {
  flag: string;
  file: string;
  line: number;
  column: number;
  type: 'call' | 'annotation';
  context?: string;
}

/** A file affected by a flag. */
export interface AffectedFile {
  file: string;
  references: FlagReference[];
  isRoute: boolean;
  isComponent: boolean;
  isTest: boolean;
}

/** Risk level for blast radius. */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Impact analysis result. */
export interface ImpactAnalysis {
  flag: string;
  flagDefinition?: FlagDefinition;
  references: FlagReference[];
  affectedFiles: AffectedFile[];
  blastRadius: BlastRadius;
  riskMatrix: RiskMatrix;
  recommendedStrategy: string;
}

/** Blast radius metrics. */
export interface BlastRadius {
  totalFiles: number;
  totalReferences: number;
  routes: number;
  components: number;
  tests: number;
  rolloutPercentage: number;
}

/** Risk matrix entry. */
export interface RiskMatrix {
  level: RiskLevel;
  score: number;
  factors: string[];
}

/**
 * Scan a directory for all references to a specific flag.
 */
export function scanFlagReferences(
  dir: string,
  flagName: string,
  excludeDirs: Set<string> = new Set([
    'node_modules',
    'dist',
    '.git',
    'coverage',
    '.next',
    'build',
  ]),
): FlagReference[] {
  const references: FlagReference[] = [];

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (excludeDirs.has(entry)) continue;
      const fullPath = join(currentDir, entry);

      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && SCANNABLE_EXTENSIONS.has(extname(entry))) {
        scanFileForFlag(fullPath, flagName, references);
      }
    }
  }

  walk(dir);
  return references;
}

function scanFileForFlag(filePath: string, flagName: string, references: FlagReference[]): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check function call patterns
    const callPattern = new RegExp(FLAG_USAGE_PATTERN.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = callPattern.exec(line)) !== null) {
      if (match[1] === flagName) {
        references.push({
          flag: flagName,
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          type: 'call',
          context: line.trim(),
        });
      }
    }

    // Check annotations
    const annoPattern = new RegExp(ANNOTATION_PATTERN.source, 'g');
    while ((match = annoPattern.exec(line)) !== null) {
      const annotatedFlags = match[1].split(',').map((f) => f.trim());
      if (annotatedFlags.includes(flagName)) {
        references.push({
          flag: flagName,
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          type: 'annotation',
          context: line.trim(),
        });
      }
    }
  }
}

/**
 * Classify affected files by type (route, component, test).
 */
export function classifyAffectedFiles(
  references: FlagReference[],
  baseDir: string,
): AffectedFile[] {
  const byFile = new Map<string, FlagReference[]>();
  for (const ref of references) {
    const relPath = relative(baseDir, ref.file);
    if (!byFile.has(relPath)) byFile.set(relPath, []);
    byFile.get(relPath)!.push(ref);
  }

  const files: AffectedFile[] = [];
  for (const [file, refs] of byFile) {
    files.push({
      file,
      references: refs,
      isRoute: isRouteLike(file),
      isComponent: isComponentLike(file),
      isTest: isTestFile(file),
    });
  }

  return files.sort((a, b) => a.file.localeCompare(b.file));
}

function isRouteLike(file: string): boolean {
  return (
    /(?:route|page|api|handler|controller|endpoint)/i.test(file) ||
    /(?:pages|routes|api)\//i.test(file)
  );
}

function isComponentLike(file: string): boolean {
  return /(?:component|widget|view)/i.test(file) || /\.(tsx|vue|svelte)$/.test(file);
}

function isTestFile(file: string): boolean {
  return /(?:\.test\.|\.spec\.|__tests__)/i.test(file);
}

/**
 * Calculate blast radius from references and flag definition.
 */
export function calculateBlastRadius(
  affectedFiles: AffectedFile[],
  flag?: FlagDefinition,
): BlastRadius {
  return {
    totalFiles: affectedFiles.filter((f) => !f.isTest).length,
    totalReferences: affectedFiles.reduce((sum, f) => sum + f.references.length, 0),
    routes: affectedFiles.filter((f) => f.isRoute && !f.isTest).length,
    components: affectedFiles.filter((f) => f.isComponent && !f.isTest).length,
    tests: affectedFiles.filter((f) => f.isTest).length,
    rolloutPercentage: typeof flag?.rollout === 'number' ? flag.rollout : flag?.enabled ? 100 : 0,
  };
}

/**
 * Calculate risk matrix based on blast radius.
 */
export function calculateRiskMatrix(blastRadius: BlastRadius): RiskMatrix {
  let score = 0;
  const factors: string[] = [];

  // File count factor
  if (blastRadius.totalFiles > 20) {
    score += 3;
    factors.push(`High file count (${blastRadius.totalFiles} files)`);
  } else if (blastRadius.totalFiles > 5) {
    score += 2;
    factors.push(`Moderate file count (${blastRadius.totalFiles} files)`);
  } else if (blastRadius.totalFiles > 0) {
    score += 1;
    factors.push(`Low file count (${blastRadius.totalFiles} files)`);
  }

  // Route factor
  if (blastRadius.routes > 3) {
    score += 3;
    factors.push(`Multiple routes affected (${blastRadius.routes})`);
  } else if (blastRadius.routes > 0) {
    score += 1;
    factors.push(`${blastRadius.routes} route(s) affected`);
  }

  // Rollout factor
  if (blastRadius.rolloutPercentage >= 100) {
    score += 2;
    factors.push('Full rollout (100%)');
  } else if (blastRadius.rolloutPercentage >= 50) {
    score += 1;
    factors.push(`${blastRadius.rolloutPercentage}% rollout`);
  }

  // Test coverage factor
  if (blastRadius.tests === 0 && blastRadius.totalFiles > 0) {
    score += 2;
    factors.push('No test coverage for this flag');
  } else if (blastRadius.tests > 0) {
    factors.push(`${blastRadius.tests} test file(s)`);
  }

  let level: RiskLevel;
  if (score >= 8) level = 'critical';
  else if (score >= 5) level = 'high';
  else if (score >= 3) level = 'medium';
  else level = 'low';

  return { level, score, factors };
}

/**
 * Generate a recommended rollout strategy based on risk.
 */
export function recommendStrategy(risk: RiskMatrix, blastRadius: BlastRadius): string {
  switch (risk.level) {
    case 'critical':
      return 'Phased rollout recommended: start at 1%, then 5%, 25%, 50%, 100% with monitoring at each stage.';
    case 'high':
      return 'Gradual rollout recommended: start at 10%, then 50%, 100% with error rate monitoring.';
    case 'medium':
      return 'Standard rollout: start at 25%, then 100% after verification.';
    case 'low':
      return blastRadius.tests > 0
        ? 'Safe to roll out directly — low blast radius with test coverage.'
        : 'Low risk but consider adding tests before full rollout.';
  }
}

/**
 * Run full impact analysis for a flag.
 */
export function analyzeImpact(dir: string, flagName: string, config?: FlagConfig): ImpactAnalysis {
  const references = scanFlagReferences(dir, flagName);
  const affectedFiles = classifyAffectedFiles(references, dir);
  const flagDef = config?.flags[flagName];
  const blastRadius = calculateBlastRadius(affectedFiles, flagDef);
  const riskMatrix = calculateRiskMatrix(blastRadius);

  return {
    flag: flagName,
    flagDefinition: flagDef,
    references,
    affectedFiles,
    blastRadius,
    riskMatrix,
    recommendedStrategy: recommendStrategy(riskMatrix, blastRadius),
  };
}

/**
 * Format impact analysis as human-readable output.
 */
export function formatImpactReport(analysis: ImpactAnalysis, baseDir?: string): string {
  const lines: string[] = [];
  const risk = analysis.riskMatrix;

  const riskIcon = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' }[risk.level];

  lines.push(`Flag Impact Analysis: ${analysis.flag}`);
  lines.push('═'.repeat(50));
  lines.push('');
  lines.push(`${riskIcon} Risk Level: ${risk.level.toUpperCase()} (score: ${risk.score})`);
  lines.push('');

  // Blast radius
  lines.push('📊 Blast Radius:');
  lines.push(`   Files affected: ${analysis.blastRadius.totalFiles}`);
  lines.push(`   Total references: ${analysis.blastRadius.totalReferences}`);
  lines.push(`   Routes: ${analysis.blastRadius.routes}`);
  lines.push(`   Components: ${analysis.blastRadius.components}`);
  lines.push(`   Tests: ${analysis.blastRadius.tests}`);
  lines.push(`   Rollout: ${analysis.blastRadius.rolloutPercentage}%`);
  lines.push('');

  // Risk factors
  lines.push('⚠️  Risk Factors:');
  for (const factor of risk.factors) {
    lines.push(`   • ${factor}`);
  }
  lines.push('');

  // Affected files
  if (analysis.affectedFiles.length > 0) {
    lines.push('📁 Affected Files:');
    for (const f of analysis.affectedFiles) {
      const tags: string[] = [];
      if (f.isRoute) tags.push('route');
      if (f.isComponent) tags.push('component');
      if (f.isTest) tags.push('test');
      const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
      lines.push(
        `   ${f.file}${tagStr} (${f.references.length} ref${f.references.length !== 1 ? 's' : ''})`,
      );
    }
    lines.push('');
  }

  // Strategy
  lines.push(`💡 Recommended Strategy: ${analysis.recommendedStrategy}`);

  return lines.join('\n');
}
