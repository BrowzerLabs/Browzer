import { EventEmitter } from 'events';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

import Store from 'electron-store';

import type { NotionWorkspaceMetadata } from '@/shared/types';

export class NotionTokenManager extends EventEmitter {
  private static instance: NotionTokenManager | null = null;
  private store: Store;
  private cachedMetadata: NotionWorkspaceMetadata | null = null;

  private readonly STORAGE_KEY = 'notion_workspace_metadata';
  private readonly STORE_NAME = 'browzer-integrations';

  private constructor() {
    super();
    this.store = this.initializeStore();
  }

  private initializeStore(): Store {
    try {
      return new Store({ name: this.STORE_NAME });
    } catch {
      console.warn(
        '[NotionTokenManager] Store corrupted (likely encrypted legacy data), resetting...'
      );
      this.deleteCorruptedStoreFile();

      try {
        return new Store({ name: this.STORE_NAME });
      } catch (retryError) {
        console.error(
          '[NotionTokenManager] Fatal: Failed to initialize store after recovery attempt. ' +
            'This may indicate deleteCorruptedStoreFile failed (e.g., permission denied) ' +
            'or the store file remains corrupted.',
          retryError
        );
        throw new Error(
          `NotionTokenManager store initialization failed after corruption recovery: ${retryError instanceof Error ? retryError.message : String(retryError)}`
        );
      }
    }
  }

  private deleteCorruptedStoreFile(): void {
    try {
      const userDataPath = app.getPath('userData');
      const storeFilePath = join(userDataPath, `${this.STORE_NAME}.json`);
      if (existsSync(storeFilePath)) {
        unlinkSync(storeFilePath);
        console.log('[NotionTokenManager] Deleted corrupted store file');
      }
    } catch (err) {
      console.error('[NotionTokenManager] Failed to delete store file:', err);
    }
  }

  public static getInstance(): NotionTokenManager {
    if (!NotionTokenManager.instance) {
      NotionTokenManager.instance = new NotionTokenManager();
    }
    return NotionTokenManager.instance;
  }

  public saveMetadata(metadata: NotionWorkspaceMetadata): void {
    try {
      const dataWithTimestamp: NotionWorkspaceMetadata = {
        ...metadata,
        created_at: Date.now(),
      };

      this.store.set(this.STORAGE_KEY, dataWithTimestamp);
      this.cachedMetadata = dataWithTimestamp;
      console.log('[NotionTokenManager] Workspace metadata saved');
    } catch (error) {
      console.error('[NotionTokenManager] Failed to save metadata:', error);
      throw error;
    }
  }

  public getMetadata(): NotionWorkspaceMetadata | null {
    if (this.cachedMetadata) {
      return this.cachedMetadata;
    }

    try {
      const metadata = this.store.get(this.STORAGE_KEY) as
        | NotionWorkspaceMetadata
        | undefined;

      if (!metadata || !metadata.workspace_id) {
        return null;
      }

      this.cachedMetadata = metadata;
      return metadata;
    } catch (error) {
      console.error('[NotionTokenManager] Failed to get metadata:', error);
      this.clearMetadata();
      return null;
    }
  }

  public isConnected(): boolean {
    return this.getMetadata() !== null;
  }

  public clearMetadata(): void {
    this.cachedMetadata = null;
    this.store.delete(this.STORAGE_KEY);
    console.log('[NotionTokenManager] Workspace metadata cleared');
  }

  public destroy(): void {
    this.cachedMetadata = null;
  }
}

export function getNotionTokenManager(): NotionTokenManager {
  return NotionTokenManager.getInstance();
}
