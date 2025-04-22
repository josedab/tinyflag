/**
 * Real-time collaboration protocol for TinyFlag.
 *
 * Implements WebSocket-based multi-user flag editing with pessimistic locking.
 * Tracks connected sessions, edit history, and user presence.
 */

/** A connected collaboration session. */
export interface CollabSession {
  id: string;
  userId: string;
  displayName: string;
  connectedAt: number;
  lastActivity: number;
  cursor?: { flag: string; field?: string };
}

/** A flag edit lock. */
export interface FlagLock {
  flagName: string;
  lockedBy: string;
  sessionId: string;
  lockedAt: number;
  /** Lock TTL in ms. Default: 60000 (1 minute). */
  expiresAt: number;
}

/** An edit operation. */
export interface EditOperation {
  id: string;
  type: 'update' | 'create' | 'delete';
  flagName: string;
  field?: string;
  previousValue: unknown;
  newValue: unknown;
  userId: string;
  sessionId: string;
  timestamp: number;
}

/** Collaboration protocol message types. */
export type CollabMessage =
  | { type: 'join'; userId: string; displayName: string }
  | { type: 'leave'; sessionId: string }
  | { type: 'lock'; flagName: string }
  | { type: 'unlock'; flagName: string }
  | { type: 'edit'; flagName: string; field: string; value: unknown }
  | { type: 'cursor'; flag: string; field?: string }
  | { type: 'presence-request' }
  | { type: 'history-request'; flagName?: string; limit?: number };

/** Server response messages. */
export type CollabResponse =
  | { type: 'joined'; sessionId: string; sessions: CollabSession[] }
  | { type: 'session-joined'; session: CollabSession }
  | { type: 'session-left'; sessionId: string }
  | { type: 'locked'; flagName: string; lock: FlagLock }
  | { type: 'lock-denied'; flagName: string; heldBy: string }
  | { type: 'unlocked'; flagName: string }
  | { type: 'edited'; operation: EditOperation }
  | { type: 'cursor-update'; sessionId: string; cursor: { flag: string; field?: string } }
  | { type: 'presence'; sessions: CollabSession[] }
  | { type: 'history'; operations: EditOperation[] }
  | { type: 'error'; message: string };

const LOCK_TTL_MS = 60_000; // 1 minute

/**
 * Collaboration state manager.
 */
export class CollabState {
  private sessions = new Map<string, CollabSession>();
  private locks = new Map<string, FlagLock>();
  private editHistory: EditOperation[] = [];
  private nextId = 1;

  /** Generate a unique session ID. */
  private generateId(): string {
    return `sess-${Date.now().toString(36)}-${(this.nextId++).toString(36)}`;
  }

  /** Generate a unique operation ID. */
  private generateOpId(): string {
    return `op-${Date.now().toString(36)}-${(this.nextId++).toString(36)}`;
  }

  /** Register a new session. */
  join(userId: string, displayName: string): { sessionId: string; sessions: CollabSession[] } {
    const sessionId = this.generateId();
    const session: CollabSession = {
      id: sessionId,
      userId,
      displayName,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.sessions.set(sessionId, session);
    return { sessionId, sessions: Array.from(this.sessions.values()) };
  }

  /** Remove a session and release its locks. */
  leave(sessionId: string): string[] {
    this.sessions.delete(sessionId);
    const releasedLocks: string[] = [];

    for (const [flagName, lock] of this.locks) {
      if (lock.sessionId === sessionId) {
        this.locks.delete(flagName);
        releasedLocks.push(flagName);
      }
    }

    return releasedLocks;
  }

  /** Attempt to acquire a lock on a flag. */
  acquireLock(
    flagName: string,
    sessionId: string,
  ): { success: boolean; lock?: FlagLock; heldBy?: string } {
    this.cleanupExpiredLocks();

    const existing = this.locks.get(flagName);
    if (existing && existing.sessionId !== sessionId) {
      return { success: false, heldBy: existing.lockedBy };
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, heldBy: 'unknown' };
    }

    const lock: FlagLock = {
      flagName,
      lockedBy: session.userId,
      sessionId,
      lockedAt: Date.now(),
      expiresAt: Date.now() + LOCK_TTL_MS,
    };
    this.locks.set(flagName, lock);
    return { success: true, lock };
  }

  /** Release a lock on a flag. */
  releaseLock(flagName: string, sessionId: string): boolean {
    const lock = this.locks.get(flagName);
    if (!lock || lock.sessionId !== sessionId) return false;
    this.locks.delete(flagName);
    return true;
  }

  /** Record an edit operation. */
  recordEdit(
    type: EditOperation['type'],
    flagName: string,
    field: string | undefined,
    previousValue: unknown,
    newValue: unknown,
    sessionId: string,
  ): EditOperation | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Check lock
    const lock = this.locks.get(flagName);
    if (!lock || lock.sessionId !== sessionId) return null;

    // Refresh lock on edit
    lock.expiresAt = Date.now() + LOCK_TTL_MS;

    const op: EditOperation = {
      id: this.generateOpId(),
      type,
      flagName,
      field,
      previousValue,
      newValue,
      userId: session.userId,
      sessionId,
      timestamp: Date.now(),
    };

    this.editHistory.push(op);
    session.lastActivity = Date.now();

    // Cap history at 1000 entries
    if (this.editHistory.length > 1000) {
      this.editHistory = this.editHistory.slice(-500);
    }

    return op;
  }

  /** Update cursor position for a session. */
  updateCursor(sessionId: string, cursor: { flag: string; field?: string }): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.cursor = cursor;
    session.lastActivity = Date.now();
    return true;
  }

  /** Get all active sessions (presence). */
  getPresence(): CollabSession[] {
    return Array.from(this.sessions.values());
  }

  /** Get edit history, optionally filtered by flag. */
  getHistory(flagName?: string, limit: number = 50): EditOperation[] {
    let ops = this.editHistory;
    if (flagName) {
      ops = ops.filter((o) => o.flagName === flagName);
    }
    return ops.slice(-limit);
  }

  /** Remove expired locks. */
  private cleanupExpiredLocks(): void {
    const now = Date.now();
    for (const [flagName, lock] of this.locks) {
      if (now > lock.expiresAt) {
        this.locks.delete(flagName);
      }
    }
  }

  /** Get session count. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Get lock count. */
  get lockCount(): number {
    this.cleanupExpiredLocks();
    return this.locks.size;
  }
}

/**
 * Process a collaboration message and return response(s).
 */
export function processCollabMessage(
  state: CollabState,
  sessionId: string,
  message: CollabMessage,
): { responses: CollabResponse[]; broadcast?: CollabResponse; additionalBroadcasts?: CollabResponse[] } {
  const responses: CollabResponse[] = [];
  const additionalBroadcasts: CollabResponse[] = [];
  let broadcast: CollabResponse | undefined;

  switch (message.type) {
    case 'join': {
      const result = state.join(message.userId, message.displayName);
      responses.push({
        type: 'joined',
        sessionId: result.sessionId,
        sessions: result.sessions,
      });
      broadcast = {
        type: 'session-joined',
        session: result.sessions[result.sessions.length - 1],
      };
      break;
    }

    case 'leave': {
      const released = state.leave(message.sessionId);
      broadcast = { type: 'session-left', sessionId: message.sessionId };
      for (const flagName of released) {
        additionalBroadcasts.push({ type: 'unlocked', flagName });
      }
      break;
    }

    case 'lock': {
      const result = state.acquireLock(message.flagName, sessionId);
      if (result.success && result.lock) {
        responses.push({ type: 'locked', flagName: message.flagName, lock: result.lock });
        broadcast = { type: 'locked', flagName: message.flagName, lock: result.lock };
      } else {
        responses.push({ type: 'lock-denied', flagName: message.flagName, heldBy: result.heldBy || 'unknown' });
      }
      break;
    }

    case 'unlock': {
      const released = state.releaseLock(message.flagName, sessionId);
      if (released) {
        broadcast = { type: 'unlocked', flagName: message.flagName };
      }
      break;
    }

    case 'edit': {
      const op = state.recordEdit('update', message.flagName, message.field, null, message.value, sessionId);
      if (op) {
        broadcast = { type: 'edited', operation: op };
      } else {
        responses.push({ type: 'error', message: `Cannot edit ${message.flagName}: not locked by you` });
      }
      break;
    }

    case 'cursor': {
      state.updateCursor(sessionId, message);
      broadcast = { type: 'cursor-update', sessionId, cursor: { flag: message.flag, field: message.field } };
      break;
    }

    case 'presence-request': {
      responses.push({ type: 'presence', sessions: state.getPresence() });
      break;
    }

    case 'history-request': {
      responses.push({
        type: 'history',
        operations: state.getHistory(message.flagName, message.limit),
      });
      break;
    }
  }

  return { responses, broadcast, additionalBroadcasts: additionalBroadcasts.length > 0 ? additionalBroadcasts : undefined };
}
