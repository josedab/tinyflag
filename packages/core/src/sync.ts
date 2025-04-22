import { readFileSync, writeFileSync, existsSync } from 'fs';

/** Metadata stored alongside pulled flag files. */
interface SyncMeta {
  url: string;
  etag?: string;
  version?: number;
  pulledAt: string;
  contentHash: string;
}

const META_SUFFIX = '.tinyflag-sync';

function metaPath(outputPath: string): string {
  return outputPath + META_SUFFIX;
}

function hashContent(content: string): string {
  // Simple FNV-1a hash for change detection (no crypto needed)
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function readMeta(outputPath: string): SyncMeta | null {
  const mp = metaPath(outputPath);
  if (!existsSync(mp)) return null;
  try {
    return JSON.parse(readFileSync(mp, 'utf-8'));
  } catch {
    return null;
  }
}

function writeMeta(outputPath: string, meta: SyncMeta): void {
  writeFileSync(metaPath(outputPath), JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * Pull flag config from a remote URL and write to a local file.
 * Supports HTTP(S) endpoints. S3/GCS URLs are documented as requiring
 * pre-signed URLs or CLI tools (aws s3 cp, gsutil cp) as a prerequisite.
 */
/**
 * Pull flag config from a remote URL and write to a local file.
 * Supports HTTP(S) endpoints with ETag-based conditional fetching.
 *
 * @param url - Remote URL to fetch flags from.
 * @param outputPath - Local file path to write the flags to.
 * @param options - Pull options: headers, force re-download, and timeout.
 * @returns Pull result with status and optional ETag.
 */
export async function pullFlags(
  url: string,
  outputPath: string,
  options: { headers?: Record<string, string>; force?: boolean; timeout?: number } = {},
): Promise<{ status: 'updated' | 'not-modified' | 'created'; etag?: string }> {
  const meta = readMeta(outputPath);
  const fetchHeaders: Record<string, string> = { ...options.headers };

  // Use ETag for conditional fetch if available
  if (meta?.etag && !options.force) {
    fetchHeaders['If-None-Match'] = meta.etag;
  }

  const response = await fetch(url, {
    headers: fetchHeaders,
    signal: AbortSignal.timeout(options.timeout ?? 30_000),
  });

  if (response.status === 304) {
    return { status: 'not-modified', etag: meta?.etag };
  }

  if (!response.ok) {
    throw new Error(`Pull failed: HTTP ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  const etag = response.headers.get('etag') ?? undefined;
  const isNew = !existsSync(outputPath);

  writeFileSync(outputPath, content, 'utf-8');
  writeMeta(outputPath, {
    url,
    etag,
    pulledAt: new Date().toISOString(),
    contentHash: hashContent(content),
  });

  return { status: isNew ? 'created' : 'updated', etag };
}

/**
 * Push a local flag file to a remote HTTP endpoint.
 * Supports optimistic locking via ETags.
 *
 * @param url - Remote URL to push flags to.
 * @param filePath - Local file path to read flags from.
 * @param options - Push options: headers, force overwrite, and timeout.
 * @returns Push result with status and optional ETag.
 */
export async function pushFlags(
  url: string,
  filePath: string,
  options: { headers?: Record<string, string>; force?: boolean; timeout?: number } = {},
): Promise<{ status: 'pushed' | 'conflict'; etag?: string }> {
  const content = readFileSync(filePath, 'utf-8');
  const meta = readMeta(filePath);
  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/x-yaml',
    ...options.headers,
  };

  // Optimistic locking: send If-Match with known ETag
  if (meta?.etag && !options.force) {
    fetchHeaders['If-Match'] = meta.etag;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: fetchHeaders,
    body: content,
    signal: AbortSignal.timeout(options.timeout ?? 30_000),
  });

  if (response.status === 412) {
    return { status: 'conflict' };
  }

  if (!response.ok) {
    throw new Error(`Push failed: HTTP ${response.status} ${response.statusText}`);
  }

  const newEtag = response.headers.get('etag') ?? undefined;

  writeMeta(filePath, {
    url,
    etag: newEtag,
    pulledAt: new Date().toISOString(),
    contentHash: hashContent(content),
  });

  return { status: 'pushed', etag: newEtag };
}

/**
 * Three-way merge of flag YAML files.
 * Returns merged content or null with conflicts if auto-merge fails.
 */
export function threeWayMerge(
  base: string,
  local: string,
  remote: string,
): { merged: string | null; conflicts: string[] } {
  const baseLines = base.split('\n');
  const localLines = local.split('\n');
  const remoteLines = remote.split('\n');
  const conflicts: string[] = [];
  const merged: string[] = [];

  const maxLen = Math.max(baseLines.length, localLines.length, remoteLines.length);

  for (let i = 0; i < maxLen; i++) {
    const b = baseLines[i] ?? '';
    const l = localLines[i] ?? '';
    const r = remoteLines[i] ?? '';

    if (l === r) {
      // Both agree
      merged.push(l);
    } else if (l === b) {
      // Only remote changed
      merged.push(r);
    } else if (r === b) {
      // Only local changed
      merged.push(l);
    } else {
      // Both changed differently — conflict
      conflicts.push(`Line ${i + 1}: local="${l.trim()}" remote="${r.trim()}"`);
      merged.push(l); // Prefer local for non-interactive
    }
  }

  return {
    merged: conflicts.length === 0 ? merged.join('\n') : null,
    conflicts,
  };
}

export { readMeta as readSyncMeta, writeMeta as writeSyncMeta };
export type { SyncMeta };
