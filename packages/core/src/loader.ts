import type { FlagConfig, TinyFlagOptions, ValidationError } from './types.js';
import { parseYaml } from './yaml.js';
import { parseFlagConfig } from './schema.js';
import { mergeFlagConfigs } from './merge.js';

export type SourceType = 'file' | 'url' | 'inline' | 'multi';

export interface LoadResult {
  config: FlagConfig;
  warnings: ValidationError[];
}

/** Check if an HTTP status code represents a transient error worth retrying. */
function isTransientError(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/** Error subclass that carries HTTP status for retry decisions. */
class FetchError extends Error {
  constructor(
    message: string,
    readonly status: number = 0,
    readonly isNetworkError: boolean = false,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/** Sleep for a duration with exponential backoff and jitter. */
function retryDelay(attempt: number, baseDelay: number): Promise<void> {
  const delay = baseDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

const FILE_EXTENSIONS = ['.yml', '.yaml', '.json'];

/** Detect the source type from the options. */
export function detectSourceType(
  source: string | FlagConfig | Array<string | FlagConfig>,
): SourceType {
  if (Array.isArray(source)) return 'multi';
  if (typeof source !== 'string') return 'inline';
  if (source.startsWith('http://') || source.startsWith('https://')) return 'url';
  if (FILE_EXTENSIONS.some((ext) => source.endsWith(ext))) return 'file';
  return 'file';
}

/** Detect source type for a single (non-array) source entry. */
export function detectSingleSourceType(source: string | FlagConfig): 'file' | 'url' | 'inline' {
  if (typeof source !== 'string') return 'inline';
  if (source.startsWith('http://') || source.startsWith('https://')) return 'url';
  return 'file';
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
    content = await fs.promises.readFile(filePath, 'utf-8');
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

/** Load flags from a URL. Supports retries with exponential backoff for transient errors. */
export async function loadFromUrl(
  url: string,
  strict: boolean,
  headers?: Record<string, string>,
  etag?: string,
  lastModified?: string,
  fetchTimeout?: number,
  retries?: number,
  retryDelayMs?: number,
): Promise<LoadResult & { etag?: string; lastModified?: string; notModified?: boolean }> {
  const maxRetries = retries ?? 0;
  const baseDelay = retryDelayMs ?? 1000;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await retryDelay(attempt - 1, baseDelay);
    }

    try {
      return await fetchFlagsFromUrl(url, strict, headers, etag, lastModified, fetchTimeout);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable =
        error instanceof FetchError && (error.isNetworkError || isTransientError(error.status));
      if (!retryable || attempt === maxRetries) {
        throw lastError;
      }
    }
  }

  throw lastError!;
}

/** Internal: single fetch attempt for URL source. */
async function fetchFlagsFromUrl(
  url: string,
  strict: boolean,
  headers?: Record<string, string>,
  etag?: string,
  lastModified?: string,
  fetchTimeout?: number,
): Promise<LoadResult & { etag?: string; lastModified?: string; notModified?: boolean }> {
  const requestHeaders: Record<string, string> = {
    'User-Agent': 'TinyFlag/0.1.0',
    ...headers,
  };
  if (etag) {
    requestHeaders['If-None-Match'] = etag;
  }
  if (lastModified) {
    requestHeaders['If-Modified-Since'] = lastModified;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeout ?? 5000);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: requestHeaders,
      signal: controller.signal,
    });
  } catch (error) {
    throw new FetchError(
      `Failed to fetch flags from "${url}": ${error instanceof Error ? error.message : String(error)}`,
      0,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 304) {
    return { config: { flags: {} }, warnings: [], notModified: true };
  }

  if (!response.ok) {
    throw new FetchError(
      `Failed to fetch flags from "${url}": HTTP ${response.status}`,
      response.status,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const ALLOWED_CONTENT_TYPES = [
    'application/json',
    'application/yaml',
    'application/x-yaml',
    'text/yaml',
    'text/x-yaml',
    'text/plain',
    'application/octet-stream',
  ];
  if (contentType && !ALLOWED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
    throw new Error(
      `Unexpected Content-Type "${contentType}" from "${url}". ` +
        `Expected JSON, YAML, or plain text.`,
    );
  }

  const content = await response.text();
  const pathname = new URL(url).pathname;
  const isJson = pathname.endsWith('.json') || contentType.includes('application/json');
  const virtualPath = isJson ? `url:${url}.json` : `url:${url}.yml`;
  const result = parseSource(content, virtualPath, strict);
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

/** Load and merge flags from multiple sources (array of file paths, URLs, or inline objects). */
export async function loadMultiSource(
  sources: Array<string | FlagConfig>,
  strict: boolean,
  headers?: Record<string, string>,
  fetchTimeout?: number,
  retries?: number,
  retryDelayMs?: number,
): Promise<LoadResult> {
  const configs: FlagConfig[] = [];
  const allWarnings: ValidationError[] = [];

  for (const src of sources) {
    const type = detectSingleSourceType(src);
    let result: LoadResult;
    switch (type) {
      case 'file':
        result = await loadFromFile(src as string, strict);
        break;
      case 'url':
        result = await loadFromUrl(
          src as string,
          strict,
          headers,
          undefined,
          undefined,
          fetchTimeout,
          retries,
          retryDelayMs,
        );
        break;
      case 'inline':
        result = loadFromInline(src as FlagConfig, strict);
        break;
    }
    configs.push(result.config);
    allWarnings.push(...result.warnings);
  }

  const { config, warnings: mergeWarnings } = mergeFlagConfigs(configs);
  for (const w of mergeWarnings) {
    allWarnings.push({
      path: `flags.${w.flag}.${w.field}`,
      message: w.message,
    });
  }

  return { config, warnings: allWarnings };
}
