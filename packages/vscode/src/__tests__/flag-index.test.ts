import { describe, expect, it } from 'vitest';
import { findFlagDiagnostics, indexFlags } from '../flag-index.js';

describe('flag index', () => {
  it('indexes flag metadata and source locations', () => {
    const flags = indexFlags(
      `version: 1
flags:
  enabled-flag:
    enabled: true
    description: Ready
    rollout: 25
  disabled-flag:
    enabled: false
`,
      '/workspace/flags.yml',
    );

    expect(flags.get('enabled-flag')).toEqual({
      name: 'enabled-flag',
      enabled: true,
      description: 'Ready',
      rollout: 25,
      rulesCount: 0,
      variants: [],
      tags: undefined,
      line: 2,
      filePath: '/workspace/flags.yml',
    });
    expect(flags.get('disabled-flag')).toEqual(
      expect.objectContaining({
        enabled: false,
        line: 6,
      }),
    );
  });

  it('returns an empty index for content without flags', () => {
    expect(indexFlags('version: 1', '/workspace/flags.yml').size).toBe(0);
  });

  it('finds undefined and disabled flag diagnostics', () => {
    const flags = indexFlags(
      `flags:
  disabled-flag:
    enabled: false
`,
      '/workspace/flags.yml',
    );
    const source = `
ff.isEnabled('disabled-flag');
ff.getVariant('missing-flag');
`;

    expect(findFlagDiagnostics(source, flags)).toEqual([
      expect.objectContaining({
        message: 'Flag "disabled-flag" is currently disabled',
        severity: 'information',
      }),
      expect.objectContaining({
        message: 'Flag "missing-flag" is not defined in flags file',
        severity: 'warning',
      }),
    ]);
  });
});
