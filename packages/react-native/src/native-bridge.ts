/**
 * React Native native module bridge for TinyFlag.
 *
 * Provides a bridge interface that can delegate to native iOS (Swift)
 * or Android (Kotlin) SDKs for optimal performance and app lifecycle integration.
 */

import type { FlagConfig, UserContext } from 'tinyflag';

/** Interface for the native TinyFlag module exposed via React Native bridge. */
export interface TinyFlagNativeModule {
  /** Initialize the native SDK with a JSON config string. */
  initialize(configJson: string): Promise<void>;
  /** Evaluate a flag using the native SDK. */
  isEnabled(flagName: string, contextJson: string): Promise<boolean>;
  /** Get variant using the native SDK. */
  getVariant(flagName: string, contextJson: string): Promise<string | null>;
  /** Start background sync in native layer. */
  startSync(url: string, intervalMs: number): Promise<void>;
  /** Stop background sync. */
  stopSync(): Promise<void>;
  /** Get serialized config from native (for cache persistence). */
  getConfigJson(): Promise<string>;
  /** Notify native SDK of app state change. */
  onAppStateChange(state: 'active' | 'background' | 'inactive'): Promise<void>;
}

/**
 * Create a bridge adapter that wraps the native module.
 * Falls back to JS evaluation when native module is unavailable.
 */
export function createNativeBridge(nativeModule?: TinyFlagNativeModule): NativeBridgeAdapter {
  return new NativeBridgeAdapter(nativeModule);
}

export class NativeBridgeAdapter {
  private nativeModule?: TinyFlagNativeModule;
  private isNativeAvailable: boolean;

  constructor(nativeModule?: TinyFlagNativeModule) {
    this.nativeModule = nativeModule;
    this.isNativeAvailable = !!nativeModule;
  }

  get useNative(): boolean {
    return this.isNativeAvailable;
  }

  async initialize(config: FlagConfig): Promise<void> {
    if (!this.nativeModule) return;
    await this.nativeModule.initialize(JSON.stringify(config));
  }

  async isEnabled(flagName: string, context?: UserContext): Promise<boolean> {
    if (!this.nativeModule) throw new Error('Native module not available');
    return this.nativeModule.isEnabled(flagName, JSON.stringify(context ?? {}));
  }

  async getVariant(flagName: string, context?: UserContext): Promise<string | null> {
    if (!this.nativeModule) throw new Error('Native module not available');
    return this.nativeModule.getVariant(flagName, JSON.stringify(context ?? {}));
  }

  async startSync(url: string, intervalMs: number = 60000): Promise<void> {
    if (!this.nativeModule) return;
    await this.nativeModule.startSync(url, intervalMs);
  }

  async stopSync(): Promise<void> {
    if (!this.nativeModule) return;
    await this.nativeModule.stopSync();
  }

  async onAppStateChange(state: 'active' | 'background' | 'inactive'): Promise<void> {
    if (!this.nativeModule) return;
    await this.nativeModule.onAppStateChange(state);
  }
}
