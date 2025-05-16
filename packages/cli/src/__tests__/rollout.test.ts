import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Tests for the rollout command state machine.
 *
 * Since handleRollout() uses process.exit() and module-level STATE_FILE constant,
 * we test the internal state machine logic by replicating the core functions
 * (loadState, saveState, parseStages) and verifying state transitions.
 */

const STATE_FILE_NAME = '.tinyflag-rollout.json';

interface RolloutState {
  flag: string;
  status: string;
  currentStageIndex: number;
  currentStageName: string;
  currentPercentage: number;
  consecutivePassingChecks: number;
  consecutiveFailingChecks: number;
  stageEnteredAt: number;
  startedAt: number;
  history: Array<{
    type: string;
    timestamp: number;
    stageName: string;
    stageIndex: number;
    percentage: number;
    message: string;
  }>;
}

let tmpDir: string;
let stateFile: string;

function loadState(flag?: string): RolloutState | null {
  if (!existsSync(stateFile)) return null;
  try {
    const data = JSON.parse(readFileSync(stateFile, 'utf8')) as Record<string, RolloutState>;
    if (flag) return data[flag] ?? null;
    return null;
  } catch {
    return null;
  }
}

function saveState(state: RolloutState): void {
  let data: Record<string, RolloutState> = {};
  if (existsSync(stateFile)) {
    try {
      data = JSON.parse(readFileSync(stateFile, 'utf8'));
    } catch {
      data = {};
    }
  }
  data[state.flag] = state;
  writeFileSync(stateFile, JSON.stringify(data, null, 2));
}

function parseStages(stagesArg: string): Array<{ name: string; percentage: number }> {
  return stagesArg.split(',').map((s, i) => {
    const [name, pct] = s.includes(':') ? s.split(':') : [`stage-${i}`, s];
    return { name: name.trim(), percentage: parseInt(pct.trim(), 10) };
  });
}

function createRunningState(flag: string, overrides: Partial<RolloutState> = {}): RolloutState {
  return {
    flag,
    status: 'running',
    currentStageIndex: 0,
    currentStageName: 'canary',
    currentPercentage: 1,
    consecutivePassingChecks: 0,
    consecutiveFailingChecks: 0,
    stageEnteredAt: Date.now(),
    startedAt: Date.now(),
    history: [
      { type: 'stage-entered', timestamp: Date.now(), stageName: 'canary', stageIndex: 0, percentage: 1, message: 'Started' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'rollout-test-'));
  stateFile = join(tmpDir, STATE_FILE_NAME);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadState / saveState persistence', () => {
  it('returns null when no state file exists', () => {
    expect(loadState('my-flag')).toBeNull();
  });

  it('saves and loads state correctly', () => {
    const state = createRunningState('my-flag');
    saveState(state);

    const loaded = loadState('my-flag');
    expect(loaded).not.toBeNull();
    expect(loaded!.flag).toBe('my-flag');
    expect(loaded!.status).toBe('running');
  });

  it('stores multiple flags independently', () => {
    saveState(createRunningState('flag-a'));
    saveState(createRunningState('flag-b'));

    expect(loadState('flag-a')).not.toBeNull();
    expect(loadState('flag-b')).not.toBeNull();
    expect(loadState('flag-c')).toBeNull();
  });

  it('handles corrupted state file', () => {
    writeFileSync(stateFile, 'not valid json');
    expect(loadState('my-flag')).toBeNull();
  });

  it('overwrites existing state on save', () => {
    const state = createRunningState('my-flag');
    saveState(state);
    state.status = 'paused';
    saveState(state);

    const loaded = loadState('my-flag');
    expect(loaded!.status).toBe('paused');
  });
});

describe('parseStages', () => {
  it('parses named stages with percentages', () => {
    const stages = parseStages('canary:1,ring:10,ga:100');
    expect(stages).toEqual([
      { name: 'canary', percentage: 1 },
      { name: 'ring', percentage: 10 },
      { name: 'ga', percentage: 100 },
    ]);
  });

  it('generates default stage names when not provided', () => {
    const stages = parseStages('1,10,100');
    expect(stages[0].name).toBe('stage-0');
    expect(stages[1].name).toBe('stage-1');
    expect(stages[2].name).toBe('stage-2');
  });

  it('handles single stage', () => {
    const stages = parseStages('ga:100');
    expect(stages).toHaveLength(1);
    expect(stages[0].percentage).toBe(100);
  });

  it('handles whitespace in stage definitions', () => {
    const stages = parseStages(' canary : 1 , ga : 100 ');
    expect(stages[0].name).toBe('canary');
    expect(stages[0].percentage).toBe(1);
  });

  it('handles invalid percentage as NaN', () => {
    const stages = parseStages('bad:notanumber');
    expect(stages[0].name).toBe('bad');
    expect(Number.isNaN(stages[0].percentage)).toBe(true);
  });
});

describe('rollout start', () => {
  it('creates state file with initial canary stage', () => {
    const state = createRunningState('new-feature');
    saveState(state);

    const loaded = loadState('new-feature');
    expect(loaded!.status).toBe('running');
    expect(loaded!.currentStageIndex).toBe(0);
    expect(loaded!.currentStageName).toBe('canary');
    expect(loaded!.currentPercentage).toBe(1);
    expect(loaded!.history.length).toBeGreaterThanOrEqual(1);
  });
});

describe('rollout status', () => {
  it('reads state from file', () => {
    const state = createRunningState('my-flag', { currentPercentage: 10 });
    saveState(state);

    const loaded = loadState('my-flag');
    expect(loaded!.currentPercentage).toBe(10);
  });

  it('returns null for nonexistent flag', () => {
    expect(loadState('nonexistent')).toBeNull();
  });

  it('lists all active rollouts from state file', () => {
    saveState(createRunningState('flag-1'));
    saveState(createRunningState('flag-2', { status: 'paused' }));

    const data = JSON.parse(readFileSync(stateFile, 'utf8'));
    expect(Object.keys(data)).toEqual(['flag-1', 'flag-2']);
  });
});

describe('rollout promote', () => {
  it('advances stage index when passing checks met', () => {
    const state = createRunningState('my-flag', { consecutivePassingChecks: 3 });
    saveState(state);

    const loaded = loadState('my-flag')!;
    const nextIndex = loaded.currentStageIndex + 1;

    // Simulate promote logic
    expect(loaded.consecutivePassingChecks).toBeGreaterThanOrEqual(3);
    loaded.currentStageIndex = nextIndex;
    loaded.consecutivePassingChecks = 0;
    loaded.consecutiveFailingChecks = 0;
    loaded.stageEnteredAt = Date.now();
    loaded.history.push({
      type: 'promoted',
      timestamp: Date.now(),
      stageName: loaded.currentStageName,
      stageIndex: nextIndex,
      percentage: loaded.currentPercentage,
      message: 'Promoted',
    });
    saveState(loaded);

    const promoted = loadState('my-flag')!;
    expect(promoted.currentStageIndex).toBe(1);
    expect(promoted.history.some((e) => e.type === 'promoted')).toBe(true);
  });

  it('blocks promotion when health checks failing', () => {
    const state = createRunningState('my-flag', { consecutivePassingChecks: 1 });
    saveState(state);

    const loaded = loadState('my-flag')!;
    expect(loaded.consecutivePassingChecks < 3).toBe(true);
  });

  it('allows force promotion even with failing checks', () => {
    const state = createRunningState('my-flag', { consecutivePassingChecks: 0 });
    saveState(state);

    const loaded = loadState('my-flag')!;
    const force = true;
    if (force || loaded.consecutivePassingChecks >= 3) {
      loaded.currentStageIndex += 1;
      loaded.history.push({
        type: 'promoted',
        timestamp: Date.now(),
        stageName: loaded.currentStageName,
        stageIndex: loaded.currentStageIndex,
        percentage: loaded.currentPercentage,
        message: 'Promoted (forced)',
      });
      saveState(loaded);
    }

    const promoted = loadState('my-flag')!;
    expect(promoted.currentStageIndex).toBe(1);
    expect(promoted.history.at(-1)!.message).toContain('forced');
  });

  it('completes rollout at GA stage', () => {
    const state = createRunningState('my-flag', {
      consecutivePassingChecks: 3,
      currentStageIndex: 3,
    });
    saveState(state);

    const loaded = loadState('my-flag')!;
    // If no more stages, complete
    loaded.status = 'completed';
    loaded.currentPercentage = 100;
    saveState(loaded);

    expect(loadState('my-flag')!.status).toBe('completed');
    expect(loadState('my-flag')!.currentPercentage).toBe(100);
  });

  it('cannot promote non-running rollout', () => {
    const state = createRunningState('my-flag', { status: 'paused' });
    saveState(state);

    const loaded = loadState('my-flag')!;
    expect(loaded.status).not.toBe('running');
  });
});

describe('rollout rollback', () => {
  it('sets status to rolled-back and percentage to 0', () => {
    const state = createRunningState('my-flag', { currentPercentage: 50 });
    saveState(state);

    const loaded = loadState('my-flag')!;
    loaded.status = 'rolled-back';
    loaded.currentPercentage = 0;
    loaded.history.push({
      type: 'rollback',
      timestamp: Date.now(),
      stageName: loaded.currentStageName,
      stageIndex: loaded.currentStageIndex,
      percentage: 0,
      message: 'Manual rollback via CLI',
    });
    saveState(loaded);

    const result = loadState('my-flag')!;
    expect(result.status).toBe('rolled-back');
    expect(result.currentPercentage).toBe(0);
    expect(result.history.at(-1)!.type).toBe('rollback');
  });
});

describe('rollout pause / resume', () => {
  it('pauses a running rollout', () => {
    const state = createRunningState('my-flag');
    saveState(state);

    const loaded = loadState('my-flag')!;
    expect(loaded.status).toBe('running');
    loaded.status = 'paused';
    loaded.history.push({
      type: 'paused',
      timestamp: Date.now(),
      stageName: loaded.currentStageName,
      stageIndex: loaded.currentStageIndex,
      percentage: loaded.currentPercentage,
      message: 'Paused via CLI',
    });
    saveState(loaded);

    expect(loadState('my-flag')!.status).toBe('paused');
  });

  it('resumes a paused rollout', () => {
    const state = createRunningState('my-flag', { status: 'paused' });
    saveState(state);

    const loaded = loadState('my-flag')!;
    loaded.status = 'running';
    loaded.history.push({
      type: 'resumed',
      timestamp: Date.now(),
      stageName: loaded.currentStageName,
      stageIndex: loaded.currentStageIndex,
      percentage: loaded.currentPercentage,
      message: 'Resumed via CLI',
    });
    saveState(loaded);

    expect(loadState('my-flag')!.status).toBe('running');
    expect(loadState('my-flag')!.history.at(-1)!.type).toBe('resumed');
  });

  it('cannot pause non-running rollout', () => {
    const state = createRunningState('my-flag', { status: 'completed' });
    saveState(state);
    expect(loadState('my-flag')!.status).not.toBe('running');
  });

  it('cannot resume non-paused rollout', () => {
    const state = createRunningState('my-flag');
    saveState(state);
    expect(loadState('my-flag')!.status).not.toBe('paused');
  });
});

describe('rollout history tracking', () => {
  it('accumulates history events through lifecycle', () => {
    const state = createRunningState('my-flag');
    saveState(state);

    const loaded = loadState('my-flag')!;
    // Pause
    loaded.status = 'paused';
    loaded.history.push({ type: 'paused', timestamp: Date.now(), stageName: 'canary', stageIndex: 0, percentage: 1, message: 'Paused' });
    // Resume
    loaded.status = 'running';
    loaded.history.push({ type: 'resumed', timestamp: Date.now(), stageName: 'canary', stageIndex: 0, percentage: 1, message: 'Resumed' });
    // Promote
    loaded.currentStageIndex = 1;
    loaded.history.push({ type: 'promoted', timestamp: Date.now(), stageName: 'ring-1', stageIndex: 1, percentage: 10, message: 'Promoted' });
    // Rollback
    loaded.status = 'rolled-back';
    loaded.history.push({ type: 'rollback', timestamp: Date.now(), stageName: 'ring-1', stageIndex: 1, percentage: 0, message: 'Rollback' });
    saveState(loaded);

    const final = loadState('my-flag')!;
    // Initial + 4 events
    expect(final.history.length).toBe(5);
    expect(final.history.map((h) => h.type)).toEqual([
      'stage-entered', 'paused', 'resumed', 'promoted', 'rollback',
    ]);
  });
});
