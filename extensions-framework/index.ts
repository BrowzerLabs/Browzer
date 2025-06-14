// Main entry point for the Browzer Extensions Framework

export { ExtensionRuntime } from './core/ExtensionRuntime';
export { SecurityManager } from './security/SecurityManager';
export { ExtensionSandboxManager } from './security/SandboxManager';
export { CommunicationBus } from './communication/CommunicationBus';
export { ExtensionStorage } from './core/ExtensionStorage';
export { ExtensionLogger } from './core/ExtensionLogger';
export { APIRegistry } from './core/APIRegistry';

// Export all types
export * from './core/types';

// Import types for internal use
import { 
  ExtensionFrameworkConfig, 
  ExtensionEvent, 
  ExtensionPermission, 
  SecurityLevel 
} from './core/types';
import { ExtensionRuntime } from './core/ExtensionRuntime';

// Framework factory for easy initialization
export class ExtensionFramework {
  private runtime: ExtensionRuntime;
  private isInitialized = false;

  constructor(
    private config: ExtensionFrameworkConfig,
    private extensionsDir: string
  ) {
    this.runtime = new ExtensionRuntime(config, extensionsDir);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.runtime.initialize();
    this.isInitialized = true;
  }

  getRuntime(): ExtensionRuntime {
    return this.runtime;
  }

  // Convenience methods
  async loadExtension(extensionPath: string) {
    return this.runtime.loadExtension(extensionPath);
  }

  async unloadExtension(extensionId: string) {
    return this.runtime.unloadExtension(extensionId);
  }

  getLoadedExtensions() {
    return this.runtime.getLoadedExtensions();
  }

  onExtensionEvent(callback: (event: ExtensionEvent) => void) {
    this.runtime.on('extension-event', callback);
  }
}

// Default configuration
export const defaultConfig: ExtensionFrameworkConfig = {
  maxExtensions: 50,
  developmentMode: false,
  autoUpdate: true,
  storageQuota: 100, // MB per extension
  defaultPermissions: [ExtensionPermission.STORAGE],
  trustedSources: [],
  securityLevel: SecurityLevel.MODERATE,
  storeEndpoint: 'https://browzer-store.example.com',
  telemetryEnabled: false
}; 