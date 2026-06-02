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
  });
});
