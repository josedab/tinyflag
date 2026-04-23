import type { FlagConfig, TinyFlagOptions, ValidationError } from './types.js';
import { parseYaml } from './yaml.js';
import { parseFlagConfig } from './schema.js';

export type SourceType = 'file' | 'url' | 'inline';

export interface LoadResult {
  config: FlagConfig;
  warnings: ValidationError[];
}

const FILE_EXTENSIONS = ['.yml', '.yaml', '.json'];

/** Detect the source type from the options. */
export function detectSourceType(source: string | FlagConfig): SourceType {
  if (typeof source !== 'string') return 'inline';
  if (source.startsWith('http://') || source.startsWith('https://')) return 'url';
  if (FILE_EXTENSIONS.some((ext) => source.endsWith(ext))) return 'file';
  throw new Error(
    `Unrecognized source format: "${source}". ` +
      `Expected a file path ending in .yml/.yaml/.json, a URL starting with http(s)://, or an inline object.`,
  );
}

/** Parse raw text content (YAML or JSON) into a FlagConfig. */
export function parseSource(content: string, filePath: string, strict: boolean): LoadResult {
  let raw: unknown;

  if (filePath.endsWith('.json')) {
    try {
      raw = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Failed to parse JSON file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    try {
      raw = parseYaml(content);
    } catch (error) {
      throw new Error(
        `Failed to parse YAML file "${filePath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const { config, errors, warnings } = parseFlagConfig(raw, strict);

  if (errors.length > 0) {
    const errorList = errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Flag validation failed for "${filePath}":\n${errorList}`);
  }

  return { config, warnings };
}

/** Load flags from a file path (Node.js/Bun/Deno only). */
export async function loadFromFile(filePath: string, strict: boolean): Promise<LoadResult> {
  // Dynamic import of fs to avoid bundling it for browsers
  let content: string;
  try {
    const fs = await import('fs');
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Flag file not found: "${filePath}"`);
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error(`Permission denied reading flag file: "${filePath}"`);
    }
    if (
      (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' ||
      (error as Error).message?.includes('import')
    ) {
      throw new Error(
        'File source is not supported in this runtime. Use a URL or inline object instead.',
      );
    }
    throw error;
  }

  return parseSource(content, filePath, strict);
}

/** Load flags from a URL. */
export async function loadFromUrl(
  url: string,
  strict: boolean,
  headers?: Record<string, string>,
  etag?: string,
  lastModified?: string,
): Promise<LoadResult & { etag?: string; lastModified?: string; notModified?: boolean }> {
  const requestHeaders: Record<string, string> = { ...headers };
  if (etag) {
    requestHeaders['If-None-Match'] = etag;
  }
  if (lastModified) {
    requestHeaders['If-Modified-Since'] = lastModified;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: requestHeaders,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch flags from "${url}": ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 304) {
    return { config: { flags: {} }, warnings: [], notModified: true };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch flags from "${url}": HTTP ${response.status}`);
  }

  const content = await response.text();
  const extension = url.includes('.json') ? '.json' : '.yml';
  const result = parseSource(
    content,
    `url:${url}${extension.startsWith('.') ? '' : extension}`,
    strict,
  );
  const newEtag = response.headers.get('etag') ?? undefined;
  const newLastModified = response.headers.get('last-modified') ?? undefined;

  return { ...result, etag: newEtag, lastModified: newLastModified };
}

/** Load flags from an inline object. */
export function loadFromInline(source: FlagConfig, strict: boolean): LoadResult {
  const { config, errors, warnings } = parseFlagConfig(source, strict);

  if (errors.length > 0) {
    const errorList = errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n');
    throw new Error(`Inline flag config validation failed:\n${errorList}`);
  }

  return { config, warnings };
}
