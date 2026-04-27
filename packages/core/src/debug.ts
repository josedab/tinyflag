const PREFIX = '[tinyflag]';

let debugEnabled: boolean | undefined;

function isDebugEnabled(): boolean {
  if (debugEnabled !== undefined) return debugEnabled;
  try {
    const envDebug = typeof process !== 'undefined' && process.env?.DEBUG;
    debugEnabled = envDebug === 'tinyflag' || envDebug === '*' || envDebug === 'true';
  } catch {
    debugEnabled = false;
  }
  return debugEnabled;
}

/** Enable or disable debug logging programmatically. */
export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

/** Log a debug message if debug mode is active. */
export function debug(message: string, data?: Record<string, unknown>): void {
  if (!isDebugEnabled()) return;
  if (data !== undefined) {
    console.debug(PREFIX, message, data);
  } else {
    console.debug(PREFIX, message);
  }
}
