import { describe, it, expect, vi, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock tinyflag's internal functions used by consistency.ts
vi.mock('tinyflag', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tinyflag')>();
  return {
    ...actual,
    setEvaluationContext: vi.fn(),
    evaluateFlag: vi.fn().mockReturnValue(true),
  };
});

import { generateVectors, checkConsistency, formatConsistencyReport } from '../consistency.js';
import type { ConsistencyResult } from '../consistency.js';

const cleanup: string[] = [];

afterAll(() => {
  for (const f of cleanup) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {}
  }
});

const VALID_YAML = `version: 1
flags:
  dark-mode:
    enabled: true
    description: Dark mode
  checkout-v2:
    enabled: true
    rollout: 50
  beta:
    enabled: false
`;

function makeConfig() {
  const { parseYaml, parseFlagConfig } = require('tinyflag');
  const raw = parseYaml(VALID_YAML);
  const { config } = parseFlagConfig(raw);
  return config;
}

describe('generateVectors', () => {
  it('produces the correct number of test vectors', () => {
    const config = makeConfig();
    const vectors = generateVectors(config, 10);
    expect(vectors).toHaveLength(10);
  });

  it('cycles through flag names', () => {
    const config = makeConfig();
    const vectors = generateVectors(config, 9);
    const flagNames = vectors.map((v) => v.flagName);
    const counts = flagNames.reduce(
      (acc, n) => {
        acc[n] = (acc[n] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    expect(Object.values(counts)).toEqual([3, 3, 3]);
  });

  it('randomContext produces deterministic context for same seed', () => {
    const config = makeConfig();
    const vectors1 = generateVectors(config, 5);
    const vectors2 = generateVectors(config, 5);

    for (let i = 0; i < 5; i++) {
      expect(vectors1[i].context).toEqual(vectors2[i].context);
      expect(vectors1[i].jsResult).toBe(vectors2[i].jsResult);
    }
  });

  it('each vector has a valid jsResult boolean', () => {
    const config = makeConfig();
    const vectors = generateVectors(config, 5);
    for (const v of vectors) {
      expect(typeof v.jsResult).toBe('boolean');
    }
  });
});

describe('checkConsistency', () => {
  it('throws on missing flags file', () => {
    expect(() => checkConsistency('/nonexistent-flags.yml', 10)).toThrow('Cannot read flags file');
  });

  it('throws on invalid flags file content', () => {
    const badPath = join(tmpdir(), `consistency-bad-${Date.now()}.yml`);
    cleanup.push(badPath);
    // Write content that parses as YAML but fails parseFlagConfig validation
    writeFileSync(badPath, 'just-a-scalar');

    expect(() => checkConsistency(badPath, 10)).toThrow();
  });

  it('returns correct sdksChecked (at least js)', () => {
    const flagsPath = join(tmpdir(), `consistency-check-${Date.now()}.yml`);
    cleanup.push(flagsPath);
    writeFileSync(flagsPath, VALID_YAML);

    const result = checkConsistency(flagsPath, 5);
    expect(result.sdksChecked).toContain('js');
    expect(result.totalVectors).toBe(5);
  });

  it('handles JSON flags file', () => {
    const jsonPath = join(tmpdir(), `consistency-${Date.now()}.json`);
    cleanup.push(jsonPath);
    const jsonConfig = {
      version: 1,
      flags: {
        'test-flag': { enabled: true, description: 'test' },
      },
    };
    writeFileSync(jsonPath, JSON.stringify(jsonConfig));

    const result = checkConsistency(jsonPath, 3);
    expect(result.sdksChecked).toContain('js');
    expect(result.totalVectors).toBe(3);
  });
});

describe('formatConsistencyReport', () => {
  it('shows clean report when no divergences', () => {
    const result: ConsistencyResult = {
      totalVectors: 10,
      sdksChecked: ['js'],
      divergences: [],
    };
    const output = formatConsistencyReport(result);
    expect(output).toContain('No divergences found');
    expect(output).toContain('Vectors evaluated: 10');
    expect(output).toContain('js');
  });

  it('shows divergence details', () => {
    const result: ConsistencyResult = {
      totalVectors: 10,
      sdksChecked: ['js', 'python'],
      divergences: [
        {
          vector: 3,
          flagName: 'dark-mode',
          context: { userId: 'user-3' },
          results: { js: true, python: false },
        },
      ],
    };
    const output = formatConsistencyReport(result);
    expect(output).toContain('1 divergence');
    expect(output).toContain('dark-mode');
    expect(output).toContain('Vector #3');
    expect(output).toContain('js: true');
    expect(output).toContain('python: false');
  });
});
