import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseFlagCommand,
  generateOverlayFile,
  applyOverlay,
  writeOverlay,
  loadOverlay,
  cleanupExpiredOverlays,
  listActiveOverlays,
  createOverlayHandler,
} from '../ephemeral.js';
import type { FlagConfig } from 'tinyflag';

describe('ephemeral PR flags', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tinyflag-eph-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseFlagCommand', () => {
    it('parses /flag enable', () => {
      const result = parseFlagCommand('/flag enable dark-mode');
      expect(result).toBeTruthy();
      expect(result).toHaveProperty('enabled', true);
      expect(result).toHaveProperty('flag', 'dark-mode');
    });

    it('parses /flag disable', () => {
      const result = parseFlagCommand('/flag disable dark-mode');
      expect(result).toHaveProperty('enabled', false);
    });

    it('parses /flag rollout', () => {
      const result = parseFlagCommand('/flag rollout checkout-v2 75');
      expect(result).toHaveProperty('rollout', 75);
    });

    it('parses /flag variant', () => {
      const result = parseFlagCommand('/flag variant ab-test treatment');
      expect(result).toHaveProperty('variant', 'treatment');
    });

    it('parses /flag reset', () => {
      const result = parseFlagCommand('/flag reset dark-mode');
      expect(result).toEqual({ action: 'reset', flag: 'dark-mode' });
    });

    it('returns null for invalid commands', () => {
      expect(parseFlagCommand('not a flag command')).toBeNull();
      expect(parseFlagCommand('/flag rollout x -5')).toBeNull();
    });

    it('parses from multi-line comments', () => {
      const comment = 'Hey team,\n/flag enable dark-mode\nThanks!';
      const result = parseFlagCommand(comment);
      expect(result).toHaveProperty('enabled', true);
    });
  });

  describe('generateOverlayFile', () => {
    it('creates overlay with scope and TTL', () => {
      const overlay = generateOverlayFile('pr-42', [
        { flag: 'dark-mode', enabled: true, scope: '', createdAt: '', ttl: 0 },
      ]);
      expect(overlay.scope).toBe('pr-42');
      expect(overlay.overrides).toHaveLength(1);
      expect(new Date(overlay.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('caps TTL at 30 days', () => {
      const overlay = generateOverlayFile('pr-1', [], 999999999);
      const expiresAt = new Date(overlay.expiresAt);
      const maxExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000 + 5000;
      expect(expiresAt.getTime()).toBeLessThanOrEqual(maxExpiry);
    });
  });

  describe('applyOverlay', () => {
    it('applies overrides to base config', () => {
      const base: FlagConfig = {
        flags: {
          'dark-mode': { enabled: false },
          checkout: { enabled: true, rollout: 10 },
        },
      };
      const overlay = generateOverlayFile('pr-42', [
        { flag: 'dark-mode', enabled: true, scope: 'pr-42', createdAt: '', ttl: 3600 },
        { flag: 'checkout', rollout: 100, scope: 'pr-42', createdAt: '', ttl: 3600 },
      ]);
      const result = applyOverlay(base, overlay);
      expect(result.flags['dark-mode'].enabled).toBe(true);
      expect(result.flags['checkout'].rollout).toBe(100);
    });

    it('ignores expired overlays', () => {
      const base: FlagConfig = { flags: { test: { enabled: false } } };
      const overlay = generateOverlayFile('pr-1', [
        { flag: 'test', enabled: true, scope: 'pr-1', createdAt: '', ttl: 1 },
      ]);
      overlay.expiresAt = new Date(Date.now() - 1000).toISOString();
      const result = applyOverlay(base, overlay);
      expect(result.flags['test'].enabled).toBe(false);
    });
  });

  describe('overlay file I/O', () => {
    it('writes and loads overlay files', () => {
      const overlay = generateOverlayFile('pr-99', [
        { flag: 'x', enabled: true, scope: 'pr-99', createdAt: '', ttl: 3600 },
      ]);
      const path = writeOverlay(tmpDir, 'pr-99', overlay);
      expect(existsSync(path)).toBe(true);

      const loaded = loadOverlay(path);
      expect(loaded?.scope).toBe('pr-99');
    });
  });

  describe('cleanupExpiredOverlays', () => {
    it('removes expired overlay files', () => {
      const overlay = generateOverlayFile('pr-old', []);
      overlay.expiresAt = new Date(Date.now() - 1000).toISOString();
      writeOverlay(tmpDir, 'pr-old', overlay);

      const overlay2 = generateOverlayFile('pr-new', []);
      writeOverlay(tmpDir, 'pr-new', overlay2);

      const removed = cleanupExpiredOverlays(tmpDir);
      expect(removed).toHaveLength(1);
      expect(removed[0]).toContain('pr-old');
    });
  });

  describe('listActiveOverlays', () => {
    it('returns only active overlays', () => {
      const active = generateOverlayFile('pr-active', []);
      writeOverlay(tmpDir, 'pr-active', active);

      const expired = generateOverlayFile('pr-expired', []);
      expired.expiresAt = new Date(Date.now() - 1000).toISOString();
      writeOverlay(tmpDir, 'pr-expired', expired);

      const result = listActiveOverlays(tmpDir);
      expect(result).toHaveLength(1);
      expect(result[0].scope).toBe('pr-active');
    });
  });

  describe('createOverlayHandler', () => {
    it('createOverlay writes overlay file with correct TTL and overrides', () => {
      const handler = createOverlayHandler(tmpDir, 'flags.yml');
      const overlay = handler.createOverlay(
        'pr-100',
        [{ flag: 'dark-mode', enabled: true, scope: '', createdAt: '', ttl: 0 }],
        3600,
      );

      expect(overlay.scope).toBe('pr-100');
      expect(overlay.overrides).toHaveLength(1);
      expect(overlay.overrides[0].flag).toBe('dark-mode');
      expect(overlay.overrides[0].ttl).toBe(3600);

      // Verify file was written to disk
      const loaded = loadOverlay(join(tmpDir, '.tinyflag-overlay-pr-100.json'));
      expect(loaded).not.toBeNull();
      expect(loaded!.scope).toBe('pr-100');
    });

    it('removeOverlay deletes overlay file', () => {
      const handler = createOverlayHandler(tmpDir, 'flags.yml');
      handler.createOverlay('pr-200', []);

      const removed = handler.removeOverlay('pr-200');
      expect(removed).toBe(true);
      expect(existsSync(join(tmpDir, '.tinyflag-overlay-pr-200.json'))).toBe(false);
    });

    it('removeOverlay returns false when overlay does not exist', () => {
      const handler = createOverlayHandler(tmpDir, 'flags.yml');
      const removed = handler.removeOverlay('nonexistent');
      expect(removed).toBe(false);
    });

    it('listOverlays returns active overlays', () => {
      const handler = createOverlayHandler(tmpDir, 'flags.yml');
      handler.createOverlay('pr-a', []);
      handler.createOverlay('pr-b', []);

      const overlays = handler.listOverlays();
      expect(overlays).toHaveLength(2);
    });

    it('listOverlays filters expired overlays', () => {
      const handler = createOverlayHandler(tmpDir, 'flags.yml');
      handler.createOverlay('pr-active', []);

      // Manually write expired overlay
      const expired = generateOverlayFile('pr-expired', []);
      expired.expiresAt = new Date(Date.now() - 1000).toISOString();
      writeOverlay(tmpDir, 'pr-expired', expired);

      const overlays = handler.listOverlays();
      expect(overlays).toHaveLength(1);
      expect(overlays[0].scope).toBe('pr-active');
    });

    it('cleanup removes expired overlays and preserves active ones', () => {
      const handler = createOverlayHandler(tmpDir, 'flags.yml');
      handler.createOverlay('pr-keep', []);

      const expired = generateOverlayFile('pr-remove', []);
      expired.expiresAt = new Date(Date.now() - 1000).toISOString();
      writeOverlay(tmpDir, 'pr-remove', expired);

      const removed = handler.cleanup();
      expect(removed).toHaveLength(1);
      expect(removed[0]).toContain('pr-remove');

      const remaining = handler.listOverlays();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].scope).toBe('pr-keep');
    });
  });
});
