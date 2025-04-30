import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// The action.yml uses inline Node.js to parse diff JSON output.
// These tests exercise that same parsing logic to catch regressions.

/**
 * Simulates the inline Node.js diff parsing from action.yml:
 *   const d = JSON.parse(input);
 *   if (Array.isArray(d)) return d.map(c => c.flag || c.name).filter(Boolean).join(',');
 */
function extractChangedFlags(diffJson: string): string {
  try {
    const d = JSON.parse(diffJson);
    if (Array.isArray(d)) {
      return d
        .map((c: Record<string, unknown>) => c.flag || c.name)
        .filter(Boolean)
        .join(',');
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Simulates PR comment body generation from the action.
 */
function generateCommentBody(diffOutput: string): string {
  if (!diffOutput || diffOutput === 'No flag changes.') {
    return '';
  }

  return `## 🚩 Flag changes detected

\`\`\`
${diffOutput}
\`\`\`

*Posted by [TinyFlag Validate Action](https://github.com/josedab/tinyflag)*`;
}

describe('GitHub Action', () => {
  describe('action.yml structure', () => {
    it('contains required inputs', () => {
      const actionYml = readFileSync(
        join(__dirname, '..', 'action.yml'),
        'utf-8',
      );
      expect(actionYml).toContain('flags-file');
      expect(actionYml).toContain('flag-owners-file');
      expect(actionYml).toContain('check-approvals');
      expect(actionYml).toContain('github-token');
    });

    it('uses composite action type', () => {
      const actionYml = readFileSync(
        join(__dirname, '..', 'action.yml'),
        'utf-8',
      );
      expect(actionYml).toContain("using: 'composite'");
    });

    it('includes validation step', () => {
      const actionYml = readFileSync(
        join(__dirname, '..', 'action.yml'),
        'utf-8',
      );
      expect(actionYml).toContain('tinyflag validate');
    });

    it('includes diff step for PR comments', () => {
      const actionYml = readFileSync(
        join(__dirname, '..', 'action.yml'),
        'utf-8',
      );
      expect(actionYml).toContain('tinyflag diff');
    });

    it('sets up Node.js v20', () => {
      const actionYml = readFileSync(
        join(__dirname, '..', 'action.yml'),
        'utf-8',
      );
      expect(actionYml).toContain("node-version: '20'");
    });
  });

  describe('diff JSON parsing', () => {
    it('extracts flag names from diff with flag field', () => {
      const input = JSON.stringify([
        { flag: 'new-checkout', type: 'added' },
        { flag: 'dark-mode', type: 'modified' },
      ]);
      expect(extractChangedFlags(input)).toBe('new-checkout,dark-mode');
    });

    it('extracts flag names from diff with name field', () => {
      const input = JSON.stringify([
        { name: 'feature-a', change: 'enabled' },
        { name: 'feature-b', change: 'disabled' },
      ]);
      expect(extractChangedFlags(input)).toBe('feature-a,feature-b');
    });

    it('prefers flag field over name field', () => {
      const input = JSON.stringify([
        { flag: 'preferred', name: 'fallback' },
      ]);
      expect(extractChangedFlags(input)).toBe('preferred');
    });

    it('returns empty string for empty array', () => {
      expect(extractChangedFlags('[]')).toBe('');
    });

    it('returns empty string for non-array JSON', () => {
      expect(extractChangedFlags('{"flags": []}')).toBe('');
    });

    it('returns empty string for invalid JSON', () => {
      expect(extractChangedFlags('not json')).toBe('');
    });

    it('filters out entries without flag or name', () => {
      const input = JSON.stringify([
        { flag: 'valid-flag' },
        { type: 'unknown' },
        { flag: 'another-flag' },
      ]);
      expect(extractChangedFlags(input)).toBe('valid-flag,another-flag');
    });

    it('handles single flag change', () => {
      const input = JSON.stringify([{ flag: 'only-one' }]);
      expect(extractChangedFlags(input)).toBe('only-one');
    });

    it('handles empty string input', () => {
      expect(extractChangedFlags('')).toBe('');
    });
  });

  describe('PR comment generation', () => {
    it('generates formatted comment with diff output', () => {
      const diff = '+ new-checkout: enabled\n- old-feature: removed';
      const comment = generateCommentBody(diff);
      expect(comment).toContain('## 🚩 Flag changes detected');
      expect(comment).toContain('```');
      expect(comment).toContain(diff);
      expect(comment).toContain('TinyFlag Validate Action');
    });

    it('returns empty string for no changes', () => {
      expect(generateCommentBody('')).toBe('');
      expect(generateCommentBody('No flag changes.')).toBe('');
    });

    it('wraps diff output in code block', () => {
      const diff = 'modified: dark-mode (enabled: false → true)';
      const comment = generateCommentBody(diff);
      const codeBlockCount = (comment.match(/```/g) || []).length;
      expect(codeBlockCount).toBe(2); // opening and closing
    });

    it('includes attribution link', () => {
      const comment = generateCommentBody('some change');
      expect(comment).toContain('https://github.com/josedab/tinyflag');
    });
  });

  describe('schema validation step', () => {
    it('action uses npx tinyflag validate command', () => {
      const actionYml = readFileSync(
        join(__dirname, '..', 'action.yml'),
        'utf-8',
      );
      // Verify the validate command uses the flags-file input
      expect(actionYml).toContain('npx tinyflag validate');
      expect(actionYml).toMatch(/tinyflag validate.*flags-file/);
    });

    it('action handles ownership check conditionally', () => {
      const actionYml = readFileSync(
        join(__dirname, '..', 'action.yml'),
        'utf-8',
      );
      // Ownership check is conditional on PR events and check-approvals input
      expect(actionYml).toContain('check-approvals');
      expect(actionYml).toContain('pull_request');
    });
  });
});
