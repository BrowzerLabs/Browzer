import { ExtensionContext, ExtensionError, ExtensionErrorCode } from '../types';
import { ExtensionLogger } from '../ExtensionLogger';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Handler for Web Extensions (Chrome/Firefox compatible)
 * Manages content scripts, background scripts, and web APIs
 */
export class WebExtensionHandler {
  private logger: ExtensionLogger;
  private loadedContentScripts = new Map<string, ContentScriptInfo[]>();
  private backgroundScripts = new Map<string, BackgroundScriptInfo>();
  private webviewSessions = new Map<string, Electron.Session>();

  constructor() {
    this.logger = new ExtensionLogger('WebExtensionHandler');
  }

  /**
   * Initialize a web extension
   */
  async initialize(context: ExtensionContext): Promise<void> {
    try {
      this.logger.info(`Initializing web extension: ${context.manifest.name}`);

      // Validate web extension structure
      await this.validateWebExtension(context);

      // Load background scripts if present
      if (context.manifest.background) {
        await this.loadBackgroundScripts(context);
      }

      // Register content scripts
      if (context.manifest.contentScripts) {
        await this.registerContentScripts(context);
      }

      // Set up web accessible resources
      if (context.manifest.webAccessibleResources) {
        await this.setupWebAccessibleResources(context);
      }

      // Register browser APIs
      await this.registerBrowserAPIs(context);

      this.logger.info(`Web extension ${context.manifest.name} initialized successfully`);
    } catch (error) {
      this.logger.error(`Failed to initialize web extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Enable a web extension
   */
  async enable(context: ExtensionContext): Promise<void> {
    try {
      this.logger.info(`Enabling web extension: ${context.manifest.name}`);

      // Start background scripts
      const backgroundInfo = this.backgroundScripts.get(context.id);
      if (backgroundInfo && !backgroundInfo.isRunning) {
        await this.startBackgroundScript(context, backgroundInfo);
      }

      // Enable content script injection
      const contentScripts = this.loadedContentScripts.get(context.id);
      if (contentScripts) {
        await this.enableContentScriptInjection(context, contentScripts);
      }

      this.logger.info(`Web extension ${context.manifest.name} enabled`);
    } catch (error) {
      this.logger.error(`Failed to enable web extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Disable a web extension
   */
  async disable(context: ExtensionContext): Promise<void> {
    try {
      this.logger.info(`Disabling web extension: ${context.manifest.name}`);

      // Stop background scripts
      const backgroundInfo = this.backgroundScripts.get(context.id);
      if (backgroundInfo && backgroundInfo.isRunning) {
        await this.stopBackgroundScript(context, backgroundInfo);
      }

      // Disable content script injection
      await this.disableContentScriptInjection(context);

      this.logger.info(`Web extension ${context.manifest.name} disabled`);
    } catch (error) {
      this.logger.error(`Failed to disable web extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Cleanup and unload a web extension
   */
  async cleanup(context: ExtensionContext): Promise<void> {
    try {
      this.logger.info(`Cleaning up web extension: ${context.manifest.name}`);

      // Disable first
      await this.disable(context);

      // Clean up background scripts
      this.backgroundScripts.delete(context.id);

      // Clean up content scripts
      this.loadedContentScripts.delete(context.id);

      // Clean up webview sessions
      const session = this.webviewSessions.get(context.id);
      if (session) {
        // Clean up session resources
        this.webviewSessions.delete(context.id);
      }

      this.logger.info(`Web extension ${context.manifest.name} cleaned up`);
    } catch (error) {
      this.logger.error(`Failed to cleanup web extension ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  /**
   * Execute a web extension action
   */
  async executeAction(context: ExtensionContext, action: string, data: any): Promise<any> {
    try {
      this.logger.info(`Executing web extension action: ${action} for ${context.manifest.name}`);

      switch (action) {
        case 'inject-content-script':
          return await this.injectContentScript(context, data);
        case 'send-message':
          return await this.sendMessage(context, data);
        case 'update-badge':
          return await this.updateBadge(context, data);
        case 'create-context-menu':
          return await this.createContextMenu(context, data);
        default:
          throw new ExtensionError(
            `Unknown web extension action: ${action}`,
            ExtensionErrorCode.RUNTIME_ERROR,
            context.id
          );
      }
    } catch (error) {
      this.logger.error(`Failed to execute web extension action ${action}`, error as Error);
      throw error;
    }
  }

  private async validateWebExtension(context: ExtensionContext): Promise<void> {
    // Check if main file exists (background script or entry point)
    if (context.manifest.main) {
      const mainPath = path.join(context.path, context.manifest.main);
      try {
        await fs.access(mainPath);
      } catch (error) {
        throw new ExtensionError(
          `Main file not found: ${context.manifest.main}`,
          ExtensionErrorCode.INVALID_MANIFEST,
          context.id
        );
      }
    }

    // Validate content scripts files exist
    if (context.manifest.contentScripts) {
      for (const contentScript of context.manifest.contentScripts) {
        if (contentScript.js) {
          for (const jsFile of contentScript.js) {
            const jsPath = path.join(context.path, jsFile);
            try {
              await fs.access(jsPath);
            } catch (error) {
              throw new ExtensionError(
                `Content script file not found: ${jsFile}`,
                ExtensionErrorCode.INVALID_MANIFEST,
                context.id
              );
            }
          }
        }
      }
    }
  }

  private async loadBackgroundScripts(context: ExtensionContext): Promise<void> {
    if (!context.manifest.background) return;

    const backgroundInfo: BackgroundScriptInfo = {
      scripts: context.manifest.background.scripts || [],
      page: context.manifest.background.page,
      persistent: context.manifest.background.persistent !== false,
      isRunning: false,
      process: null
    };

    // If background page is specified, use it
    if (backgroundInfo.page) {
      const pagePath = path.join(context.path, backgroundInfo.page);
      try {
        await fs.access(pagePath);
        backgroundInfo.mainScript = pagePath;
      } catch (error) {
        throw new ExtensionError(
          `Background page not found: ${backgroundInfo.page}`,
          ExtensionErrorCode.INVALID_MANIFEST,
          context.id
        );
      }
    } else if (backgroundInfo.scripts.length > 0) {
      // Use the first script as main
      backgroundInfo.mainScript = path.join(context.path, backgroundInfo.scripts[0]);
    }

    this.backgroundScripts.set(context.id, backgroundInfo);
  }

  private async registerContentScripts(context: ExtensionContext): Promise<void> {
    if (!context.manifest.contentScripts) return;

    const contentScripts: ContentScriptInfo[] = [];

    for (const scriptConfig of context.manifest.contentScripts) {
      const contentScript: ContentScriptInfo = {
        matches: scriptConfig.matches,
        js: scriptConfig.js || [],
        css: scriptConfig.css || [],
        runAt: scriptConfig.run_at || 'document_end',
        allFrames: scriptConfig.all_frames || false,
        includeGlobs: scriptConfig.include_globs,
        excludeGlobs: scriptConfig.exclude_globs,
        excludeMatches: scriptConfig.exclude_matches,
        isEnabled: false
      };

      // Validate script files exist
      for (const jsFile of contentScript.js) {
        const jsPath = path.join(context.path, jsFile);
        try {
          await fs.access(jsPath);
        } catch (error) {
          throw new ExtensionError(
            `Content script file not found: ${jsFile}`,
            ExtensionErrorCode.INVALID_MANIFEST,
            context.id
          );
        }
      }

      contentScripts.push(contentScript);
    }

    this.loadedContentScripts.set(context.id, contentScripts);
  }

  private async setupWebAccessibleResources(context: ExtensionContext): Promise<void> {
    // Set up serving of web accessible resources
    // This would integrate with the browser's resource serving mechanism
    this.logger.info(`Setting up web accessible resources for ${context.manifest.name}`);
  }

  private async registerBrowserAPIs(context: ExtensionContext): Promise<void> {
    // Register browser APIs based on permissions
    const apis = [];

    if (context.permissions.includes('tabs' as any)) {
      apis.push('tabs');
    }
    if (context.permissions.includes('storage' as any)) {
      apis.push('storage');
    }
    if (context.permissions.includes('activeTab' as any)) {
      apis.push('activeTab');
    }

    // Register APIs with the extension context
    this.logger.info(`Registered browser APIs for ${context.manifest.name}: ${apis.join(', ')}`);
  }

  private async startBackgroundScript(context: ExtensionContext, backgroundInfo: BackgroundScriptInfo): Promise<void> {
    if (!backgroundInfo.mainScript) return;

    try {
      // Create a sandboxed execution environment for the background script
      // This would typically use Node.js VM or similar sandboxing
      this.logger.info(`Starting background script for ${context.manifest.name}`);
      
      backgroundInfo.isRunning = true;
      
      // In a real implementation, this would start the background script in a sandboxed environment
      // For now, we'll mark it as running
      this.logger.info(`Background script started for ${context.manifest.name}`);
    } catch (error) {
      this.logger.error(`Failed to start background script for ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  private async stopBackgroundScript(context: ExtensionContext, backgroundInfo: BackgroundScriptInfo): Promise<void> {
    try {
      this.logger.info(`Stopping background script for ${context.manifest.name}`);
      
      if (backgroundInfo.process) {
        backgroundInfo.process = null;
      }
      
      backgroundInfo.isRunning = false;
      
      this.logger.info(`Background script stopped for ${context.manifest.name}`);
    } catch (error) {
      this.logger.error(`Failed to stop background script for ${context.manifest.name}`, error as Error);
      throw error;
    }
  }

  private async enableContentScriptInjection(context: ExtensionContext, contentScripts: ContentScriptInfo[]): Promise<void> {
    for (const contentScript of contentScripts) {
      contentScript.isEnabled = true;
      
      // Set up webview injection for matching URLs
      // This would integrate with the browser's webview management
      this.logger.info(`Enabled content script injection for ${context.manifest.name}: ${contentScript.matches.join(', ')}`);
    }
  }

  private async disableContentScriptInjection(context: ExtensionContext): Promise<void> {
    const contentScripts = this.loadedContentScripts.get(context.id);
    if (!contentScripts) return;

    for (const contentScript of contentScripts) {
      contentScript.isEnabled = false;
    }

    this.logger.info(`Disabled content script injection for ${context.manifest.name}`);
  }

  private async injectContentScript(context: ExtensionContext, data: any): Promise<any> {
    // Implement content script injection into specific webview
    this.logger.info(`Injecting content script for ${context.manifest.name}`);
    return { success: true, message: 'Content script injected' };
  }

  private async sendMessage(context: ExtensionContext, data: any): Promise<any> {
    // Implement message passing between extension components
    this.logger.info(`Sending message from ${context.manifest.name}`);
    return { success: true, response: data };
  }

  private async updateBadge(context: ExtensionContext, data: any): Promise<any> {
    // Implement browser action badge update
    this.logger.info(`Updating badge for ${context.manifest.name}: ${data.text}`);
    return { success: true };
  }

  private async createContextMenu(context: ExtensionContext, data: any): Promise<any> {
    // Implement context menu creation
    this.logger.info(`Creating context menu for ${context.manifest.name}`);
    return { success: true, menuId: `menu-${Date.now()}` };
  }
}

// Supporting interfaces
interface BackgroundScriptInfo {
  scripts: string[];
  page?: string;
  persistent: boolean;
  isRunning: boolean;
  process: any;
  mainScript?: string;
}

interface ContentScriptInfo {
  matches: string[];
  js: string[];
  css: string[];
  runAt: 'document_start' | 'document_end' | 'document_idle';
  allFrames: boolean;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  excludeMatches?: string[];
  isEnabled: boolean;
} 