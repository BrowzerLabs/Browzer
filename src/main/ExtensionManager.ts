import { session, ipcMain, IpcMainInvokeEvent, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { Extension } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';
import { 
  ExtensionFramework, 
  defaultConfig, 
  ExtensionFrameworkConfig,
  ExtensionType,
  ExtensionPermission,
  SecurityLevel,
  ExtensionEventType
} from '../../extensions-framework';

export class ExtensionManager {
  private loadedExtensions = new Map<string, Extension>();
  private extensionsDir: string;
  private extensionFramework: ExtensionFramework;
  private currentBrowserApiKeys: Record<string, string> = {};
  private currentSelectedProvider: string = 'openai';

  constructor() {
    // Proper path resolution for both development and packaged apps
    let appPath: string;
    if (app.isPackaged) {
      // In packaged app, use app.asar.unpacked for Python files
      appPath = path.dirname(app.getAppPath());
      this.extensionsDir = path.join(appPath, 'app.asar.unpacked', 'extensions');
    } else {
      // In development, use current working directory
      appPath = process.cwd();
      this.extensionsDir = path.join(appPath, 'extensions');
    }
    // console.log('[ExtensionManager] App path:', appPath);
    // console.log('[ExtensionManager] Extensions directory set to:', this.extensionsDir);
    
    // Initialize the new extension framework
    const frameworkConfig: ExtensionFrameworkConfig = {
      ...defaultConfig,
      developmentMode: process.env.NODE_ENV === 'development',
      maxExtensions: 100,
      storageQuota: 200,
      securityLevel: SecurityLevel.MODERATE,
      pythonExecutable: process.platform === 'win32' ? 'python' : 'python3',
      pythonVirtualEnv: path.join(appPath, '.venv'),
      trustedSources: ['browzer-store.com', 'localhost']
    };
    
    this.extensionFramework = new ExtensionFramework(frameworkConfig, this.extensionsDir);
  }

  async initialize(): Promise<void> {
    this.setupIpcHandlers();
    this.ensureExtensionsDirectory();
    
    // Initialize the new extension framework
    await this.extensionFramework.initialize();
    
    // Set up event listeners
    this.extensionFramework.onExtensionEvent((event) => {
      // console.log('Extension event:', event);
      
      // Auto-update master.json when extension is installed
      if (event.type === ExtensionEventType.INSTALLED) {
        this.updateMasterJson(event.extensionId).catch((error: Error) => {
          console.error('Failed to update master.json:', error);
        });
      }
      
      // TODO: Forward events to renderer process
    });
  }

  async loadExtensions(): Promise<void> {
    if (!fs.existsSync(this.extensionsDir)) {
      // console.log('Extensions directory does not exist');
      return;
    }

    try {
      // Check which extensions are already loaded by the framework
      const frameworkExtensions = this.extensionFramework.getRuntime().getLoadedExtensions();
      // console.log(`[ExtensionManager] Framework has already loaded ${frameworkExtensions.length} extensions`);
      
      // Sync the loaded extensions from framework to our legacy map
      for (const context of frameworkExtensions) {
        this.loadedExtensions.set(context.id, {
          id: context.id,
          name: context.manifest.name,
          enabled: true, // Framework extensions are enabled during loadInstalledExtensions
          path: context.path
        });
        // console.log(`[ExtensionManager] Synced framework extension: ${context.manifest.name} (${context.id})`);
      }

      const extensions = fs.readdirSync(this.extensionsDir);
      
      if (extensions.length === 0) {
        // console.log('No extensions found in directory');
        return;
      }

      for (const ext of extensions) {
        const extPath = path.join(this.extensionsDir, ext);
        if (fs.statSync(extPath).isDirectory()) {
          try {
            // Check if this is a new framework extension (has manifest.json)
            const manifestPath = path.join(extPath, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
              // Read manifest to get the extension ID
              const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
              const manifest = JSON.parse(manifestContent);
              
              // Check if already loaded by framework
              if (frameworkExtensions.some(ctx => ctx.id === manifest.id)) {
                // console.log(`[ExtensionManager] Extension ${manifest.name} (${manifest.id}) already loaded by framework, skipping`);
                continue;
              }
              
              // Load using new framework (only if not already loaded)
              const context = await this.extensionFramework.loadExtension(extPath);
              
              // Enable the extension immediately after loading
              await this.extensionFramework.getRuntime().enableExtension(context.id);
              
              // Convert to legacy format for compatibility
              this.loadedExtensions.set(context.id, {
                id: context.id,
                name: context.manifest.name,
                enabled: true,
                path: extPath
              });
              
              // console.log(`[ExtensionManager] Loaded and enabled framework extension: ${context.manifest.name} (${context.manifest.type})`);
            } else {
              // Try loading as Chrome extension (legacy)
              const extension = await session.defaultSession.loadExtension(extPath, {
                allowFileAccess: true
              });
              
              this.loadedExtensions.set(extension.id, {
                id: extension.id,
                name: extension.name,
                enabled: true,
                path: extPath
              });
              
              // console.log(`[ExtensionManager] Loaded Chrome extension: ${extension.name}`);
            }
          } catch (err) {
            console.error(`Failed to load extension ${ext}:`, err);
          }
        }
      }
      
      // console.log(`[ExtensionManager] Extension loading complete. Total extensions: ${this.loadedExtensions.size}`);
    } catch (err) {
      console.error('Error loading extensions:', err);
    }
  }

  // Route request to appropriate extension based on user intent
  async routeRequest(userRequest: string): Promise<{extensionId: string, confidence: number, reason: string, matchedKeywords: string[]} & {type?: string, success?: boolean, error?: string, data?: any, workflow_info?: any}> {
    try {
      // Use proper path resolution for the smart router
      let routerPath: string;
      let pythonExecutable: string;
      
      if (app.isPackaged) {
        // In packaged app, use app.asar.unpacked for Python files
        const appPath = path.dirname(app.getAppPath());
        routerPath = path.join(appPath, 'app.asar.unpacked', 'extensions-framework', 'core', 'smart_extension_router.py');
        pythonExecutable = path.join(appPath, 'app.asar.unpacked', 'python-bundle', 'python-runtime', 'bin', 'python');
      } else {
        // In development
        routerPath = path.join(process.cwd(), 'extensions-framework', 'core', 'smart_extension_router.py');
        pythonExecutable = path.join(process.cwd(), 'python-bundle', 'python-runtime', 'bin', 'python');
      }
      
      // console.log('[ExtensionManager] Router path:', routerPath);
      // console.log('[ExtensionManager] Python executable:', pythonExecutable);
      
      // Fallback to system Python if bundled Python doesn't exist
      if (!fs.existsSync(pythonExecutable)) {
        console.warn('[ExtensionManager] Bundled Python not found, trying venv Python');
        
        // Try old venv approach
        let venvPythonPath: string;
        if (app.isPackaged) {
          const appPath = path.dirname(app.getAppPath());
          venvPythonPath = path.join(appPath, 'app.asar.unpacked', 'agents', 'venv', 'bin', 'python');
        } else {
          venvPythonPath = path.join(process.cwd(), 'agents', 'venv', 'bin', 'python');
        }
        
        if (fs.existsSync(venvPythonPath)) {
          // console.log('[ExtensionManager] Using venv Python');
          pythonExecutable = venvPythonPath;
        } else {
          console.warn('[ExtensionManager] No Python found, using system Python');
          pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
        }
      }
      
      // console.log(`[ExtensionManager] Routing request: "${userRequest}"`);
      
      // Prepare workflow data with API keys for the router
      const workflowData = {
        query: userRequest,
        pageContent: null,
        browserApiKeys: this.getBrowserApiKeys(),
        selectedProvider: this.getSelectedProvider(),
        selectedModel: 'claude-3-7-sonnet-latest',
        isQuestion: true,
        conversationHistory: []
      };
      
      // console.log(`[ExtensionManager] Passing API keys to router:`, Object.keys(workflowData.browserApiKeys));
      
      return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        // Add --routing-only flag to ensure the smart router only does routing, not execution
        const python = spawn(pythonExecutable, [routerPath, this.extensionsDir, userRequest, '--routing-only'], {
          env: {
            ...process.env,
            WORKFLOW_DATA: JSON.stringify(workflowData)
          }
        });
        
        let output = '';
        let errorOutput = '';
        
        python.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });
        
        python.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });
        
        python.on('close', (code: number) => {
          if (code !== 0) {
            console.error(`[ExtensionManager] Router failed with code ${code}: ${errorOutput}`);
            // Fallback to default extension
            resolve({
              extensionId: 'topic-agent',
              confidence: 0,
              reason: `Router failed: ${errorOutput}`,
              matchedKeywords: [],
              type: 'workflow',
              success: false,
              error: errorOutput
            });
            return;
          }
          
          try {
            const result = JSON.parse(output.trim());
            // console.log(`[ExtensionManager] Routing result:`, result);
            
            // Handle workflow vs single extension results
            if (result.type === 'workflow') {
              // For workflow results, preserve the complete workflow information
              resolve({
                type: 'workflow',
                success: result.success,
                error: result.error,
                data: result.data,
                workflow_info: result.workflow_info,
                // Legacy fields for backward compatibility
                extensionId: result.data?.extensionId || 'topic-agent',
                confidence: result.workflow_info?.confidence || 0.8,
                reason: result.workflow_info?.reasoning || 'Workflow routing',
                matchedKeywords: []
              });
            } else if (result.type === 'single_extension') {
              // For single extension results
              resolve({
                type: 'single_extension',
                extensionId: result.data?.extensionId || 'topic-agent',
                confidence: result.data?.confidence || 0,
                reason: result.data?.reason || 'Single extension routing',
                matchedKeywords: result.data?.matchedKeywords || []
              });
            } else {
              // Legacy format support
              resolve(result);
            }
          } catch (parseError) {
            console.error(`[ExtensionManager] Failed to parse router output: ${output}`);
            resolve({
              extensionId: 'topic-agent',
              confidence: 0,
              reason: 'Failed to parse router output',
              matchedKeywords: [],
              type: 'workflow',
              success: false,
              error: 'Failed to parse router output'
            });
          }
        });
        
        python.on('error', (error: Error) => {
          console.error(`[ExtensionManager] Router process error:`, error);
          resolve({
            extensionId: 'topic-agent',
            confidence: 0,
            reason: `Router process error: ${(error as Error).message}`,
            matchedKeywords: [],
            type: 'workflow',
            success: false,
            error: (error as Error).message
          });
        });
      });
    } catch (error) {
      console.error(`[ExtensionManager] Routing error:`, error);
      return {
        extensionId: 'topic-agent',
        confidence: 0,
        reason: `Routing error: ${(error as Error).message}`,
        matchedKeywords: [],
        type: 'workflow',
        success: false,
        error: (error as Error).message
      };
    }
  }

  // New method to execute Python extensions (replaces AgentManager functionality)
  async executePythonExtension(extensionId: string, action: string, data: any): Promise<any> {
    try {
      // Get browser API keys from localStorage or settings
      const browserApiKeys = this.getBrowserApiKeys();
      const selectedProvider = this.getSelectedProvider();
      
      // console.log(`[ExtensionManager] Executing Python extension: ${extensionId} with provider: ${selectedProvider}`);
      
      // Debug: Check if extension is loaded
      const loadedExtensions = this.extensionFramework.getRuntime().getLoadedExtensions();
      const targetExtension = loadedExtensions.find(ext => ext.id === extensionId);
      
      if (!targetExtension) {
        console.error(`[ExtensionManager] Extension ${extensionId} not found in loaded extensions`);
        // console.log(`[ExtensionManager] Available extensions:`, loadedExtensions.map(ext => ext.id));
        throw new Error(`Extension ${extensionId} is not loaded`);
      }
      
      // console.log(`[ExtensionManager] Found extension: ${targetExtension.manifest.name} (${targetExtension.manifest.type})`);
      
      // Execute using the extension framework
      const result = await this.extensionFramework.getRuntime().executePythonExtension(
        extensionId,
        action,
        data,
        browserApiKeys,
        selectedProvider
      );
      
      // console.log(`[ExtensionManager] Extension execution completed for ${extensionId}`);
      return result;
    } catch (error) {
      console.error(`[ExtensionManager] Failed to execute Python extension ${extensionId}:`, error);
      throw error;
    }
  }

  private getBrowserApiKeys(): Record<string, string> {
    return this.currentBrowserApiKeys;
  }

  private getSelectedProvider(): string {
    return this.currentSelectedProvider;
  }

  // Method to update API keys from renderer
  updateBrowserApiKeys(apiKeys: Record<string, string>): void {
    this.currentBrowserApiKeys = apiKeys;
    // console.log(`[ExtensionManager] Updated API keys for providers:`, Object.keys(apiKeys));
  }

  // Method to update selected provider from renderer  
  updateSelectedProvider(provider: string): void {
    this.currentSelectedProvider = provider;
    // console.log(`[ExtensionManager] Updated selected provider:`, provider);
  }

  private async updateMasterJson(extensionId: string): Promise<void> {
    try {
      const masterJsonPath = path.join(this.extensionsDir, 'master.json');
      
      // Get extension context from framework
      const extensionContext = this.extensionFramework.getRuntime().getExtension(extensionId);
      if (!extensionContext) {
        console.error(`Extension ${extensionId} not found in loaded extensions`);
        return;
      }

      const manifest = extensionContext.manifest;
      
      // Read existing master.json
      let masterData: any = {
        version: "1.0.0",
        lastUpdated: new Date().toISOString().split('T')[0],
        extensions: [],
        routing: {
          defaultExtension: "topic-agent",
          fallbackStrategy: "use_default",
          matchingStrategy: "keyword_and_intent",
          confidenceThreshold: 0.3
        }
      };

      if (fs.existsSync(masterJsonPath)) {
        const existingContent = fs.readFileSync(masterJsonPath, 'utf-8');
        masterData = JSON.parse(existingContent);
      }

      // Check if extension already exists in master.json
      const existingIndex = masterData.extensions.findIndex((ext: any) => ext.id === extensionId);
      
      // Create new extension entry
      const extensionEntry = {
        id: extensionId,
        name: manifest.name,
        description: manifest.description,
        keywords: manifest.keywords || [],
        intents: this.extractIntentsFromManifest(manifest),
        category: this.determineCategoryFromManifest(manifest),
        priority: this.determinePriorityFromManifest(manifest),
        directory: path.basename(extensionContext.path),
        type: manifest.type,
        enabled: true
      };

      if (existingIndex >= 0) {
        // Update existing entry
        masterData.extensions[existingIndex] = extensionEntry;
        // console.log(`Updated existing extension in master.json: ${manifest.name}`);
      } else {
        // Add new entry
        masterData.extensions.push(extensionEntry);
        // console.log(`Added new extension to master.json: ${manifest.name}`);
      }

      // Update lastUpdated timestamp
      masterData.lastUpdated = new Date().toISOString().split('T')[0];

      // Write back to master.json
      fs.writeFileSync(masterJsonPath, JSON.stringify(masterData, null, 2), 'utf-8');
      // console.log(`Successfully updated master.json for extension: ${manifest.name}`);

    } catch (error) {
      console.error(`Failed to update master.json for extension ${extensionId}:`, error);
      throw error;
    }
  }

  private async removeFromMasterJson(extensionId: string): Promise<void> {
    try {
      const masterJsonPath = path.join(this.extensionsDir, 'master.json');
      
      if (!fs.existsSync(masterJsonPath)) {
        // console.log('master.json does not exist, nothing to remove');
        return;
      }

      const existingContent = fs.readFileSync(masterJsonPath, 'utf-8');
      const masterData = JSON.parse(existingContent);

      // Find and remove the extension entry
      const initialLength = masterData.extensions.length;
      masterData.extensions = masterData.extensions.filter((ext: any) => ext.id !== extensionId);
      
      if (masterData.extensions.length < initialLength) {
        // Update lastUpdated timestamp
        masterData.lastUpdated = new Date().toISOString().split('T')[0];
        
        // Write back to master.json
        fs.writeFileSync(masterJsonPath, JSON.stringify(masterData, null, 2), 'utf-8');
        // console.log(`Successfully removed extension ${extensionId} from master.json`);
      } else {
        // console.log(`Extension ${extensionId} was not found in master.json`);
      }

    } catch (error) {
      console.error(`Failed to remove extension ${extensionId} from master.json:`, error);
      // Don't throw error here since the main uninstall should still succeed
    }
  }

  private extractIntentsFromManifest(manifest: any): string[] {
    // Extract intents from manifest, with fallbacks
    if (manifest.intents && Array.isArray(manifest.intents)) {
      return manifest.intents;
    }
    
    // Fallback: generate intents from keywords and type
    const intents: string[] = [];
    
    if (manifest.keywords && Array.isArray(manifest.keywords)) {
      intents.push(...manifest.keywords.slice(0, 5)); // Use first 5 keywords as intents
    }
    
    // Add default intents based on extension type
    switch (manifest.type) {
      case 'python_agent':
      case 'ai_assistant':
        intents.push('analyze', 'process', 'assist');
        break;
      case 'web_extension':
        intents.push('enhance', 'modify', 'extend');
        break;
      default:
        intents.push('utility', 'tool');
    }
    
    return [...new Set(intents)]; // Remove duplicates
  }

  private determineCategoryFromManifest(manifest: any): string {
    // Use manifest category if available
    if (manifest.category) {
      return manifest.category;
    }
    
    // Fallback: determine category from type or keywords
    switch (manifest.type) {
      case 'python_agent':
      case 'ai_assistant':
        return 'content_analysis';
      case 'web_extension':
        return 'browser_enhancement';
      case 'theme':
        return 'appearance';
      default:
        return 'utility';
    }
  }

  private determinePriorityFromManifest(manifest: any): number {
    // Use manifest priority if available
    if (manifest.priority && typeof manifest.priority === 'number') {
      return Math.max(1, Math.min(10, manifest.priority)); // Clamp between 1-10
    }
    
    // Default priority based on type
    switch (manifest.type) {
      case 'ai_assistant':
        return 8;
      case 'python_agent':
        return 7;
      case 'web_extension':
        return 6;
      default:
        return 5;
    }
  }

  private setupIpcHandlers(): void {
    // Install extension from local file
    ipcMain.handle(IPC_CHANNELS.INSTALL_EXTENSION, async (event: IpcMainInvokeEvent, extensionPath: string) => {
      try {
        const extension = await session.defaultSession.loadExtension(extensionPath, {
          allowFileAccess: true
        });
        
        const extensionData: Extension = {
          id: extension.id,
          name: extension.name,
          enabled: true,
          path: extensionPath
        };
        
        this.loadedExtensions.set(extension.id, extensionData);
        return { success: true, extension: extensionData };
      } catch (err) {
        console.error('Failed to install extension:', err);
        return { success: false, error: (err as Error).message };
      }
    });

    // Remove extension
    ipcMain.handle(IPC_CHANNELS.REMOVE_EXTENSION, async (event: IpcMainInvokeEvent, extensionId: string) => {
      try {
        const extension = this.loadedExtensions.get(extensionId);
        if (extension) {
          await session.defaultSession.removeExtension(extensionId);
          this.loadedExtensions.delete(extensionId);
          return { success: true };
        }
        return { success: false, error: 'Extension not found' };
      } catch (err) {
        console.error('Failed to remove extension:', err);
        return { success: false, error: (err as Error).message };
      }
    });

    // Get list of installed extensions
    ipcMain.handle(IPC_CHANNELS.GET_EXTENSIONS, () => {
      return Array.from(this.loadedExtensions.values());
    });

    // Install from Chrome Web Store
    ipcMain.handle(IPC_CHANNELS.INSTALL_FROM_STORE, async (event: IpcMainInvokeEvent, extensionId: string) => {
      try {
        const extensionPath = await this.downloadExtension(extensionId);
        const extension = await session.defaultSession.loadExtension(extensionPath);
        
        const extensionData: Extension = {
          id: extension.id,
          name: extension.name,
          enabled: true,
          path: extensionPath
        };
        
        this.loadedExtensions.set(extension.id, extensionData);
        return { success: true, extension: extensionData };
      } catch (err) {
        console.error('Failed to install extension from store:', err);
        return { success: false, error: (err as Error).message };
      }
    });

    // Execute Python extension (replaces agent execution)
    ipcMain.handle('execute-python-extension', async (event: IpcMainInvokeEvent, params: any) => {
      try {
        const { extensionId, action, data, browserApiKeys, selectedProvider } = params;
        
        // console.log(`[IPC] Received execute-python-extension request:`, {
        //   extensionId,
        //   action,
        //   provider: selectedProvider,
        //   hasData: !!data,
        //   hasApiKeys: !!browserApiKeys
        // });
        
        // Update browser API keys for this execution
        this.currentBrowserApiKeys = browserApiKeys || {};
        this.currentSelectedProvider = selectedProvider || 'openai';
        
        // console.log(`[IPC] Executing extension ${extensionId} with action ${action}`);
        
        const result = await this.executePythonExtension(extensionId, action, data);
        
        // console.log(`[IPC] Extension execution successful for ${extensionId}`);
        return result;
      } catch (error) {
        console.error('[IPC] Extension execution error:', error);
        return {
          success: false,
          error: (error as Error).message
        };
      }
    });

    // Extension Store handlers
    ipcMain.handle('get-installed-extensions', async () => {
      try {
        const extensions = Array.from(this.loadedExtensions.values()).map(ext => ({
          id: ext.id,
          name: ext.name,
          enabled: ext.enabled,
          version: '1.0.0', // Default version
          iconUrl: null
        }));
        return extensions;
      } catch (error) {
        console.error('Error getting installed extensions:', error);
        return [];
      }
    });

    // Route user request to appropriate extension
    ipcMain.handle('route-extension-request', async (event: IpcMainInvokeEvent, userRequest: string) => {
      try {
        const routingResult = await this.routeRequest(userRequest);
        return routingResult;
      } catch (error) {
        console.error('Error routing extension request:', error);
        return {
          extensionId: 'topic-agent',
          confidence: 0,
          reason: `Error: ${(error as Error).message}`,
          matchedKeywords: [],
          type: 'workflow',
          success: false,
          error: (error as Error).message
        };
      }
    });

    // Update browser API keys
    ipcMain.handle('update-browser-api-keys', async (event: IpcMainInvokeEvent, apiKeys: Record<string, string>) => {
      try {
        this.updateBrowserApiKeys(apiKeys);
        return { success: true };
      } catch (error) {
        console.error('Error updating browser API keys:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Update selected provider
    ipcMain.handle('update-selected-provider', async (event: IpcMainInvokeEvent, provider: string) => {
      try {
        this.updateSelectedProvider(provider);
        return { success: true };
      } catch (error) {
        console.error('Error updating selected provider:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Get available Python extensions for execution
    ipcMain.handle('get-python-extensions', async () => {
      try {
        const loadedExtensions = this.extensionFramework.getRuntime().getLoadedExtensions();
        // console.log('All loaded extensions:', loadedExtensions.map(ext => ({
        //   id: ext.id,
        //   name: ext.manifest.name,
        //   type: ext.manifest.type
        // })));
        
        const pythonExtensions = loadedExtensions.filter(ext => 
          ext.manifest.type === 'python_agent' || ext.manifest.type === 'ai_assistant'
        );
        
        // console.log('Python extensions found:', pythonExtensions.map(ext => ({
        //   id: ext.id,
        //   name: ext.manifest.name,
        //   type: ext.manifest.type
        // })));
        
        return pythonExtensions.map(ext => ({
          id: ext.id,
          name: ext.manifest.name,
          type: ext.manifest.type,
          enabled: true // For now, assume all loaded extensions are enabled
        }));
      } catch (error) {
        console.error('Error getting Python extensions:', error);
        return [];
      }
    });

    ipcMain.handle('toggle-extension', async (event: IpcMainInvokeEvent, extensionId: string, enable: boolean) => {
      try {
        const extension = this.loadedExtensions.get(extensionId);
        if (!extension) {
          return { success: false, error: 'Extension not found' };
        }

        if (enable) {
          // Re-enable extension
          if (!extension.path) {
            return { success: false, error: 'Extension path not found' };
          }
          await session.defaultSession.loadExtension(extension.path, {
            allowFileAccess: true
          });
                 } else {
           // Disable extension
           await session.defaultSession.removeExtension(extensionId);
         }

        extension.enabled = enable;
        this.loadedExtensions.set(extensionId, extension);
        
        return { success: true };
      } catch (error) {
        console.error('Error toggling extension:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('uninstall-extension', async (event: IpcMainInvokeEvent, extensionId: string) => {
      try {
        const extension = this.loadedExtensions.get(extensionId);
        if (!extension) {
          return { success: false, error: 'Extension not found' };
        }

        // Remove from session
        try {
          await session.defaultSession.removeExtension(extensionId);
        } catch (sessionError) {
          console.warn('Extension was not in browser session:', sessionError);
        }
        
        // Remove from extension framework if it's a framework extension
        try {
          await this.extensionFramework.getRuntime().disableExtension(extensionId);
          // console.log(`Disabled framework extension: ${extensionId}`);
        } catch (frameworkError) {
          console.warn('Extension was not in framework:', frameworkError);
        }
        
        // Remove from loaded extensions
        this.loadedExtensions.delete(extensionId);
        
        // Delete extension files from filesystem
        if (extension.path && fs.existsSync(extension.path)) {
          // console.log(`Deleting extension files at: ${extension.path}`);
          fs.rmSync(extension.path, { recursive: true, force: true });
          // console.log(`Successfully deleted extension files for: ${extensionId}`);
        }
        
        // Remove from master.json
        await this.removeFromMasterJson(extensionId);
        
        return { success: true };
      } catch (error) {
        console.error('Error uninstalling extension:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('install-extension-from-store', async (event: IpcMainInvokeEvent, params: any) => {
      try {
        const { extensionId, data } = params;
        
        // Create extension directory
        const extDir = path.join(this.extensionsDir, extensionId);
        if (fs.existsSync(extDir)) {
          // Remove existing directory
          fs.rmSync(extDir, { recursive: true, force: true });
        }
        fs.mkdirSync(extDir, { recursive: true });
        
        // Save and extract extension file
        const extFile = path.join(extDir, `${extensionId}.bzx`);
        const buffer = Buffer.from(data);
        fs.writeFileSync(extFile, buffer);
        
        // Extract the .bzx file (it's a zip file)
        const { execSync } = require('child_process');
        try {
          execSync(`cd "${extDir}" && unzip -o "${extensionId}.bzx"`, { stdio: 'inherit' });
          // Remove the .bzx file after extraction
          fs.unlinkSync(extFile);
        } catch (unzipError) {
          // console.log('Unzip failed, trying as direct files...');
          // If unzip fails, maybe it's already extracted or a different format
        }
        
        // Try to load the extension
        try {
          // Check if it's a framework extension (has manifest.json)
          const manifestPath = path.join(extDir, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            const context = await this.extensionFramework.loadExtension(extDir);
            
            // Enable the extension immediately after loading
            await this.extensionFramework.getRuntime().enableExtension(context.id);
            
            const extensionData: Extension = {
              id: context.id,
              name: context.manifest.name,
              enabled: true,
              path: extDir
            };
            
            this.loadedExtensions.set(context.id, extensionData);
            return { success: true, extension: extensionData };
          } else {
            // Try as Chrome extension
            const extension = await session.defaultSession.loadExtension(extDir, {
              allowFileAccess: true
            });
            
            const extensionData: Extension = {
              id: extension.id,
              name: extension.name,
              enabled: true,
              path: extDir
            };
            
            this.loadedExtensions.set(extensionId, extensionData);
            return { success: true, extension: extensionData };
          }
        } catch (loadError) {
          console.error('Failed to load extension after extraction:', loadError);
          throw loadError;
        }
      } catch (error) {
        console.error('Error installing extension from store:', error);
        return { success: false, error: (error as Error).message };
      }
    });
  }

  private ensureExtensionsDirectory(): void {
    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true });
      // console.log('Created extensions directory');
    }
  }

  private async downloadExtension(extensionId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;
      
      https.get(url, (response) => {
        if (response.statusCode === 302 && response.headers.location) {
          // Follow redirect
          https.get(response.headers.location, (downloadResponse) => {
            const extensionPath = path.join(this.extensionsDir, `${extensionId}.crx`);
            const file = fs.createWriteStream(extensionPath);
            
            downloadResponse.pipe(file);
            
            file.on('finish', () => {
              file.close();
              resolve(extensionPath);
            });
          }).on('error', reject);
        } else {
          reject(new Error('Failed to download extension'));
        }
      }).on('error', reject);
    });
  }
} 