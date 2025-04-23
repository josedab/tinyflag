---
sidebar_position: 6
title: Flag Sync
description: Pull and push flag files from remote endpoints with optimistic locking.
---

# Flag Sync

Synchronize flag files between local development and remote storage (HTTP endpoints, CDNs, S3 via pre-signed URLs).

## Pull Flags

Download flag config from a remote URL to a local file:

```typescript
import { pullFlags } from 'tinyflag';

const result = await pullFlags(
  'https://cdn.example.com/flags.yml',
  './flags.yml',
  { headers: { Authorization: 'Bearer <token>' } },
);

console.log(result.status); // 'created' | 'updated' | 'not-modified'
console.log(result.etag);   // ETag for subsequent conditional fetches
```

Pull uses ETag-based conditional requests automatically. On subsequent pulls, if the remote file hasn't changed, you get `'not-modified'` with no file write.

Force re-download regardless of ETag:

```typescript
await pullFlags(url, './flags.yml', { force: true });
```

## Push Flags

Upload a local flag file to a remote endpoint:

```typescript
import { pushFlags } from 'tinyflag';

const result = await pushFlags(
  'https://api.example.com/flags',
  './flags.yml',
  { headers: { Authorization: 'Bearer <token>' } },
);

console.log(result.status); // 'pushed' | 'conflict'
```

Push supports optimistic locking via ETags. If the remote file was modified since your last pull, you get `'conflict'` instead of overwriting.

## Three-Way Merge

Resolve conflicts between local and remote changes:

```typescript
import { threeWayMerge } from 'tinyflag';

const { merged, conflicts } = threeWayMerge(baseContent, localContent, remoteContent);

if (merged) {
  // Auto-merged successfully
  fs.writeFileSync('./flags.yml', merged);
} else {
  // Conflicts require manual resolution
  console.log('Conflicts:', conflicts);
  // e.g., ['Line 5: local="rollout: 50" remote="rollout: 80"']
}
```

## Sync Metadata

A `.tinyflag-sync` metadata file is created alongside pulled files to track the remote URL, ETag, and content hash for change detection.
