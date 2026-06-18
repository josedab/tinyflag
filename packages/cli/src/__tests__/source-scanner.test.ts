import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanSourceFiles } from '../source-scanner.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('scanSourceFiles', () => {
  it('returns matching source files and skips excluded directories', () => {
    const root = createTempDir();
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'node_modules'));
    writeFileSync(join(root, 'src', 'app.ts'), 'export const app = true;');
    writeFileSync(join(root, 'src', 'notes.txt'), 'skip');
    writeFileSync(join(root, 'node_modules', 'dependency.ts'), 'skip');

    expect(scanSourceFiles(root)).toEqual([
      {
        path: join(root, 'src', 'app.ts'),
        content: 'export const app = true;',
      },
    ]);
  });

  it('supports custom extensions, exclusions, and hidden entries', () => {
    const root = createTempDir();
    mkdirSync(join(root, '.hidden'));
    mkdirSync(join(root, 'generated'));
    writeFileSync(join(root, 'main.vue'), '<template />');
    writeFileSync(join(root, '.hidden', 'hidden.vue'), '<template />');
    writeFileSync(join(root, 'generated', 'generated.vue'), '<template />');

    expect(
      scanSourceFiles(root, {
        extensions: ['.vue'],
        excludeDirectories: ['generated'],
        ignoreHiddenEntries: true,
      }).map((file) => file.path),
    ).toEqual([join(root, 'main.vue')]);
  });

  it('reports inaccessible roots through the optional error seam', () => {
    const onError = vi.fn();
    expect(scanSourceFiles('/path/that/does/not/exist', { onError })).toEqual([]);
    expect(onError).toHaveBeenCalledOnce();
  });
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tinyflag-source-scanner-'));
  tempDirs.push(dir);
  return dir;
}
