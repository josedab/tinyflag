import { describe, it, expect } from 'vitest';
import { murmurhash3, rolloutBucket, selectVariant } from '../hash.js';

describe('murmurhash3', () => {
  it('returns a 32-bit unsigned integer', () => {
    const hash = murmurhash3('test');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });

  it('is deterministic — same input always returns the same output', () => {
    const a = murmurhash3('hello-world', 42);
    const b = murmurhash3('hello-world', 42);
    expect(a).toBe(b);
  });

  it('different inputs produce different outputs', () => {
    const a = murmurhash3('flag-a:user-1');
    const b = murmurhash3('flag-b:user-1');
    expect(a).not.toBe(b);
  });

  it('different seeds produce different outputs', () => {
    const a = murmurhash3('test', 0);
    const b = murmurhash3('test', 1);
    expect(a).not.toBe(b);
  });

  it('handles empty string', () => {
    const hash = murmurhash3('');
    expect(hash).toBeGreaterThanOrEqual(0);
  });

  it('handles strings of various lengths (1-8)', () => {
    for (let len = 1; len <= 8; len++) {
      const hash = murmurhash3('x'.repeat(len));
      expect(hash).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('rolloutBucket', () => {
  it('returns a number between 0 and 99', () => {
    for (let i = 0; i < 100; i++) {
      const bucket = rolloutBucket('flag', `user-${i}`);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it('is deterministic', () => {
    const a = rolloutBucket('my-flag', 'user-42');
    const b = rolloutBucket('my-flag', 'user-42');
    expect(a).toBe(b);
  });

  it('50% rollout gives approximately 50% of users', () => {
    let enabled = 0;
    const total = 10000;
    for (let i = 0; i < total; i++) {
      if (rolloutBucket('flag', `user-${i}`) < 50) enabled++;
    }
    const pct = enabled / total;
    expect(pct).toBeGreaterThan(0.45);
    expect(pct).toBeLessThan(0.55);
  });
});

describe('selectVariant', () => {
  it('is deterministic', () => {
    const variants = [
      { name: 'control', weight: 50 },
      { name: 'test', weight: 50 },
    ];
    const a = selectVariant('flag', 'user-1', variants);
    const b = selectVariant('flag', 'user-1', variants);
    expect(a).toBe(b);
  });

  it('distributes roughly evenly with equal weights', () => {
    const variants = [
      { name: 'control', weight: 50 },
      { name: 'test', weight: 50 },
    ];
    const counts: Record<string, number> = { control: 0, test: 0 };
    for (let i = 0; i < 10000; i++) {
      counts[selectVariant('experiment', `user-${i}`, variants)]++;
    }
    expect(counts.control / 10000).toBeGreaterThan(0.45);
    expect(counts.control / 10000).toBeLessThan(0.55);
  });

  it('respects unequal weights (1:99)', () => {
    const variants = [
      { name: 'a', weight: 1 },
      { name: 'b', weight: 99 },
    ];
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 10000; i++) {
      counts[selectVariant('flag', `user-${i}`, variants)]++;
    }
    expect(counts.a / 10000).toBeLessThan(0.03);
  });

  it('returns the only variant when single entry', () => {
    expect(selectVariant('flag', 'user-1', [{ name: 'only', weight: 1 }])).toBe('only');
  });

  it('all users get first variant when weights are [100, 0] (GAP 6)', () => {
    const variants = [
      { name: 'winner', weight: 100 },
      { name: 'loser', weight: 0 },
    ];
    for (let i = 0; i < 100; i++) {
      expect(selectVariant('flag', `user-${i}`, variants)).toBe('winner');
    }
  });
});
