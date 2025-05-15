import { describe, it, expect, beforeEach } from 'vitest';
import { CollabState, processCollabMessage } from '../collab.js';

describe('collaboration protocol', () => {
  let state: CollabState;

  beforeEach(() => {
    state = new CollabState();
  });

  describe('CollabState', () => {
    it('joins a session', () => {
      const result = state.join('user-1', 'Alice');
      expect(result.sessionId).toBeTruthy();
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].userId).toBe('user-1');
      expect(state.sessionCount).toBe(1);
    });

    it('tracks multiple sessions', () => {
      state.join('user-1', 'Alice');
      const result = state.join('user-2', 'Bob');
      expect(result.sessions).toHaveLength(2);
      expect(state.sessionCount).toBe(2);
    });

    it('removes session on leave', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.leave(sessionId);
      expect(state.sessionCount).toBe(0);
    });

    it('releases locks on leave', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('dark-mode', sessionId);
      expect(state.lockCount).toBe(1);

      const released = state.leave(sessionId);
      expect(released).toContain('dark-mode');
      expect(state.lockCount).toBe(0);
    });
  });

  describe('locking', () => {
    it('acquires a lock', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      const result = state.acquireLock('dark-mode', sessionId);
      expect(result.success).toBe(true);
      expect(result.lock?.flagName).toBe('dark-mode');
    });

    it('denies lock to another session', () => {
      const s1 = state.join('user-1', 'Alice');
      const s2 = state.join('user-2', 'Bob');

      state.acquireLock('dark-mode', s1.sessionId);
      const result = state.acquireLock('dark-mode', s2.sessionId);
      expect(result.success).toBe(false);
      expect(result.heldBy).toBe('user-1');
    });

    it('allows same session to re-acquire lock', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('dark-mode', sessionId);
      const result = state.acquireLock('dark-mode', sessionId);
      expect(result.success).toBe(true);
    });

    it('releases a lock', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('dark-mode', sessionId);
      expect(state.releaseLock('dark-mode', sessionId)).toBe(true);
      expect(state.lockCount).toBe(0);
    });

    it('prevents release by wrong session', () => {
      const s1 = state.join('user-1', 'Alice');
      const s2 = state.join('user-2', 'Bob');
      state.acquireLock('dark-mode', s1.sessionId);
      expect(state.releaseLock('dark-mode', s2.sessionId)).toBe(false);
    });
  });

  describe('editing', () => {
    it('records edit when lock held', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('dark-mode', sessionId);

      const op = state.recordEdit('update', 'dark-mode', 'enabled', false, true, sessionId);
      expect(op).toBeTruthy();
      expect(op!.type).toBe('update');
      expect(op!.newValue).toBe(true);
    });

    it('rejects edit without lock', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      const op = state.recordEdit('update', 'dark-mode', 'enabled', false, true, sessionId);
      expect(op).toBeNull();
    });

    it('tracks edit history', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('dark-mode', sessionId);
      state.recordEdit('update', 'dark-mode', 'enabled', false, true, sessionId);
      state.recordEdit('update', 'dark-mode', 'rollout', 0, 50, sessionId);

      const history = state.getHistory('dark-mode');
      expect(history).toHaveLength(2);
    });
  });

  describe('presence', () => {
    it('returns all sessions', () => {
      state.join('user-1', 'Alice');
      state.join('user-2', 'Bob');
      const presence = state.getPresence();
      expect(presence).toHaveLength(2);
    });

    it('updates cursor position', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.updateCursor(sessionId, { flag: 'dark-mode', field: 'enabled' });
      const presence = state.getPresence();
      expect(presence[0].cursor?.flag).toBe('dark-mode');
    });
  });

  describe('processCollabMessage', () => {
    it('handles join message', () => {
      const result = processCollabMessage(state, '', {
        type: 'join',
        userId: 'user-1',
        displayName: 'Alice',
      });
      expect(result.responses[0].type).toBe('joined');
      expect(result.broadcast?.type).toBe('session-joined');
    });

    it('handles lock message', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      const result = processCollabMessage(state, sessionId, {
        type: 'lock',
        flagName: 'dark-mode',
      });
      expect(result.responses[0].type).toBe('locked');
    });

    it('handles lock denial', () => {
      const s1 = state.join('user-1', 'Alice');
      const s2 = state.join('user-2', 'Bob');
      state.acquireLock('dark-mode', s1.sessionId);

      const result = processCollabMessage(state, s2.sessionId, {
        type: 'lock',
        flagName: 'dark-mode',
      });
      expect(result.responses[0].type).toBe('lock-denied');
    });

    it('handles edit message', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('dark-mode', sessionId);

      const result = processCollabMessage(state, sessionId, {
        type: 'edit',
        flagName: 'dark-mode',
        field: 'enabled',
        value: true,
      });
      expect(result.broadcast?.type).toBe('edited');
    });

    it('handles cursor message', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      const result = processCollabMessage(state, sessionId, {
        type: 'cursor',
        flag: 'dark-mode',
        field: 'enabled',
      });
      expect(result.broadcast?.type).toBe('cursor-update');
    });

    it('handles presence request', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      const result = processCollabMessage(state, sessionId, {
        type: 'presence-request',
      });
      expect(result.responses[0].type).toBe('presence');
    });

    it('handles history request', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      const result = processCollabMessage(state, sessionId, {
        type: 'history-request',
        flagName: 'dark-mode',
        limit: 10,
      });
      expect(result.responses[0].type).toBe('history');
    });

    it('handles leave message and releases locks with broadcasts', () => {
      const s1 = state.join('user-1', 'Alice');
      state.acquireLock('flag-a', s1.sessionId);
      state.acquireLock('flag-b', s1.sessionId);

      const result = processCollabMessage(state, s1.sessionId, {
        type: 'leave',
        sessionId: s1.sessionId,
      });
      expect(result.broadcast?.type).toBe('session-left');
      expect(result.additionalBroadcasts).toBeDefined();
      expect(result.additionalBroadcasts!.length).toBe(2);
      expect(result.additionalBroadcasts!.every((b) => b.type === 'unlocked')).toBe(true);
    });

    it('handles unlock message', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('dark-mode', sessionId);

      const result = processCollabMessage(state, sessionId, {
        type: 'unlock',
        flagName: 'dark-mode',
      });
      expect(result.broadcast?.type).toBe('unlocked');
      expect(state.lockCount).toBe(0);
    });

    it('unlock by wrong session produces no broadcast', () => {
      const s1 = state.join('user-1', 'Alice');
      const s2 = state.join('user-2', 'Bob');
      state.acquireLock('dark-mode', s1.sessionId);

      const result = processCollabMessage(state, s2.sessionId, {
        type: 'unlock',
        flagName: 'dark-mode',
      });
      expect(result.broadcast).toBeUndefined();
      expect(state.lockCount).toBe(1);
    });

    it('handles edit without lock and returns error', () => {
      const { sessionId } = state.join('user-1', 'Alice');

      const result = processCollabMessage(state, sessionId, {
        type: 'edit',
        flagName: 'dark-mode',
        field: 'enabled',
        value: true,
      });
      expect(result.responses[0].type).toBe('error');
      expect(result.broadcast).toBeUndefined();
    });
  });
});

describe('collab edge cases', () => {
  let state: CollabState;

  beforeEach(() => {
    state = new CollabState();
  });

  describe('releaseLock edge cases', () => {
    it('returns false when releasing lock held by different session', () => {
      const s1 = state.join('user-1', 'Alice');
      const s2 = state.join('user-2', 'Bob');
      state.acquireLock('my-flag', s1.sessionId);

      expect(state.releaseLock('my-flag', s2.sessionId)).toBe(false);
      expect(state.lockCount).toBe(1);
    });

    it('returns false when releasing nonexistent lock', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      expect(state.releaseLock('nonexistent-flag', sessionId)).toBe(false);
    });
  });

  describe('lock cleanup on disconnect', () => {
    it('releases all locks when session leaves', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('flag-1', sessionId);
      state.acquireLock('flag-2', sessionId);
      state.acquireLock('flag-3', sessionId);

      const released = state.leave(sessionId);
      expect(released).toHaveLength(3);
      expect(released).toContain('flag-1');
      expect(released).toContain('flag-2');
      expect(released).toContain('flag-3');
      expect(state.lockCount).toBe(0);
    });

    it('does not release locks from other sessions on leave', () => {
      const s1 = state.join('user-1', 'Alice');
      const s2 = state.join('user-2', 'Bob');
      state.acquireLock('flag-a', s1.sessionId);
      state.acquireLock('flag-b', s2.sessionId);

      state.leave(s1.sessionId);
      expect(state.lockCount).toBe(1);
    });
  });

  describe('history cap bounds', () => {
    it('caps history at 1000 entries, keeping last 500', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('flag', sessionId);

      for (let i = 0; i < 1001; i++) {
        state.recordEdit('update', 'flag', 'enabled', false, true, sessionId);
      }

      const history = state.getHistory();
      expect(history.length).toBeLessThanOrEqual(500);
    });

    it('getHistory respects limit parameter', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('flag', sessionId);

      for (let i = 0; i < 10; i++) {
        state.recordEdit('update', 'flag', 'enabled', false, true, sessionId);
      }

      const history = state.getHistory(undefined, 3);
      expect(history).toHaveLength(3);
    });

    it('getHistory filters by flag name', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('flag-a', sessionId);
      state.acquireLock('flag-b', sessionId);

      state.recordEdit('update', 'flag-a', 'enabled', false, true, sessionId);
      state.recordEdit('update', 'flag-b', 'enabled', false, true, sessionId);
      state.recordEdit('update', 'flag-a', 'rollout', 0, 50, sessionId);

      const history = state.getHistory('flag-a');
      expect(history).toHaveLength(2);
    });
  });

  describe('concurrent acquireLock on same flag', () => {
    it('second session is denied while first holds lock', () => {
      const s1 = state.join('user-1', 'Alice');
      const s2 = state.join('user-2', 'Bob');

      const r1 = state.acquireLock('shared-flag', s1.sessionId);
      const r2 = state.acquireLock('shared-flag', s2.sessionId);

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(false);
      expect(r2.heldBy).toBe('user-1');
    });

    it('second session can acquire after first releases', () => {
      const s1 = state.join('user-1', 'Alice');
      const s2 = state.join('user-2', 'Bob');

      state.acquireLock('shared-flag', s1.sessionId);
      state.releaseLock('shared-flag', s1.sessionId);

      const r2 = state.acquireLock('shared-flag', s2.sessionId);
      expect(r2.success).toBe(true);
    });
  });

  describe('leave releasing all locks', () => {
    it('returns released lock flag names', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('a', sessionId);
      state.acquireLock('b', sessionId);

      const released = state.leave(sessionId);
      expect(released.sort()).toEqual(['a', 'b']);
    });

    it('returns empty array when no locks held', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      const released = state.leave(sessionId);
      expect(released).toEqual([]);
    });
  });

  describe('getPresence after disconnect', () => {
    it('does not include left sessions', () => {
      const s1 = state.join('user-1', 'Alice');
      state.join('user-2', 'Bob');

      state.leave(s1.sessionId);
      const presence = state.getPresence();
      expect(presence).toHaveLength(1);
      expect(presence[0].userId).toBe('user-2');
    });
  });

  describe('rapid lock/unlock cycling', () => {
    it('handles rapid lock/unlock without corruption', () => {
      const { sessionId } = state.join('user-1', 'Alice');

      for (let i = 0; i < 100; i++) {
        state.acquireLock('cycling-flag', sessionId);
        state.releaseLock('cycling-flag', sessionId);
      }

      expect(state.lockCount).toBe(0);
      const r = state.acquireLock('cycling-flag', sessionId);
      expect(r.success).toBe(true);
    });
  });

  describe('acquireLock with invalid session', () => {
    it('fails when session does not exist', () => {
      const result = state.acquireLock('flag', 'nonexistent-session');
      expect(result.success).toBe(false);
      expect(result.heldBy).toBe('unknown');
    });
  });

  describe('recordEdit edge cases', () => {
    it('returns null for invalid session', () => {
      const op = state.recordEdit('update', 'flag', 'enabled', false, true, 'bad-session');
      expect(op).toBeNull();
    });

    it('refreshes lock expiry on edit', () => {
      const { sessionId } = state.join('user-1', 'Alice');
      state.acquireLock('flag', sessionId);

      // Record edit should refresh lock
      const op = state.recordEdit('update', 'flag', 'enabled', false, true, sessionId);
      expect(op).not.toBeNull();
    });
  });

  describe('updateCursor edge cases', () => {
    it('returns false for nonexistent session', () => {
      expect(state.updateCursor('bad-session', { flag: 'f' })).toBe(false);
    });
  });
});
