import { describe, it, expect } from 'vitest';
import { diffConfigs, formatChanges, formatChangesMarkdown } from '../diff.js';

describe('diffConfigs', () => {
  it('detects added flags', () => {
    const before = { flags: {} };
    const after = { flags: { 'new-flag': { enabled: true } } };
    const changes = diffConfigs(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('added');
    expect(changes[0].name).toBe('new-flag');
  });

  it('detects removed flags', () => {
    const before = { flags: { 'old-flag': { enabled: true } } };
    const after = { flags: {} };
    const changes = diffConfigs(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('removed');
    expect(changes[0].name).toBe('old-flag');
  });

  it('detects modified flags', () => {
    const before = { flags: { f: { enabled: true, rollout: 10 } } };
    const after = { flags: { f: { enabled: true, rollout: 50 } } };
    const changes = diffConfigs(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].type).toBe('modified');
    expect(changes[0].details).toContain('rollout: 10% → 50%');
  });

  it('detects enabled state change', () => {
    const before = { flags: { f: { enabled: false } } };
    const after = { flags: { f: { enabled: true } } };
    const changes = diffConfigs(before, after);
    expect(changes[0].details).toContain('enabled: false → true');
  });

  it('returns empty array when no changes', () => {
    const config = { flags: { f: { enabled: true, rollout: 50 } } };
    expect(diffConfigs(config, config)).toEqual([]);
  });

  it('handles multiple changes', () => {
    const before = { flags: { a: { enabled: true }, b: { enabled: false } } };
    const after = { flags: { b: { enabled: true }, c: { enabled: true } } };
    const changes = diffConfigs(before, after);
    expect(changes).toHaveLength(3);
    expect(changes.map((c) => c.type)).toContain('added');
    expect(changes.map((c) => c.type)).toContain('removed');
    expect(changes.map((c) => c.type)).toContain('modified');
  });
});

describe('formatChanges', () => {
  it('formats no changes', () => {
    expect(formatChanges([])).toBe('No flag changes.');
  });

  it('formats added/removed/modified', () => {
    const output = formatChanges([
      { name: 'new', type: 'added', details: ['enabled: true'] },
      { name: 'old', type: 'removed' },
      { name: 'mod', type: 'modified', details: ['rollout: 10% → 50%'] },
    ]);
    expect(output).toContain('+ new');
    expect(output).toContain('- old');
    expect(output).toContain('~ mod');
  });
});

describe('formatChangesMarkdown', () => {
  it('returns empty string for no changes', () => {
    expect(formatChangesMarkdown([])).toBe('');
  });

  it('formats single added flag', () => {
    const output = formatChangesMarkdown([
      { name: 'new-flag', type: 'added', details: ['enabled: true'] },
    ]);
    expect(output).toContain('`new-flag`');
    expect(output).toContain('added');
    expect(output).toContain('**+**');
  });

  it('formats single removed flag', () => {
    const output = formatChangesMarkdown([{ name: 'old-flag', type: 'removed' }]);
    expect(output).toContain('`old-flag`');
    expect(output).toContain('removed');
    expect(output).toContain('**-**');
  });

  it('formats modified flag with multiple field changes', () => {
    const output = formatChangesMarkdown([
      {
        name: 'mod-flag',
        type: 'modified',
        details: ['enabled: false → true', 'rollout: 10% → 50%'],
      },
    ]);
    expect(output).toContain('`mod-flag`');
    expect(output).toContain('**~**');
    expect(output).toContain('enabled: false → true');
    expect(output).toContain('rollout: 10% → 50%');
  });

  it('formats mixed changes correctly', () => {
    const output = formatChangesMarkdown([
      { name: 'a', type: 'added', details: ['enabled: true'] },
      { name: 'b', type: 'removed' },
      { name: 'c', type: 'modified', details: ['rollout changed'] },
    ]);
    expect(output).toContain('**+**');
    expect(output).toContain('**-**');
    expect(output).toContain('**~**');
    expect(output).toContain('Flag changes detected');
  });

  it('handles special characters in flag names', () => {
    const output = formatChangesMarkdown([
      { name: 'my-flag_v2.0', type: 'added', details: ['enabled: true'] },
    ]);
    expect(output).toContain('`my-flag_v2.0`');
  });
});
