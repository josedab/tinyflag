import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReplayRecorder, parseReplayLog, generateReplayHtmlReport } from '../replay.js';
import type { ReplayLogEntry, ReplayDiff } from '../replay.js';

describe('createReplayRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-01-15T10:00:00.000Z') });
  });

  it('returns object with record, getEntries, toJsonl', () => {
    const recorder = createReplayRecorder();
    expect(typeof recorder.record).toBe('function');
    expect(typeof recorder.getEntries).toBe('function');
    expect(typeof recorder.toJsonl).toBe('function');
  });

  it('records evaluation entries with timestamp/flag/context/result', () => {
    const recorder = createReplayRecorder();
    recorder.record('my-flag', { userId: 'u1' }, true);

    const entries = recorder.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].timestamp).toBe('2026-01-15T10:00:00.000Z');
    expect(entries[0].flag).toBe('my-flag');
    expect(entries[0].context).toEqual({ userId: 'u1' });
    expect(entries[0].result).toBe(true);
  });

  it('records variant in entry when provided', () => {
    const recorder = createReplayRecorder();
    recorder.record('ab-flag', { userId: 'u1' }, true, 'treatment');

    const entries = recorder.getEntries();
    expect(entries[0].variant).toBe('treatment');
  });

  it('records null variant when provided', () => {
    const recorder = createReplayRecorder();
    recorder.record('flag', undefined, true, null);

    const entries = recorder.getEntries();
    expect(entries[0].variant).toBeNull();
  });

  it('does not include variant key when not provided', () => {
    const recorder = createReplayRecorder();
    recorder.record('flag', undefined, false);

    const entries = recorder.getEntries();
    expect('variant' in entries[0]).toBe(false);
  });

  it('calls custom sink with each entry', () => {
    const sink = vi.fn();
    const recorder = createReplayRecorder({ sink });
    recorder.record('f1', undefined, true);
    recorder.record('f2', { userId: 'u2' }, false);

    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[0][0].flag).toBe('f1');
    expect(sink.mock.calls[1][0].flag).toBe('f2');
  });

  it('attaches commit hash when provided', () => {
    const recorder = createReplayRecorder({ commit: 'abc123' });
    recorder.record('flag', undefined, true);

    const entries = recorder.getEntries();
    expect(entries[0].flagFileCommit).toBe('abc123');
  });

  it('does not include flagFileCommit when no commit option', () => {
    const recorder = createReplayRecorder();
    recorder.record('flag', undefined, true);

    const entries = recorder.getEntries();
    expect('flagFileCommit' in entries[0]).toBe(false);
  });

  it('records with undefined context', () => {
    const recorder = createReplayRecorder();
    recorder.record('flag', undefined, false);

    const entries = recorder.getEntries();
    expect(entries[0].context).toBeUndefined();
  });

  describe('toJsonl()', () => {
    it('produces JSONL format', () => {
      const recorder = createReplayRecorder();
      recorder.record('f1', undefined, true);
      recorder.record('f2', { userId: 'x' }, false);

      const jsonl = recorder.toJsonl();
      const lines = jsonl.split('\n').filter((l) => l.trim() !== '');
      expect(lines).toHaveLength(2);

      const parsed1 = JSON.parse(lines[0]);
      expect(parsed1.flag).toBe('f1');

      const parsed2 = JSON.parse(lines[1]);
      expect(parsed2.flag).toBe('f2');
    });

    it('produces empty JSONL for no entries', () => {
      const recorder = createReplayRecorder();
      expect(recorder.toJsonl()).toBe('\n');
    });
  });
});

describe('parseReplayLog', () => {
  it('parses JSONL into entries', () => {
    const jsonl = [
      JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', flag: 'f1', result: true }),
      JSON.stringify({ timestamp: '2026-01-01T00:01:00Z', flag: 'f2', result: false }),
    ].join('\n');

    const entries = parseReplayLog(jsonl);
    expect(entries).toHaveLength(2);
    expect(entries[0].flag).toBe('f1');
    expect(entries[1].flag).toBe('f2');
  });

  it('handles empty input', () => {
    expect(parseReplayLog('')).toEqual([]);
  });

  it('skips empty lines', () => {
    const jsonl = JSON.stringify({ timestamp: 't', flag: 'f', result: true }) + '\n\n\n';
    expect(parseReplayLog(jsonl)).toHaveLength(1);
  });

  it('handles trailing newline', () => {
    const jsonl = JSON.stringify({ timestamp: 't', flag: 'f', result: true }) + '\n';
    expect(parseReplayLog(jsonl)).toHaveLength(1);
  });
});

describe('generateReplayHtmlReport', () => {
  it('generates HTML with changed evaluations', () => {
    const diffs: ReplayDiff[] = [
      {
        flag: 'my-flag',
        context: { userId: 'u1' },
        originalResult: true,
        replayResult: false,
        changed: true,
      },
    ];
    const html = generateReplayHtmlReport(diffs, '2026-01-15T10:00:00Z');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('my-flag');
    expect(html).toContain('Changed Evaluations');
    expect(html).toContain('2026-01-15T10:00:00Z');
    expect(html).toContain('1'); // total evaluations
  });

  it('generates HTML with no changes message', () => {
    const diffs: ReplayDiff[] = [
      {
        flag: 'stable-flag',
        context: undefined,
        originalResult: true,
        replayResult: true,
        changed: false,
      },
    ];
    const html = generateReplayHtmlReport(diffs);
    expect(html).toContain('No evaluation changes detected');
    expect(html).not.toContain('Changed Evaluations');
  });

  it('generates HTML without timestamp when not provided', () => {
    const html = generateReplayHtmlReport([]);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Total evaluations');
  });

  it('shows context as "none" when undefined', () => {
    const diffs: ReplayDiff[] = [
      {
        flag: 'f',
        context: undefined,
        originalResult: true,
        replayResult: false,
        changed: true,
      },
    ];
    const html = generateReplayHtmlReport(diffs);
    expect(html).toContain('none');
  });

  it('shows context as JSON when provided', () => {
    const diffs: ReplayDiff[] = [
      {
        flag: 'f',
        context: { plan: 'pro' },
        originalResult: true,
        replayResult: false,
        changed: true,
      },
    ];
    const html = generateReplayHtmlReport(diffs);
    expect(html).toContain(JSON.stringify({ plan: 'pro' }));
  });
});
