import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { parseYaml } from 'tinyflag';
import type { FlagConfig, FlagDefinition } from 'tinyflag';

/** An ephemeral flag override scoped to a PR or branch. */
export interface EphemeralOverride {
  flag: string;
  enabled?: boolean;
  rollout?: number;
  variant?: string;
  /** PR or branch identifier. */
  scope: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** TTL in seconds (default: 7 days). */
  ttl: number;
  /** Who requested the override. */
  author?: string;
}

/** Overlay file containing ephemeral overrides. */
export interface OverlayFile {
  version: number;
  scope: string;
  overrides: EphemeralOverride[];
  createdAt: string;
  expiresAt: string;
}

const DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const MAX_TTL = 30 * 24 * 60 * 60; // 30 days

/**
 * Parse a /flag command from a PR comment.
 * Supported formats:
 *   /flag enable my-flag
 *   /flag disable my-flag
 *   /flag rollout my-flag 50
 *   /flag variant my-flag treatment
 *   /flag reset my-flag
 */
export function parseFlagCommand(comment: string): EphemeralOverride | { action: 'reset'; flag: string } | null {
  const lines = comment.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^\/flag\s+(enable|disable|rollout|variant|reset)\s+([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])(?:\s+(.+))?$/i);
    if (!match) continue;

    const [, action, flag, value] = match;

    if (action === 'reset') {
      return { action: 'reset', flag };
    }

    const override: EphemeralOverride = {
      flag,
      scope: '',
      createdAt: new Date().toISOString(),
      ttl: DEFAULT_TTL,
    };

    switch (action) {
      case 'enable':
        override.enabled = true;
        break;
      case 'disable':
        override.enabled = false;
        break;
      case 'rollout': {
        const pct = parseInt(value || '0', 10);
        if (isNaN(pct) || pct < 0 || pct > 100) return null;
        override.rollout = pct;
        break;
      }
      case 'variant':
        if (!value) return null;
        override.variant = value.trim();
        break;
    }

    return override;
  }
  return null;
}

/**
 * Generate an overlay file for a PR/branch scope.
 */
export function generateOverlayFile(
  scope: string,
  overrides: EphemeralOverride[],
  ttl: number = DEFAULT_TTL,
): OverlayFile {
  const now = new Date();
  const effectiveTtl = Math.min(ttl, MAX_TTL);

  return {
    version: 1,
    scope,
    overrides: overrides.map((o) => ({ ...o, scope, ttl: effectiveTtl })),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + effectiveTtl * 1000).toISOString(),
  };
}

/**
 * Apply overlay overrides to a base flag config.
 */
export function applyOverlay(
  base: FlagConfig,
  overlay: OverlayFile,
  now: Date = new Date(),
): FlagConfig {
  const expiresAt = new Date(overlay.expiresAt);
  if (now > expiresAt) return base;

  const flags = { ...base.flags };

  for (const override of overlay.overrides) {
    const existing = flags[override.flag];
    if (!existing) continue;

    const merged: FlagDefinition = { ...existing };
    if (override.enabled !== undefined) {
      merged.enabled = override.enabled;
    }
    if (override.rollout !== undefined) {
      merged.rollout = override.rollout;
    }
    flags[override.flag] = merged;
  }

  return { ...base, flags };
}

/**
 * Write an overlay file to disk.
 */
export function writeOverlay(
  dir: string,
  scope: string,
  overlay: OverlayFile,
): string {
  const safeName = scope.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const filePath = join(dir, `.tinyflag-overlay-${safeName}.json`);
  writeFileSync(filePath, JSON.stringify(overlay, null, 2));
  return filePath;
}

/**
 * Load an overlay file from disk.
 */
export function loadOverlay(filePath: string): OverlayFile | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as OverlayFile;
  } catch {
    return null;
  }
}

/**
 * Remove expired overlays from a directory. Returns paths of removed files.
 */
export function cleanupExpiredOverlays(
  dir: string,
  now: Date = new Date(),
): string[] {
  const removed: string[] = [];
  if (!existsSync(dir)) return removed;

  const files = readdirSync(dir).filter((f) => f.startsWith('.tinyflag-overlay-') && f.endsWith('.json'));

  for (const file of files) {
    const filePath = join(dir, file);
    const overlay = loadOverlay(filePath);
    if (!overlay) continue;

    const expiresAt = new Date(overlay.expiresAt);
    if (now > expiresAt) {
      unlinkSync(filePath);
      removed.push(filePath);
    }
  }

  return removed;
}

/**
 * List all active overlays in a directory.
 */
export function listActiveOverlays(
  dir: string,
  now: Date = new Date(),
): OverlayFile[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.startsWith('.tinyflag-overlay-') && f.endsWith('.json'));
  const active: OverlayFile[] = [];

  for (const file of files) {
    const overlay = loadOverlay(join(dir, file));
    if (overlay && new Date(overlay.expiresAt) > now) {
      active.push(overlay);
    }
  }

  return active;
}

/**
 * HTTP handler for the ephemeral flag override API.
 * Returns a request handler compatible with Node.js http.createServer.
 */
export function createOverlayHandler(
  overlayDir: string,
  baseConfigPath: string,
) {
  return {
    /** POST /overlays — create or update an overlay */
    createOverlay(scope: string, overrides: EphemeralOverride[], ttl?: number): OverlayFile {
      const overlay = generateOverlayFile(scope, overrides, ttl);
      writeOverlay(overlayDir, scope, overlay);
      return overlay;
    },

    /** DELETE /overlays/:scope — remove an overlay */
    removeOverlay(scope: string): boolean {
      const safeName = scope.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const filePath = join(overlayDir, `.tinyflag-overlay-${safeName}.json`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        return true;
      }
      return false;
    },

    /** GET /overlays — list active overlays */
    listOverlays(): OverlayFile[] {
      return listActiveOverlays(overlayDir);
    },

    /** POST /overlays/cleanup — remove expired overlays */
    cleanup(): string[] {
      return cleanupExpiredOverlays(overlayDir);
    },
  };
}
