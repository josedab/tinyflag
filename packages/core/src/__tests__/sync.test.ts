import { describe, it, expect } from 'vitest';
import { threeWayMerge } from '../sync.js';

describe('sync', () => {
  describe('threeWayMerge', () => {
    it('merges when only local changed', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nchanged\nline3';
      const remote = 'line1\nline2\nline3';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('line1\nchanged\nline3');
    });

    it('merges when only remote changed', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nline2\nline3';
      const remote = 'line1\nremote-change\nline3';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('line1\nremote-change\nline3');
    });

    it('merges when both changed the same way', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nsame\nline3';
      const remote = 'line1\nsame\nline3';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('line1\nsame\nline3');
    });

    it('detects conflicts when both changed differently', () => {
      const base = 'line1\nline2\nline3';
      const local = 'line1\nlocal-val\nline3';
      const remote = 'line1\nremote-val\nline3';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(merged).toBeNull();
    });

    it('handles different-length files', () => {
      const base = 'a\nb';
      const local = 'a\nb\nc';
      const remote = 'a\nb';
      const { merged, conflicts } = threeWayMerge(base, local, remote);
      expect(conflicts).toHaveLength(0);
      expect(merged).toBe('a\nb\nc');
    });
  });
});
