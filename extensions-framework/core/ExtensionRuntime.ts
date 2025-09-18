import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  ExtensionManifest,
  ExtensionContext,
  ExtensionType,
  ExtensionEvent,
  ExtensionEventType,
  ExtensionFrameworkConfig,
  ExtensionError,
  ExtensionErrorCode,
  ExtensionPermission,
  RuntimeType
} from './types';
import { SecurityManager } from '../security/SecurityManager';
import { CommunicationBus } from '../communication/CommunicationBus';
import { ExtensionSandboxManager } from '../security/SandboxManager';
import { ExtensionStorage } from './ExtensionStorage';
import { ExtensionLogger } from './ExtensionLogger';
import { APIRegistry } from './APIRegistry';
import { WebExtensionHandler } from './handlers/WebExtensionHandler';
import { PythonExtensionHandler } from './handlers/PythonExtensionHandler';

export class ExtensionRuntime extends EventEmitter {
  private loadedExtensions = new Map<string, ExtensionContext>();
  private extensionManifests = new Map<string, ExtensionManifest>();
  private securityManager: SecurityManager;
  private communicationBus: CommunicationBus;
  private sandboxManager: ExtensionSandboxManager;
  private apiRegistry: APIRegistry;
  private logger: ExtensionLogger;
  private webExtensionHandler: WebExtensionHandler;
  private pythonExtensionHandler: PythonExtensionHandler;
  private isInitialized = false;

  constructor(
    private config: ExtensionFrameworkConfig,
    private extensionsDir: string
  ) {
    super();
    this.logger = new ExtensionLogger('ExtensionRuntime');
    this.securityManager = new SecurityManager(config);
    this.communicationBus = new CommunicationBus();
    this.sandboxManager = new ExtensionSandboxManager(config);
    this.apiRegistry = new APIRegistry();
    this.webExtensionHandler = new WebExtensionHandler();
    this.pythonExtensionHandler = new PythonExtensionHandler(config.pythonExecutable);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing Extension Runtime...');

      // Initialize subsystems
      await this.securityManager.initialize();
      await this.communicationBus.initialize();
      await this.sandboxManager.initialize();
      await this.apiRegistry.initialize();

      // Register core APIs
      await this.registerCoreAPIs();

      // Load installed extensions
      await this.loadInstalledExtensions();

      this.isInitialized = true;
      this.logger.info('Extension Runtime initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Extension Runtime', error as Error);
      throw error;
    }
  }

  async loadExtension(extensionPath: string): Promise<ExtensionContext> {
    try {
      this.logger.info(`Loading extension from: ${extensionPath}`);

      // Validate extension path
      const stats = await fs.stat(extensionPath);
      if (!stats.isDirectory()) {
        throw new ExtensionError(
          'Extension path must be a directory',
          ExtensionErrorCode.INSTALLATION_FAILED
        );
      }

      // Load and validate manifest
      const manifest = await this.loadManifest(extensionPath);
      
      // Check if extension is already loaded
      if (this.loadedExtensions.has(manifest.id)) {
        throw new ExtensionError(
          `Extension ${manifest.id} is already loaded`,
          ExtensionErrorCode.INSTALLATION_FAILED,
          manifest.id
        );
      }

      // Security validation
      await this.securityManager.validateExtension(manifest, extensionPath);

      // Check dependencies
      await this.validateDependencies(manifest);

      // Create sandbox
      const sandbox = await this.sandboxManager.createSandbox(manifest);

      // Create extension context
      const context: ExtensionContext = {
        id: manifest.id,
        manifest,
        path: extensionPath,
        config: await this.loadExtensionConfig(extensionPath, manifest),
        permissions: manifest.permissions,
        sandbox,
        runtime: {
          type: this.determineRuntimeType(manifest),
          version: process.version,
          environment: process.env as Record<string, string>,
          entrypoint: manifest.main || this.getDefaultEntrypoint(manifest)
        },
        apis: this.apiRegistry,
        storage: new ExtensionStorage(manifest.id),
        messaging: this.communicationBus.createExtensionMessaging(manifest.id),
        logger: new ExtensionLogger(manifest.id)
      };

      // Initialize extension based on type
      await this.initializeExtensionByType(context);

      // Store context
      this.loadedExtensions.set(manifest.id, context);
      this.extensionManifests.set(manifest.id, manifest);

      // Emit event
      this.emitExtensionEvent(ExtensionEventType.INSTALLED, manifest.id);

      this.logger.info(`Extension ${manifest.name} loaded successfully`);
      return context;

    } catch (error) {
      this.logger.error(`Failed to load extension from ${extensionPath}`, error as Error);
      throw error;
    }
  }

  async unloadExtension(extensionId: string): Promise<void> {
    try {
      const context = this.loadedExtensions.get(extensionId);
      if (!context) {
        throw new ExtensionError(
          `Extension ${extensionId} is not loaded`,
          ExtensionErrorCode.RUNTIME_ERROR,
          extensionId
        );
      }

      this.logger.info(`Unloading extension: ${context.manifest.name}`);

      // Cleanup extension based on type
      await this.cleanupExtensionByType(context);

      // Cleanup sandbox
      await this.sandboxManager.destroySandbox(context.sandbox);

      // Remove from loaded extensions
      this.loadedExtensions.delete(extensionId);
      this.extensionManifests.delete(extensionId);

      // Emit event
      this.emitExtensionEvent(ExtensionEventType.UNINSTALLED, extensionId);

      this.logger.info(`Extension ${context.manifest.name} unloaded successfully`);

    } catch (error) {
      this.logger.error(`Failed to unload extension ${extensionId}`, error as Error);
      throw error;
    }
  }

  async enableExtension(extensionId: string): Promise<void> {
    const context = this.loadedExtensions.get(extensionId);
    if (!context) {
      throw new ExtensionError(
        `Extension ${extensionId} is not loaded`,
        ExtensionErrorCode.RUNTIME_ERROR,
        extensionId
      );
    }

    // Extension-type specific enabling logic
    await this.enableExtensionByType(context);
    
    this.emitExtensionEvent(ExtensionEventType.ENABLED, extensionId);
    this.logger.info(`Extension ${context.manifest.name} enabled`);
  }

  async disableExtension(extensionId: string): Promise<void> {
    const context = this.loadedExtensions.get(extensionId);
    if (!context) {
      throw new ExtensionError(
        `Extension ${extensionId} is not loaded`,
        ExtensionErrorCode.RUNTIME_ERROR,
        extensionId
      );
    }

    // Extension-type specific disabling logic
    await this.disableExtensionByType(context);
    
    this.emitExtensionEvent(ExtensionEventType.DISABLED, extensionId);
    this.logger.info(`Extension ${context.manifest.name} disabled`);
  }

  getLoadedExtensions(): ExtensionContext[] {
    return Array.from(this.loadedExtensions.values());
  }

  getExtension(extensionId: string): ExtensionContext | undefined {
    return this.loadedExtensions.get(extensionId);
  }

  getExtensionManifest(extensionId: string): ExtensionManifest | undefined {
    return this.extensionManifests.get(extensionId);
  }

  private async loadManifest(extensionPath: string): Promise<ExtensionManifest> {
    const manifestPath = path.join(extensionPath, 'manifest.json');
    
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as ExtensionManifest;
      
      // Validate required fields
      this.validateManifest(manifest);
      
      return manifest;
    } catch (error) {
      throw new ExtensionError(
        `Failed to load manifest: ${(error as Error).message}`,
        ExtensionErrorCode.INVALID_MANIFEST
      );
    }
  }

  private validateManifest(manifest: ExtensionManifest): void {
    const requiredFields = ['id', 'name', 'version', 'description', 'author', 'type'];
    
    for (const field of requiredFields) {
      if (!manifest[field as keyof ExtensionManifest]) {
        throw new ExtensionError(
          `Missing required field in manifest: ${field}`,
          ExtensionErrorCode.INVALID_MANIFEST
        );
      }
    }

    // Validate extension type
    if (!Object.values(ExtensionType).includes(manifest.type)) {
      throw new ExtensionError(
        `Invalid extension type: ${manifest.type}`,
        ExtensionErrorCode.INVALID_MANIFEST
      );
    }

    // Validate permissions
    for (const permission of manifest.permissions) {
      if (!Object.values(ExtensionPermission).includes(permission)) {
        throw new ExtensionError(
          `Invalid permission: ${permission}`,
          ExtensionErrorCode.INVALID_MANIFEST
        );
      }
    }
  }

  private async validateDependencies(manifest: ExtensionManifest): Promise<void> {
    if (!manifest.dependencies) return;

    for (const dependency of manifest.dependencies) {
      const dependencyContext = this.loadedExtensions.get(dependency.id);
      
      if (!dependencyContext && !dependency.optional) {
        throw new ExtensionError(
          `Missing required dependency: ${dependency.id}`,
          ExtensionErrorCode.DEPENDENCY_MISSING,
          manifest.id
        );
      }

      if (dependencyContext) {
        // TODO: Implement version compatibility checking
        // checkVersionCompatibility(dependencyContext.manifest.version, dependency.version);
      }
    }
  }

  private async loadExtensionConfig(extensionPath: string, manifest: ExtensionManifest): Promise<Record<string, any>> {
    const configPath = path.join(extensionPath, 'config.json');
    
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(configContent);
    } catch (error) {
      // Return default config based on schema
      const defaultConfig: Record<string, any> = {};
      
      if (manifest.configSchema) {
        for (const [key, schema] of Object.entries(manifest.configSchema)) {
          if (schema.default !== undefined) {
            defaultConfig[key] = schema.default;
          }
        }
      }
      
      return defaultConfig;
    }
  }

  private determineRuntimeType(manifest: ExtensionManifest): RuntimeType {
    switch (manifest.type) {
      case ExtensionType.PYTHON_AGENT:
      case ExtensionType.AI_ASSISTANT:
        return RuntimeType.PYTHON;
      case ExtensionType.WEB_EXTENSION:
      case ExtensionType.JS_MODULE:
      case ExtensionType.BROWSER_ENHANCEMENT:
        return RuntimeType.JAVASCRIPT;
      default:
        return RuntimeType.JAVASCRIPT;
    }
  }

  private getDefaultEntrypoint(manifest: ExtensionManifest): string {
    switch (manifest.type) {
      case ExtensionType.PYTHON_AGENT:
      case ExtensionType.AI_ASSISTANT:
        return 'main.py';
      case ExtensionType.WEB_EXTENSION:
        return 'background.js';
      case ExtensionType.JS_MODULE:
        return 'index.js';
      default:
        return 'index.js';
    }
  }

  private async initializeExtensionByType(context: ExtensionContext): Promise<void> {
    switch (context.manifest.type) {
      case ExtensionType.WEB_EXTENSION:
        await this.initializeWebExtension(context);
        break;
      case ExtensionType.PYTHON_AGENT:
      case ExtensionType.AI_ASSISTANT:
        await this.initializePythonExtension(context);
        break;
      case ExtensionType.JS_MODULE:
        await this.initializeJSModule(context);
        break;
      case ExtensionType.THEME:
        await this.initializeTheme(context);
        break;
      default:
        this.logger.warn(`Unknown extension type: ${context.manifest.type}`);
    }
  }

  private async cleanupExtensionByType(context: ExtensionContext): Promise<void> {
    switch (context.manifest.type) {
      case ExtensionType.WEB_EXTENSION:
        await this.cleanupWebExtension(context);
        break;
      case ExtensionType.PYTHON_AGENT:
      case ExtensionType.AI_ASSISTANT:
        await this.cleanupPythonExtension(context);
        break;
      case ExtensionType.JS_MODULE:
        await this.cleanupJSModule(context);
        break;
      case ExtensionType.THEME:
        await this.cleanupTheme(context);
        break;
    }
  }

  private async enableExtensionByType(context: ExtensionContext): Promise<void> {
    switch (context.manifest.type) {
      case ExtensionType.WEB_EXTENSION:
        await this.webExtensionHandler.enable(context);
        break;
      case ExtensionType.PYTHON_AGENT:
      case ExtensionType.AI_ASSISTANT:
        await this.pythonExtensionHandler.enable(context);
        break;
      case ExtensionType.JS_MODULE:
        // JS module enabling logic
        break;
      case ExtensionType.THEME:
        // Theme enabling logic
        break;
      default:
        this.logger.warn(`Unknown extension type for enabling: ${context.manifest.type}`);
    }
  }

  private async disableExtensionByType(context: ExtensionContext): Promise<void> {
    switch (context.manifest.type) {
      case ExtensionType.WEB_EXTENSION:
        await this.webExtensionHandler.disable(context);
        break;
      case ExtensionType.PYTHON_AGENT:
      case ExtensionType.AI_ASSISTANT:
        await this.pythonExtensionHandler.disable(context);
        break;
      case ExtensionType.JS_MODULE:
        // JS module disabling logic
        break;
      case ExtensionType.THEME:
        // Theme disabling logic
        break;
      default:
        this.logger.warn(`Unknown extension type for disabling: ${context.manifest.type}`);
    }
  }

  // Extension type handlers
  private async initializeWebExtension(context: ExtensionContext): Promise<void> {
    await this.webExtensionHandler.initialize(context);
  }

  private async initializePythonExtension(context: ExtensionContext): Promise<void> {
    await this.pythonExtensionHandler.initialize(context);
  }

  private async initializeJSModule(context: ExtensionContext): Promise<void> {
    // JavaScript module initialization logic
  }

  private async initializeTheme(context: ExtensionContext): Promise<void> {
    // Theme initialization logic
  }

  private async cleanupWebExtension(context: ExtensionContext): Promise<void> {
    await this.webExtensionHandler.cleanup(context);
  }

  private async cleanupPythonExtension(context: ExtensionContext): Promise<void> {
    await this.pythonExtensionHandler.cleanup(context);
  }

  private async cleanupJSModule(context: ExtensionContext): Promise<void> {
    // JavaScript module cleanup logic
  }

  private async cleanupTheme(context: ExtensionContext): Promise<void> {
    // Theme cleanup logic
  }

  private async loadInstalledExtensions(): Promise<void> {
    try {
      const extensionDirs = await fs.readdir(this.extensionsDir);
      
      for (const extensionDir of extensionDirs) {
        const extensionPath = path.join(this.extensionsDir, extensionDir);
        
        // Skip non-directories (like master.json files)
        try {
          const stats = await fs.stat(extensionPath);
          if (!stats.isDirectory()) {
            this.logger.debug(`Skipping non-directory item: ${extensionDir}`);
            continue;
          }
        } catch (statError) {
          this.logger.debug(`Failed to stat ${extensionPath}, skipping`);
          continue;
        }
        
        try {
          const context = await this.loadExtension(extensionPath);
          
          // Enable the extension immediately after loading
          try {
            await this.enableExtension(context.id);
            this.logger.info(`Extension ${context.manifest.name} loaded and enabled successfully`);
          } catch (enableError) {
            this.logger.error(`Failed to enable extension ${context.manifest.name}`, enableError as Error);
          }
        } catch (error) {
          this.logger.error(`Failed to load extension from ${extensionPath}`, error as Error);
        }
      }
    } catch (error) {
      this.logger.warn('Extensions directory not found or inaccessible');
    }
  }

  private async registerCoreAPIs(): Promise<void> {
    // Register browser APIs, Python execution APIs, etc.
    // Implementation will be added
  }

  async executePythonExtension(extensionId: string, action: string, data: any, browserApiKeys: Record<string, string>, selectedProvider: string, mcp_servers: any): Promise<any> {
    const context = this.loadedExtensions.get(extensionId);
    if (!context) {
      throw new ExtensionError(
        `Extension ${extensionId} is not loaded`,
        ExtensionErrorCode.RUNTIME_ERROR,
        extensionId
      );
    }

    if (context.manifest.type !== ExtensionType.PYTHON_AGENT && context.manifest.type !== ExtensionType.AI_ASSISTANT) {
      throw new ExtensionError(
        `Extension ${extensionId} is not a Python extension`,
        ExtensionErrorCode.RUNTIME_ERROR,
        extensionId
      );
    }

    return await this.pythonExtensionHandler.executeScript(
      context,
      action,
      data,
      browserApiKeys,
      selectedProvider,
      mcp_servers
    );
  }

  async executeWebExtension(extensionId: string, action: string, data: any): Promise<any> {
    const context = this.loadedExtensions.get(extensionId);
    if (!context) {
      throw new ExtensionError(
        `Extension ${extensionId} is not loaded`,
        ExtensionErrorCode.RUNTIME_ERROR,
        extensionId
      );
    }

    if (context.manifest.type !== ExtensionType.WEB_EXTENSION && context.manifest.type !== ExtensionType.JS_MODULE) {
      throw new ExtensionError(
        `Extension ${extensionId} is not a web extension`,
        ExtensionErrorCode.RUNTIME_ERROR,
        extensionId
      );
    }

    return await this.webExtensionHandler.executeAction(context, action, data);
  }

  private getModelForProvider(provider: string): string {
    const modelMap: Record<string, string> = {
      'openai': 'gpt-3.5-turbo',
      'anthropic': 'claude-3-sonnet-20240229',
      'perplexity': 'pplx-7b-online',
      'chutes': 'deepseek-ai/DeepSeek-R1'
    };
    
    return modelMap[provider] || 'gpt-3.5-turbo';
  }

  private emitExtensionEvent(type: ExtensionEventType, extensionId: string, data?: any): void {
    const event: ExtensionEvent = {
      type,
      extensionId,
      data,
      timestamp: Date.now()
    };

    this.emit('extension-event', event);
    this.communicationBus.broadcast({
      id: `event-${Date.now()}`,
      from: 'runtime',
      type: 'event' as any,
      data: event,
      timestamp: Date.now()
    });
  }
} 