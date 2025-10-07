// ========================= IMPORTS =========================
import './styles.css';
import './recording-session-list.css';
import './recording.css';
import './components/ChatMessage.css';
import './components/ChatMessage';
import './components/ExecutionSteps.css';
import './components/ExecutionSteps';

// Services
import { BrowserService } from './services/BrowserService';
import { TabService } from './services/TabService';
import { WebviewService } from './services/WebviewService';
import { AgentService } from './services/AgentService';
import { ExtensionStore } from './services/ExtensionService';
import { RecordingService } from './services/RecordingService';
import { WorkflowService } from './services/WorkflowService';
import { MentionService } from './services/MentionService';
import { HistoryService } from './services/HistoryService';
import { AdBlockService } from './services/AdBlockService';
import { SettingsService } from './services/SettingsService';

// Types
import { IpcRenderer, WebpageContext } from './types';
import { McpClientManager } from './services/McpClientService';
import { DevToolsManager } from './components/DevToolsManager';
import { MemoryService } from './services/MemoryService';
import CONSTANTS from './constants';
import { Utils } from './utils';

// ========================= TYPES & INTERFACES =========================
interface AppState {
  isInitialized: boolean;
  homepageUrl: string;
}

// ========================= MAIN APPLICATION CLASS =========================
class BrowzerApp {
  // Core services
  private browserService: BrowserService;
  private tabService: TabService;
  private webviewService: WebviewService;
  private agentService: AgentService;
  private extensionStore: ExtensionStore;
  private recordingService: RecordingService;
  
  // New modular services
  private workflowService: WorkflowService;
  private mentionService: MentionService;
  private historyService: HistoryService;
  private adBlockService: AdBlockService;
  private settingsService: SettingsService;
  
  // External services
  private ipcRenderer: IpcRenderer;
  private state: AppState;
  private mcpManager: McpClientManager;
  private devToolsManager: DevToolsManager;
  public memoryService: MemoryService;
  
  public displayAgentResultsCalls: Array<{callNumber: number, timestamp: number, stackTrace: string, data: any}> = [];
  public executionFlow: Array<{timestamp: number, function: string, details: any}> = [];
  private selectedWebpageContexts: WebpageContext[] = [];

  constructor() {
    this.ipcRenderer = this.createIpcRenderer();
    this.state = {
      isInitialized: false,
      homepageUrl: localStorage.getItem(CONSTANTS.HOMEPAGE_KEY) || 'https://www.google.com'
    };

    // Initialize core services first
    this.tabService = new TabService()
    this.extensionStore = new ExtensionStore();
    this.historyService = new HistoryService(this.tabService);
    this.adBlockService = new AdBlockService(this.ipcRenderer);
    this.recordingService = new RecordingService();
    this.mcpManager = new McpClientManager();
    this.devToolsManager = new DevToolsManager();
    this.memoryService = new MemoryService();

    // Initialize new modular services
    this.workflowService = new WorkflowService(this.ipcRenderer);
    this.mentionService = new MentionService();
    this.settingsService = new SettingsService(this.tabService);
    this.browserService = new BrowserService(this.ipcRenderer, this.tabService, this.extensionStore);
    this.webviewService = new WebviewService(this.ipcRenderer, this.adBlockService, this.historyService);
    this.agentService = new AgentService(
        this.ipcRenderer, 
        this.tabService, 
        this.mcpManager, 
        this.memoryService, 
        this.workflowService,
        this.recordingService,
        this.selectedWebpageContexts
    );

    // Bind methods
    this.handleDOMContentLoaded = this.handleDOMContentLoaded.bind(this);
    this.handleGlobalError = this.handleGlobalError.bind(this);
  }

  private createIpcRenderer(): IpcRenderer {
    return {
      invoke: (channel: string, ...args: any[]) => window.electronAPI.ipcInvoke(channel, ...args),
      send: (channel: string, ...args: any[]) => window.electronAPI.ipcSend(channel, ...args),
      on: (channel: string, callback: (...args: any[]) => void) => window.electronAPI.ipcOn(channel, callback),
      off: (channel: string, callback: (...args: any[]) => void) => window.electronAPI.ipcOff(channel, callback),
      removeAllListeners: (channel: string) => window.electronAPI.removeAllListeners(channel)
    };
  }

  // ========================= INITIALIZATION =========================
  public async init(): Promise<void> {
    try {
      document.addEventListener('DOMContentLoaded', this.handleDOMContentLoaded);
      this.setupGlobalErrorHandler();
    } catch (error) {
      throw error;
    }
  }

  private async handleDOMContentLoaded(): Promise<void> {
    try {
      await this.initializeUI();
      await this.initializeServices();
      this.setupEventListeners();
      this.setupIpcListeners();
      this.setupWebviewEventListeners();

      this.workflowService.setupWorkflowEventListeners();
      this.adBlockService.setupAdBlocker();
      this.agentService.setupControls();
      await this.syncApiKeysWithBackend();

      await this.tabService.enhancedRestoreTabs();

      this.state.isInitialized = true;
    } catch (error) {
      console.error('[BrowzerApp] DOM initialization failed:', error);
    }
  }

  private async initializeUI(): Promise<void> {
    // Initialize UI elements
    this.tabService.initializeElements();
    this.browserService.initializeElements();
    this.webviewService.initializeElements();
    this.webviewService.initializeSidebar();
    this.devToolsManager.addDevToolsButton();
    this.devToolsManager.enableDevToolsForAllWebviews();
  }

  private async initializeServices(): Promise<void> {
    await this.recordingService.initialize();
    this.agentService.setupControls();
    this.extensionStore.initialize();
    
    this.workflowService.initialize();
    this.adBlockService.initialize();
    // SettingsService is already initialized in the constructor
    
    this.setupRecordingIntegration();
  }

  private async syncApiKeysWithBackend(): Promise<void> {
    try {
      const apiKeys = Utils.getBrowserApiKeys();
      const provider = 'anthropic';
      
      
      // Update API keys in ExtensionManager
      await this.ipcRenderer.invoke('update-browser-api-keys', apiKeys);
      
      // Update selected provider in ExtensionManager
      await this.ipcRenderer.invoke('update-selected-provider', provider);
    } catch (error) {
      console.error('[DEBUG] Failed to sync API keys with backend:', error);
    }
  }

  private setupRecordingIntegration(): void {
    window.addEventListener('recording:start', (e: Event) => {
      const sessionId = (e as CustomEvent).detail?.sessionId || 
        this.recordingService.getActiveSession()?.id || 'unknown';
      this.webviewService.notifyAllWebviews('start-recording', sessionId);
    });

    window.addEventListener('recording:stop', () => {
      this.webviewService.notifyAllWebviews('stop-recording');
    });

    window.addEventListener('show-toast', (e: Event) => {
      const customEvent = e as CustomEvent;
      const { message, type } = customEvent.detail;
      this.showToast(message, type);
    });

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'recording-event') {
        // Dispatch the event for the recording system to pick up
        const recordingEvent = new CustomEvent('recording:event', {
          detail: {
            type: e.data.eventType,
            timestamp: e.data.timestamp,
            data: e.data.eventData,
            context: { url: e.data.url }
          }
        });
        window.dispatchEvent(recordingEvent);
      }
    });
  }

  private updateContextVisualIndicators(): void {
    
    // Update UI to show selected contexts
    const chatInputArea = document.querySelector('.chat-input-area');
    if (!chatInputArea) {
      return;
    }
    
    // Remove existing context indicators
    const existingIndicators = document.querySelectorAll('.context-indicators');
    existingIndicators.forEach(indicator => indicator.remove());
    
    // Add context indicators directly attached to the chat input area
    if (this.selectedWebpageContexts.length > 0) {
      
      const contextContainer = document.createElement('div');
      contextContainer.className = 'context-indicators';
      
      this.selectedWebpageContexts.forEach(context => {
        const indicator = document.createElement('div');
        indicator.className = 'context-indicator';
        indicator.innerHTML = `
          <span class="context-title">${context.title}</span>
          <button class="context-remove" data-context-id="${context.id}">×</button>
        `;
        contextContainer.appendChild(indicator);
      });
      
      // Insert the context container right before the chat input area to create seamless connection
      chatInputArea.parentElement?.insertBefore(contextContainer, chatInputArea);
      
      // Add CSS class to chat input area to modify its styling when context is present
      chatInputArea.classList.add('has-context');
      
      // Add remove event listeners
      contextContainer.querySelectorAll('.context-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const contextId = (e.target as HTMLElement).dataset.contextId;
          if (contextId) {
            this.removeWebpageContext(contextId);
          }
        });
      });
    } else {
      // Remove the has-context class when no contexts
      chatInputArea.classList.remove('has-context');
    }
  }

  private removeWebpageContext(webpageId: string): void {
    this.selectedWebpageContexts = this.selectedWebpageContexts.filter(ctx => ctx.id !== webpageId);
    this.updateContextVisualIndicators();
  }

  private async getMcpToolsForAsk(): Promise<any[]> {
    if (!this.mcpManager) {
      return [];
    }
  
    try {
      const toolNames = await this.mcpManager.listAllTools();
      const tools = [];
      
      for (const toolName of toolNames) {
        const toolInfo = this.mcpManager.getToolInfo(toolName);
        if (toolInfo) {
          tools.push({
            name: toolName,
            description: toolInfo.description || '',
            inputSchema: toolInfo.inputSchema || {},
            serverName: toolInfo.serverName
          });
        }
      }
      return tools;
    } catch (error) {
      console.error('[MCP] Error getting MCP tools:', error);
      return [];
    }
  }

  // ========================= EVENT LISTENERS =========================
  private setupEventListeners(): void {
    this.setupNavigationListeners();
    this.setupTabListeners();
    this.setupKeyboardShortcuts();
  }

  private setupNavigationListeners(): void {
    this.browserService.onBackClick(() => {
      const webview = this.tabService.getActiveWebview();
      if (webview && this.webviewService.isWebviewReady(webview)) {
        try {
          if (webview.canGoBack()) {
            webview.goBack();
          }
        } catch (error) {
          console.log('[Navigation] Back navigation failed:', error);
        }
      }
    });

    this.browserService.onForwardClick(() => {
      const webview = this.tabService.getActiveWebview();
      if (webview && this.webviewService.isWebviewReady(webview)) {
        try {
          if (webview.canGoForward()) {
            webview.goForward();
          }
        } catch (error) {
          console.log('[Navigation] Forward navigation failed:', error);
        }
      }
    });

    this.browserService.onReloadClick(() => {
      const webview = this.tabService.getActiveWebview();
      if (webview) {
        webview.reload();
      }
    });

    this.browserService.onGoClick(() => {
      this.browserService.navigateToUrl();
    });

    this.browserService.onUrlEnter(() => {
      this.navigateToUrl();
    });

    this.browserService.onRunAgentClick(() => {
      this.agentService.execute();
    });

    this.browserService.onHistoryClick(() => {
      this.historyService.showHistoryPage();
    });

    this.browserService.onSettingsClick(async () => {
      await this.settingsService.showSettingsPage();
    });

    this.browserService.onExtensionsClick(() => {
      this.settingsService.showExtensionsPanel();
    });
  }

  private setupTabListeners(): void {
    this.tabService.onNewTab(() => {
      this.createNewTab();
    });

    this.tabService.onTabSelect((tabId: string) => {
      this.selectTab(tabId);
    });

    this.tabService.onTabClose((tabId: string) => {
      this.closeTab(tabId);
    });
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 't':
            e.preventDefault();
            this.createNewTab();
            break;
          case 'w':
            e.preventDefault();
            const activeTabId = this.tabService.getActiveTabId();
            if (activeTabId) {
              this.closeTab(activeTabId);
            }
            break;
          case 'l':
            e.preventDefault();
            this.browserService.focusUrlBar();
            break;
          case 'Tab':
            e.preventDefault();
            this.tabService.cycleTab(e.shiftKey ? -1 : 1);
            break;
        }
      }
    });
  }

  private setupIpcListeners(): void {
    this.ipcRenderer.on('menu-new-tab', () => {
      this.createNewTab();
    });

    this.ipcRenderer.on('menu-new-tab-with-url', (...args) => {
      let url = args[0];
      if (!url && args.length > 1) {
        url = args[1];
      }
      
      if (!url || url === 'undefined') {
        url = CONSTANTS.NEW_TAB_URL;
      }
      
      this.createNewTab(url);
    });

    this.ipcRenderer.on('menu-close-tab', () => {
      const activeTabId = this.tabService.getActiveTabId();
      if (activeTabId) {
        this.closeTab(activeTabId);
      }
    });

    this.ipcRenderer.on('menu-reload', () => {
      const webview = this.tabService.getActiveWebview();
      if (webview && this.webviewService.isWebviewReady(webview)) {
        try {
          webview.reload();
        } catch (error) {
          console.log('[IPC] Reload failed:', error);
        }
      }
    });

    this.ipcRenderer.on('menu-go-back', () => {
      const webview = this.tabService.getActiveWebview();
      if (webview && this.webviewService.isWebviewReady(webview)) {
        try {
          if (webview.canGoBack()) {
            webview.goBack();
          }
        } catch (error) {
          console.log('[IPC] Back navigation failed:', error);
        }
      }
    });

    this.ipcRenderer.on('menu-go-forward', () => {
      const webview = this.tabService.getActiveWebview();
      if (webview && this.webviewService.isWebviewReady(webview)) {
        try {
          if (webview.canGoForward()) {
            webview.goForward();
          }
        } catch (error) {
          console.log('[IPC] Forward navigation failed:', error);
        }
      }
    });

    this.ipcRenderer.on('menu-show-history', () => {
      this.historyService.showHistoryPage();
    });
  }

  // ========================= PUBLIC API METHODS =========================
  public createNewTab(url: string = CONSTANTS.NEW_TAB_URL): string | null {
    try {
      console.log('[BrowzerApp] createNewTab called with URL:', url);
      const tabId = this.tabService.createTab(url);
      if (tabId) {
        const webview = this.webviewService.createWebview(tabId, url);
        if (webview) {
          setTimeout(() => {
            this.recordingService.setupWebviewRecording(webview);
            this.setupWebviewTitleAndFaviconListeners(webview);
          }, 100);
          
          this.selectTab(tabId);
          return tabId;
        }
      }
      return tabId;
    } catch (error) {
      console.error('[BrowzerApp] Failed to create new tab:', error);
      return null;
    }
  }

  private setupWebviewEventListeners(): void {
    window.addEventListener('webview-title-updated', (e: any) => {
      const { webviewId, title } = e.detail;
      const webview = document.getElementById(webviewId) as any;
      if (webview) {
        this.tabService.updateTabTitle(webview, title);
      }
    });
  
    // Listen for webview favicon updates
    window.addEventListener('webview-favicon-updated', (e: any) => {
      const { webviewId, faviconUrl } = e.detail;
      const webview = document.getElementById(webviewId) as any;
      if (webview) {
        this.tabService.updateTabFavicon(webview, faviconUrl);
      }
    });
    
    // Listen for favicon not found event
    window.addEventListener('webview-favicon-not-found', (e: any) => {
      const { webviewId } = e.detail;
      const tabId = this.tabService.getTabIdFromWebviewId(webviewId);
      if (tabId) {
        this.tabService.setTabLoading(tabId, false);
        this.tabService.clearTabFavicon(tabId);
      }
    });
    
    // Listen for loading finished event to clear favicon timeouts
    window.addEventListener('webview-loading-finished', (e: any) => {
      const { webviewId } = e.detail;
      const tabId = this.tabService.getTabIdFromWebviewId(webviewId);
      if (tabId) {
        this.tabService.clearFaviconTimeout(tabId);
      }
    });
  
    // Listen for webview URL changes
    window.addEventListener('webview-url-changed', (e: any) => {
      const { webviewId, url } = e.detail;
      const tabId = this.tabService.getTabIdFromWebviewId(webviewId);
      if (tabId) {
        this.tabService.updateTabUrl(tabId, url);
      }
    });
  
    // Listen for webview navigation changes
    window.addEventListener('webview-navigation-changed', (e: any) => {
      this.browserService.updateNavigationButtons();
    });
  
    // Listen for new tab requests from webviews
    window.addEventListener('webview-new-tab', (e: any) => {
      const { url } = e.detail;
      console.log('[BrowzerApp] webview-new-tab event received, URL:', url);
      this.createNewTab(url);
    });
  }

  private setupWebviewTitleAndFaviconListeners(webview: any): void {
    try {
      webview.addEventListener('page-title-updated', (e: any) => {
        this.tabService.updateTabTitle(webview, e.title);
      });

      webview.addEventListener('page-favicon-updated', (e: any) => {
        if (e.favicons && e.favicons.length > 0) {
          const validFavicon = e.favicons.find((f: string) => f && f !== 'about:blank');
          if (validFavicon) {
            this.tabService.updateTabFavicon(webview, validFavicon);
          }
        }
      });

      webview.addEventListener('did-start-loading', () => {
        this.tabService.handleNavigationStart(webview.id);
      });

      webview.addEventListener('did-finish-load', async () => {
        try {
          const title = await webview.executeJavaScript('document.title');
          if (title) {
            this.tabService.updateTabTitle(webview, title);
          }
        } catch (error) {
          console.log('[BrowzerApp] Could not get title via executeJavaScript:', error);
        }
      });

      webview.addEventListener('did-navigate', (e: any) => {
        const tabId = this.tabService.getTabIdFromWebviewId(webview.id);
        if (tabId && e && e.url) {
          this.tabService.updateTabUrl(tabId, e.url);
        }
        this.browserService.updateNavigationButtons();
      });

      webview.addEventListener('did-navigate-in-page', (e: any) => {
        const tabId = this.tabService.getTabIdFromWebviewId(webview.id);
        if (tabId && e && e.url) {
          this.tabService.updateTabUrl(tabId, e.url);
        }
        this.browserService.updateNavigationButtons();
      });

    } catch (error) {
      console.error('[BrowzerApp] Error setting up webview listeners:', error);
    }
  }

  public selectTab(tabId: string): void {
    try {
      this.tabService.selectTab(tabId);
      this.browserService.updateNavigationButtons();
      this.tabService.saveTabs();
    } catch (error) {
      console.error('[BrowzerApp] Failed to select tab:', error);
    }
  }

  public closeTab(tabId: string): void {
    this.tabService.closeTab(tabId);
  }

  public navigateToUrl(): void {
    try {
      const url = this.browserService.getUrlBarValue();
      if (!url) return;

      if (url === 'file://browzer-store' || url === 'browzer-store') {
        this.extensionStore.show();
        return;
      }

      const processedUrl = this.browserService.processUrl(url);
      const webview = this.tabService.getActiveWebview();
      if (webview) {
        webview.loadURL(processedUrl);
      }
    } catch (error) {
      console.error('[BrowzerApp] Navigation failed:', error);
    }
  }
  
  // ========================= ERROR HANDLING =========================
  private setupGlobalErrorHandler(): void {
    window.addEventListener('error', this.handleGlobalError);
  }

  private handleGlobalError(event: ErrorEvent): void {
    console.error('Global error caught:', event.error);
    
    if (event.error && event.error.stack) {
      console.error('Error stack:', event.error.stack);
    }
    
    try {
      this.showToast('Error: ' + (event.error ? event.error.message : 'Unknown error'));
    } catch (e) {
      console.error('Could not show toast, error occurred before UI initialized:', e);
    }
  }

  // ========================= UTILITY METHODS =========================
  private showToast(message: string, type: string = 'info'): void {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
      toast!.className = 'toast';
    }, 3000);
  }

  public async testMcpIntegration(): Promise<any[]> {
    try {
      return await this.getMcpToolsForAsk();
    } catch (error) {
      console.error('❌ MCP Integration test failed:', error);
      return [];
    }
  }
  
  // ========================= PUBLIC API =========================
  public getPublicAPI() {
    return {
      // Core functionality
      createNewTab: this.createNewTab.bind(this),
      selectTab: this.selectTab.bind(this),
      closeTab: this.closeTab.bind(this),
      
      // Services
      tabService: this.tabService,
      webviewService: this.webviewService,
      browserService: this.browserService,
      agentService: this.agentService,
      extensionStore: this.extensionStore,
      recordingService: this.recordingService,
      workflowService: this.workflowService,
      mentionService: this.mentionService,
      historyService: this.historyService,
      adBlockService: this.adBlockService,
      memoryService: this.memoryService,
      mcpManager: this.mcpManager,

      tabs: this.tabService.getAllTabs(),
      activeTabId: this.tabService.getActiveTabId(),
      getActiveWebview: () => this.tabService.getActiveWebview(),
      navigateToUrl: this.navigateToUrl.bind(this),
      executeAgent: () => this.agentService.execute(),
      showExtensionStore: () => this.extensionStore.show(),
      testMcpIntegration: this.testMcpIntegration.bind(this),

      // Utilities
      showToast: this.showToast.bind(this),
      getState: () => ({ ...this.state })
    };
  }
  // ========================= CLEANUP =========================
  public destroy(): void {
    try {
      document.removeEventListener('DOMContentLoaded', this.handleDOMContentLoaded);
      window.removeEventListener('error', this.handleGlobalError);
      
      // Cleanup core services
      this.recordingService.destroy();
      this.agentService.destroy();
      this.extensionStore.destroy();
      this.tabService.destroy();
      this.webviewService.destroy();
      this.browserService.destroy();
      
      // Cleanup new modular services
      this.workflowService.destroy();
      this.mentionService.destroy();
      this.adBlockService.destroy();
      
      this.state.isInitialized = false;
    } catch (error) {
      console.error('[BrowzerApp] Cleanup failed:', error);
    }
  }
}

// ========================= APPLICATION BOOTSTRAP =========================
let browzerApp: BrowzerApp;

const initializeApplication = async () => {
  try {
    browzerApp = new BrowzerApp();
    await browzerApp.init();
    
    (window as any).browzerApp = browzerApp.getPublicAPI();
  } catch (error) {
    console.error('[Bootstrap] Failed to initialize Browzer application:', error);
    
    document.body.innerHTML = `
      <div style="padding: 20px; color: red; font-family: Arial, sans-serif;">
        <h1>Application Failed to Initialize</h1>
        <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p>Please refresh the page or contact support if the problem persists.</p>
      </div>
    `;
  }
};

initializeApplication();

window.addEventListener('beforeunload', () => {
  if (browzerApp) {
    browzerApp.destroy();
  }
});

export { BrowzerApp };
export default () => browzerApp;