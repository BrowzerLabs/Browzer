import { BrowserWindow, shell, Menu, app, clipboard } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC_CHANNELS } from '../shared/types';

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private onboardingWindow: BrowserWindow | null = null;
  private isCreatingMainWindow: boolean = false;

  async createMainWindow(): Promise<BrowserWindow> {
    // Check if this is the first run
    const isFirstRun = await this.checkFirstRun();
    
    if (isFirstRun) {
      // Show onboarding first
      await this.createOnboardingWindow();
      return this.onboardingWindow!;
    }
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Browzer',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true, // Enable context isolation for security and contextBridge
        webviewTag: true,
        webSecurity: true,
        preload: path.join(__dirname, '../preload/preload.js') // Fixed path: dist/src/main -> dist/src/preload
      }
    });

    // Enable DevTools for the main window in development
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      this.mainWindow.webContents.openDevTools();
    }

    // Load the main HTML file
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    await this.mainWindow.loadFile(htmlPath);

    // Setup event handlers
    this.setupWindowEventHandlers();
    this.setupDevToolsShortcuts();

    return this.mainWindow;
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  async createOnboardingWindow(): Promise<BrowserWindow> {
    this.onboardingWindow = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Welcome to Browzer',
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        preload: path.join(__dirname, '../preload/preload.js')
      }
    });

    // Load the onboarding HTML file
    const onboardingPath = path.join(__dirname, '../../renderer/onboarding.html');
    await this.onboardingWindow.loadFile(onboardingPath);

    // Setup onboarding event handlers
    this.setupOnboardingHandlers();

    return this.onboardingWindow;
  }

  private async checkFirstRun(): Promise<boolean> {
    try {
      const userDataPath = app.getPath('userData');
      const firstRunFile = path.join(userDataPath, '.browzer-first-run');
      
      // Check if first run file exists
      if (fs.existsSync(firstRunFile)) {
        return false; // Not first run
      }
      
      // Also check localStorage equivalent (settings file)
      const settingsFile = path.join(userDataPath, 'settings.json');
      if (fs.existsSync(settingsFile)) {
        try {
          const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
          return !settings.onboarding_completed;
        } catch (error) {
          console.warn('Failed to read settings file:', error);
        }
      }
      
      return true; // First run
    } catch (error) {
      console.error('Error checking first run:', error);
      return false; // Default to not showing onboarding on error
    }
  }

  private markFirstRunComplete(): void {
    try {
      const userDataPath = app.getPath('userData');
      const firstRunFile = path.join(userDataPath, '.browzer-first-run');
      
      // Create first run marker file
      fs.writeFileSync(firstRunFile, new Date().toISOString());
      
      // Also update settings file
      const settingsFile = path.join(userDataPath, 'settings.json');
      let settings = {};
      
      if (fs.existsSync(settingsFile)) {
        try {
          settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        } catch (error) {
          console.warn('Failed to read existing settings:', error);
        }
      }
      
      (settings as any).onboarding_completed = true;
      (settings as any).onboarding_completed_at = new Date().toISOString();
      
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
      
      // console.log('✅ First run marked as complete');
    } catch (error) {
      console.error('Failed to mark first run complete:', error);
    }
  }

  private setupOnboardingHandlers(): void {
    if (!this.onboardingWindow) return;

    // Onboarding IPC handlers are set up in main.ts, not here
    // The main.ts handlers will call the appropriate WindowManager methods

    // Handle window close
    this.onboardingWindow.on('closed', () => {
      this.onboardingWindow = null;
    });
  }

  async handleOnboardingComplete(data: any): Promise<void> {
    // // console.log('🎉 Onboarding completed:', data);
    
    // Mark first run as complete
    this.markFirstRunComplete();
    
    // Save any user preferences
    if (data && data.preferences) {
      await this.saveOnboardingPreferences(data.preferences);
    }
    
    // Close onboarding and create main window
    setTimeout(() => {
      this.handleCloseOnboarding();
    }, 1000);
  }

  async handleCloseOnboarding(): Promise<void> {
    // // console.log('🔄 handleCloseOnboarding called');
    
    // Prevent double creation
    if (this.isCreatingMainWindow) {
      // // console.log('⚠️ Main window creation already in progress, skipping...');
      return;
    }
    
    if (this.mainWindow) {
      // // console.log('⚠️ Main window already exists, skipping creation...');
      return;
    }
    
    if (this.onboardingWindow) {
      // // console.log('🗑️ Closing onboarding window');
      this.onboardingWindow.close();
      this.onboardingWindow = null;
    }
    
    // Create the main browser window
    // // console.log('🚀 Creating main browser window...');
    this.isCreatingMainWindow = true;
    
    try {
      const mainWindow = await this.createMainBrowserWindow();
      // // console.log('✅ Main browser window created successfully:', !!mainWindow);
    } catch (error) {
      console.error('❌ Failed to create main browser window:', error);
    } finally {
      this.isCreatingMainWindow = false;
    }
  }

  private async handleSaveApiKey(data: { provider: string; key: string }): Promise<void> {
    try {
      const userDataPath = app.getPath('userData');
      const apiKeysFile = path.join(userDataPath, 'api-keys.json');
      
      let apiKeys = {};
      if (fs.existsSync(apiKeysFile)) {
        try {
          apiKeys = JSON.parse(fs.readFileSync(apiKeysFile, 'utf8'));
        } catch (error) {
          console.warn('Failed to read existing API keys:', error);
        }
      }
      
      (apiKeys as any)[data.provider] = data.key;
      fs.writeFileSync(apiKeysFile, JSON.stringify(apiKeys, null, 2));
      
      // console.log(`✅ API key saved for ${data.provider}`);
    } catch (error) {
      console.error('Failed to save API key:', error);
    }
  }

  private handleOpenSettings(): void {
    // This will be handled after main window is created
    // console.log('📋 Settings requested from onboarding');
  }

  private async saveOnboardingPreferences(preferences: any): Promise<void> {
    try {
      const userDataPath = app.getPath('userData');
      const preferencesFile = path.join(userDataPath, 'onboarding-preferences.json');
      
      fs.writeFileSync(preferencesFile, JSON.stringify(preferences, null, 2));
      // console.log('✅ Onboarding preferences saved');
    } catch (error) {
      console.error('Failed to save onboarding preferences:', error);
    }
  }

  private async createMainBrowserWindow(): Promise<BrowserWindow> {
    // // console.log('🏗️ Creating new BrowserWindow...');
    
    const preloadPath = path.join(__dirname, '../preload/preload.js');
    // // console.log('🔧 Preload path:', preloadPath);
    // // console.log('📁 __dirname:', __dirname);
    
    // Check if preload file exists
    if (!fs.existsSync(preloadPath)) {
      console.error('❌ Preload file does not exist at:', preloadPath);
    } else {
      // // console.log('✅ Preload file exists');
    }
    
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      title: 'Browzer',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        webviewTag: true,
        webSecurity: true,
        preload: preloadPath
      }
    });

    // // console.log('📱 BrowserWindow created, loading HTML...');

    // Enable DevTools for the main window in development
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      this.mainWindow.webContents.openDevTools();
    }

    // Load the main HTML file
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    // // console.log('📄 Loading HTML from:', htmlPath);
    
    try {
      await this.mainWindow.loadFile(htmlPath);
      // // console.log('✅ HTML loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load HTML:', error);
      throw error;
    }

    // Setup event handlers
    this.setupWindowEventHandlers();
    this.setupDevToolsShortcuts();

    // // console.log('🎯 Main window setup complete');
    return this.mainWindow;
  }

  private setupWindowEventHandlers(): void {
    if (!this.mainWindow) return;

    // Handle renderer process gone
    this.mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('Renderer process gone:', details.reason);
      this.logCrash(`Renderer process gone: ${details.reason}`);
    });

    // Handle unresponsive window
    this.mainWindow.on('unresponsive', () => {
      console.error('Browser window is unresponsive');
      this.logCrash('Browser window became unresponsive');
    });

    // Handle external links
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://chrome.google.com/webstore')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    // Setup context menu handling for webviews
    this.setupContextMenuHandling();
  }

  private logCrash(message: string): void {
    const timestamp = new Date().toISOString();
    const logPath = path.join(__dirname, '../../crash-log.txt');
    try {
      fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
    } catch (error) {
      console.error('Failed to write crash log:', error);
    }
  }

  private setupDevToolsShortcuts(): void {
    if (!this.mainWindow) return;

    // Register global shortcuts for DevTools
    this.mainWindow.webContents.on('before-input-event', (event, input) => {
      // F12 key
      if (input.key === 'F12') {
        event.preventDefault();
        this.mainWindow!.webContents.toggleDevTools();
      }
      
      // Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (Mac)
      if ((input.control || input.meta) && input.shift && input.key === 'I') {
        event.preventDefault();
        this.mainWindow!.webContents.toggleDevTools();
      }
      
      // Ctrl+Shift+J (Windows/Linux) or Cmd+Option+J (Mac) - Console
      if ((input.control || input.meta) && input.shift && input.key === 'J') {
        event.preventDefault();
        this.mainWindow!.webContents.openDevTools({ mode: 'detach' });
      }
    });

    // console.log('DevTools shortcuts registered for main window');
  }

  private setupContextMenuHandling(): void {
    if (!this.mainWindow) return;

    // Listen for context menu events from all webContents (including webviews)
    app.on('web-contents-created', (event, webContents) => {
      webContents.on('context-menu', (event, params) => {
        // Create context menu based on what was right-clicked
        const menuTemplate = [];

        // Navigation items
        if (params.linkURL) {
          menuTemplate.push(
            { 
              label: 'Open Link', 
              click: () => {
                // Navigate current webview to the link
                webContents.loadURL(params.linkURL);
              }
            },
            { 
              label: 'Open Link in New Tab', 
              click: () => {
                // Send IPC message to create new tab with URL
                if (this.mainWindow) {
                  this.mainWindow.webContents.send(IPC_CHANNELS.MENU_NEW_TAB_WITH_URL, params.linkURL);
                }
              }
            },
            { label: 'Copy Link Address', click: () => this.copyToClipboard(params.linkURL) },
            { type: 'separator' }
          );
        }

        // Edit items (if text is selected or in input field)
        if (params.isEditable || params.selectionText) {
          if (params.isEditable) {
            menuTemplate.push(
              { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
              { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
              { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
              { type: 'separator' }
            );
          } else if (params.selectionText) {
            menuTemplate.push(
              { label: 'Copy', role: 'copy' },
              { type: 'separator' }
            );
          }
        }

        // Page items
        menuTemplate.push(
          { label: 'Back', click: () => webContents.goBack(), enabled: webContents.canGoBack() },
          { label: 'Forward', click: () => webContents.goForward(), enabled: webContents.canGoForward() },
          { label: 'Reload', click: () => webContents.reload() },
          { type: 'separator' }
        );

        // Image items
        if (params.hasImageContents) {
          menuTemplate.push(
            { label: 'Copy Image', click: () => webContents.copyImageAt(params.x, params.y) },
            { label: 'Copy Image Address', click: () => this.copyToClipboard(params.srcURL) },
            { type: 'separator' }
          );
        }

        // Developer items
        menuTemplate.push(
          { label: 'Inspect Element', click: () => webContents.inspectElement(params.x, params.y) },
          { label: 'View Page Source', click: () => this.viewPageSource(webContents) }
        );

        // Only show menu if there are items
        if (menuTemplate.length > 0) {
          const contextMenu = Menu.buildFromTemplate(menuTemplate as any);
          contextMenu.popup({ window: this.mainWindow! });
        }
      });
    });
  }

  private copyToClipboard(text: string): void {
    clipboard.writeText(text);
  }

  private viewPageSource(webContents: Electron.WebContents): void {
    webContents.executeJavaScript('document.documentElement.outerHTML').then((html) => {
      // Create a new window to show the page source
      const sourceWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: 'Page Source',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page Source</title>
          <style>
            body { font-family: monospace; white-space: pre-wrap; padding: 10px; }
          </style>
        </head>
        <body>${this.escapeHtml(html)}</body>
        </html>
      `;

      sourceWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    }).catch(console.error);
  }

  private escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
} 