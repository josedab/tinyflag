import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  scanFlagReferences,
  classifyAffectedFiles,
  calculateBlastRadius,
  calculateRiskMatrix,
  recommendStrategy,
  analyzeImpact,
  formatImpactReport,
} from '../impact.js';

describe('flag impact analysis', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tinyflag-impact-'));
    mkdirSync(join(tmpDir, 'src', 'components'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'pages'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', '__tests__'), { recursive: true });

    writeFileSync(join(tmpDir, 'src', 'components', 'Header.tsx'), `
import { useFlag } from 'tinyflag-react';
const Header = () => {
  const darkMode = isEnabled('dark-mode');
  return <header className={darkMode ? 'dark' : 'light'} />;
};
`);

    writeFileSync(join(tmpDir, 'src', 'pages', 'index.tsx'), `
// tinyflag-uses: dark-mode
const Home = () => {
  if (isEnabled('dark-mode')) {
    return <div className="dark" />;
  }
  return <div />;
};
`);

    writeFileSync(join(tmpDir, 'src', '__tests__', 'dark-mode.test.ts'), `
it('enables dark mode', () => {
  expect(isEnabled('dark-mode')).toBe(true);
});
`);

    writeFileSync(join(tmpDir, 'src', 'utils.ts'), `
// No flag references here
export const formatDate = (d: Date) => d.toISOString();
`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('scanFlagReferences', () => {
    it('finds call-site references', () => {
      const refs = scanFlagReferences(tmpDir, 'dark-mode');
      const callRefs = refs.filter((r) => r.type === 'call');
      expect(callRefs.length).toBeGreaterThanOrEqual(2);
    });

    it('finds annotation references', () => {
      const refs = scanFlagReferences(tmpDir, 'dark-mode');
      const annoRefs = refs.filter((r) => r.type === 'annotation');
      expect(annoRefs.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for non-existent flag', () => {
      const refs = scanFlagReferences(tmpDir, 'nonexistent');
      expect(refs).toHaveLength(0);
    });
  });

  describe('classifyAffectedFiles', () => {
    it('classifies routes, components, and tests', () => {
      const refs = scanFlagReferences(tmpDir, 'dark-mode');
      const files = classifyAffectedFiles(refs, tmpDir);

      const route = files.find((f) => f.isRoute);
      expect(route).toBeTruthy();

      const component = files.find((f) => f.isComponent);
      expect(component).toBeTruthy();

      const test = files.find((f) => f.isTest);
      expect(test).toBeTruthy();
    });
  });

  describe('calculateBlastRadius', () => {
    it('calculates metrics correctly', () => {
      const refs = scanFlagReferences(tmpDir, 'dark-mode');
      const files = classifyAffectedFiles(refs, tmpDir);
      const radius = calculateBlastRadius(files);
      expect(radius.totalFiles).toBeGreaterThanOrEqual(2);
      expect(radius.tests).toBeGreaterThanOrEqual(1);
      expect(radius.totalReferences).toBeGreaterThanOrEqual(3);
    });
  });

  describe('calculateRiskMatrix', () => {
    it('assigns low risk for small blast radius', () => {
      const risk = calculateRiskMatrix({
        totalFiles: 1,
        totalReferences: 1,
        routes: 0,
        components: 1,
        tests: 1,
        rolloutPercentage: 10,
      });
      expect(risk.level).toBe('low');
    });

    it('assigns higher risk for large blast radius', () => {
      const risk = calculateRiskMatrix({
        totalFiles: 25,
        totalReferences: 50,
        routes: 5,
        components: 10,
        tests: 0,
        rolloutPercentage: 100,
      });
      expect(['high', 'critical']).toContain(risk.level);
    });
  });

  describe('recommendStrategy', () => {
    it('recommends phased rollout for critical risk', () => {
      const strategy = recommendStrategy(
        { level: 'critical', score: 10, factors: [] },
        { totalFiles: 30, totalReferences: 50, routes: 5, components: 10, tests: 0, rolloutPercentage: 100 },
      );
      expect(strategy).toContain('1%');
    });

    it('recommends direct rollout for low risk', () => {
      const strategy = recommendStrategy(
        { level: 'low', score: 1, factors: [] },
        { totalFiles: 1, totalReferences: 1, routes: 0, components: 0, tests: 1, rolloutPercentage: 10 },
      );
      expect(strategy).toContain('Safe');
    });
  });

  describe('analyzeImpact', () => {
    it('runs full analysis', () => {
      const analysis = analyzeImpact(tmpDir, 'dark-mode');
      expect(analysis.flag).toBe('dark-mode');
      expect(analysis.references.length).toBeGreaterThan(0);
      expect(analysis.riskMatrix.level).toBeTruthy();
      expect(analysis.recommendedStrategy).toBeTruthy();
    });
  });

  describe('formatImpactReport', () => {
    it('formats a readable report', () => {
      const analysis = analyzeImpact(tmpDir, 'dark-mode');
      const report = formatImpactReport(analysis);
      expect(report).toContain('dark-mode');
      expect(report).toContain('Risk Level');
      expect(report).toContain('Blast Radius');
      expect(report).toContain('Recommended Strategy');
    });
  });
});
