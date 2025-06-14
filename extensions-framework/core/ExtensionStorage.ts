import { ExtensionStorage as IExtensionStorage } from './types';

export class ExtensionStorage implements IExtensionStorage {
  constructor(private extensionId: string) {}

  async get(key: string): Promise<any> {
    // TODO: Implement storage backend
    return null;
  }

  async set(key: string, value: any): Promise<void> {
    // TODO: Implement storage backend
  }

  async remove(key: string): Promise<void> {
    // TODO: Implement storage backend
  }

  async clear(): Promise<void> {
    // TODO: Implement storage backend
  }

  async keys(): Promise<string[]> {
    // TODO: Implement storage backend
    return [];
  }
} 