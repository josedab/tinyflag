import type { FlagConfig, TinyFlagErrorCode, TinyFlagOptions } from './types.js';
import {
  detectSourceType,
  loadFromFile,
  loadFromInline,
  loadFromUrl,
  loadMultiSource,
  type SourceType,
} from './loader.js';

const MIN_POLL_INTERVAL = 5_000;
const DEFAULT_POLL_INTERVAL = 60_000;

export type ResolvedTinyFlagOptions = Required<Pick<TinyFlagOptions, 'strict' | 'watch'>> &
  TinyFlagOptions;

export interface SourceLoadResult {
  config: FlagConfig;
  warnings: { path: string; message: string }[];
}

export class FlagSourceController {
  private type: SourceType;
  private pollTimer?: ReturnType<typeof setInterval>;
  private watcher?: { close(): void };
  private etag?: string;
  private lastModified?: string;

  constructor(private readonly options: ResolvedTinyFlagOptions) {
    this.type = detectSourceType(options.source);
  }

  get sourceType(): SourceType {
    return this.type;
  }

  setSource(source: TinyFlagOptions['source']): void {
    (this.options as TinyFlagOptions).source = source;
    this.type = detectSourceType(source);
  }

  load(): SourceLoadResult | undefined | Promise<SourceLoadResult | undefined> {
    const { source, strict } = this.options;

    switch (this.type) {
      case 'file':
        return loadFromFile(source as string, strict);
      case 'url':
        return this.loadUrl(source as string, strict);
      case 'inline':
        return loadFromInline(source as FlagConfig, strict);
      case 'multi':
        return loadMultiSource(
          source as Array<string | FlagConfig>,
          strict,
          this.options.headers,
          this.options.fetchTimeout,
          this.options.retries,
          this.options.retryDelay,
        );
    }
  }

  startAutoRefresh(
    reload: () => Promise<void>,
    warn: (code: TinyFlagErrorCode, message: string) => void,
  ): void {
    if (this.type === 'url') {
      let interval = this.options.pollInterval ?? DEFAULT_POLL_INTERVAL;
      if (interval < MIN_POLL_INTERVAL) {
        interval = MIN_POLL_INTERVAL;
        warn('POLL_INTERVAL_CLAMPED', `pollInterval clamped to minimum of ${MIN_POLL_INTERVAL}ms`);
      }
      this.pollTimer = setInterval(() => reload(), interval);
      if (typeof this.pollTimer === 'object' && 'unref' in this.pollTimer) {
        this.pollTimer.unref();
      }
    }

    if (this.type === 'file' && this.options.watch) {
      void this.startFileWatcher(reload);
    }
  }

  destroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  private async startFileWatcher(reload: () => Promise<void>): Promise<void> {
    try {
      const fs = await import('fs');
      this.watcher = fs.watch(this.options.source as string, { persistent: false }, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          setTimeout(() => reload(), 100);
        }
      });
    } catch {
      // File watching is optional in runtimes without fs.
    }
  }

  private async loadUrl(source: string, strict: boolean): Promise<SourceLoadResult | undefined> {
    const result = await loadFromUrl(
      source,
      strict,
      this.options.headers,
      this.etag,
      this.lastModified,
      this.options.fetchTimeout,
      this.options.retries,
      this.options.retryDelay,
    );
    if (result.notModified) return undefined;
    this.etag = result.etag;
    this.lastModified = result.lastModified;
    return result;
  }
}
