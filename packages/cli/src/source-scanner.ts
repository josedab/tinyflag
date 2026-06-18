import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join } from 'path';

export const JAVASCRIPT_SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

export const DEFAULT_SCAN_EXCLUDES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.next',
  'build',
]);

export interface SourceFile {
  path: string;
  content: string;
}

export interface SourceScanOptions {
  extensions?: Iterable<string>;
  excludeDirectories?: Iterable<string>;
  ignoreHiddenEntries?: boolean;
  onError?: (path: string, error: unknown) => void;
}

export function scanSourceFiles(root: string, options: SourceScanOptions = {}): SourceFile[] {
  const extensions = new Set(options.extensions ?? JAVASCRIPT_SOURCE_EXTENSIONS);
  const excludeDirectories = new Set(options.excludeDirectories ?? DEFAULT_SCAN_EXCLUDES);
  const files: SourceFile[] = [];

  function walk(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch (error) {
      options.onError?.(currentDir, error);
      return;
    }

    for (const entry of entries) {
      if (excludeDirectories.has(entry)) continue;
      if (options.ignoreHiddenEntries && entry.startsWith('.')) continue;

      const fullPath = join(currentDir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch (error) {
        options.onError?.(fullPath, error);
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!stat.isFile() || !extensions.has(extname(entry))) continue;

      try {
        files.push({ path: fullPath, content: readFileSync(fullPath, 'utf-8') });
      } catch (error) {
        options.onError?.(fullPath, error);
      }
    }
  }

  walk(root);
  return files;
}
