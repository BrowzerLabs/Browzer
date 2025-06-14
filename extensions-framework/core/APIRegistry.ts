import { ExtensionAPIRegistry, ExtensionAPI } from './types';

export class APIRegistry implements ExtensionAPIRegistry {
  private apis = new Map<string, ExtensionAPI>();

  async initialize(): Promise<void> {
    // TODO: Initialize core APIs
  }

  register(api: ExtensionAPI): void {
    this.apis.set(api.name, api);
  }

  unregister(apiName: string): void {
    this.apis.delete(apiName);
  }

  get(apiName: string): ExtensionAPI | undefined {
    return this.apis.get(apiName);
  }

  list(): string[] {
    return Array.from(this.apis.keys());
  }
} 