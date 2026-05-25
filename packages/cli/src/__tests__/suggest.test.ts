import { describe, it, expect, afterAll } from 'vitest';
import { scanForFlagPatterns, formatSuggestionsAsYaml, formatSuggestionsReport } from '../suggest.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const testDir = join(tmpdir(), 'tinyflag-suggest-test-' + Date.now());

afterAll(() => {
  try { if (existsSync(testDir)) rmSync(testDir, { recursive: true }); } catch {}
});

function setupTestDir() {
  mkdirSync(testDir, { recursive: true });

  // File with env var patterns
  writeFileSync(join(testDir, 'config.ts'), `
    const isDarkMode = process.env.FEATURE_DARK_MODE === 'true';
    const enableNewCheckout = process.env.ENABLE_NEW_CHECKOUT;
    if (process.env.FF_BETA_FEATURES) { doSomething(); }
  `, 'utf-8');

  // File with config object patterns
  writeFileSync(join(testDir, 'app.tsx'), `
    if (config.featurePayments) { renderPayments(); }
    const show = settings.enableDashboard;
    const active = features.isNewLayout;
  `, 'utf-8');

  // File with feature check patterns
  writeFileSync(join(testDir, 'feature.ts'), `
    if (isEnabled('premium-support')) { show(); }
    if (isFeatureEnabled('analytics-v2')) { track(); }
    const flag = featureFlags['dark-theme'];
    const f2 = featureFlags.newOnboarding;
  `, 'utf-8');

  // File with hook patterns
  writeFileSync(join(testDir, 'hooks.ts'), `
    const darkMode = useFeature('dark-mode');
    const beta = useFlag('beta-access');
  `, 'utf-8');
}

describe('suggest', () => {
  it('detects env var patterns', () => {
    setupTestDir();
    const suggestions = scanForFlagPatterns(testDir);
    const envSuggestions = suggestions.filter(s => s.category === 'env');
    expect(envSuggestions.length).toBeGreaterThanOrEqual(3);
    expect(envSuggestions.some(s => s.flagName === 'dark-mode')).toBe(true);
    expect(envSuggestions.some(s => s.flagName === 'new-checkout')).toBe(true);
    expect(envSuggestions.some(s => s.flagName === 'beta-features')).toBe(true);
  });

  it('detects config object patterns', () => {
    const suggestions = scanForFlagPatterns(testDir);
    const configSuggestions = suggestions.filter(s => s.category === 'config');
    expect(configSuggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('detects feature check patterns', () => {
    const suggestions = scanForFlagPatterns(testDir);
    const checkSuggestions = suggestions.filter(s => s.category === 'feature-check');
    expect(checkSuggestions.length).toBeGreaterThanOrEqual(3);
  });

  it('generates valid YAML output', () => {
    const suggestions = scanForFlagPatterns(testDir);
    const yaml = formatSuggestionsAsYaml(suggestions);
    expect(yaml).toContain('version: 1');
    expect(yaml).toContain('flags:');
    expect(yaml).toContain('enabled: false');
  });

  it('generates readable report', () => {
    const suggestions = scanForFlagPatterns(testDir);
    const report = formatSuggestionsReport(suggestions);
    expect(report).toContain('potential feature flag');
    expect(report).toContain('🏴');
  });

  it('returns empty for no matches', () => {
    const emptyDir = join(testDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(join(emptyDir, 'plain.ts'), 'const x = 1;', 'utf-8');
    const suggestions = scanForFlagPatterns(emptyDir);
    expect(suggestions).toHaveLength(0);
  });

  it('deduplicates by flag name', () => {
    const dupDir = join(testDir, 'dedup');
    mkdirSync(dupDir, { recursive: true });
    writeFileSync(join(dupDir, 'a.ts'), 'process.env.FEATURE_SAME_FLAG;', 'utf-8');
    writeFileSync(join(dupDir, 'b.ts'), 'process.env.FEATURE_SAME_FLAG;', 'utf-8');
    const suggestions = scanForFlagPatterns(dupDir);
    const sameFlagCount = suggestions.filter(s => s.flagName === 'same-flag').length;
    expect(sameFlagCount).toBe(1);
  });
});
