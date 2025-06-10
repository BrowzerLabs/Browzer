import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { AppManager } from '../main/AppManager';
import { WindowManager } from '../main/WindowManager';
import { ExtensionManager } from '../main/ExtensionManager';
import { AgentManager } from '../main/AgentManager';
import { MenuManager } from '../main/MenuManager';

// Set the application name early
app.setName('Browzer');
process.title = 'Browzer';

class BrowzerApp {
  private appManager: AppManager;
  private windowManager: WindowManager;
  private extensionManager: ExtensionManager;
  private agentManager: AgentManager;
  private menuManager: MenuManager;

  constructor() {
    this.appManager = new AppManager();
    this.windowManager = new WindowManager();
    this.extensionManager = new ExtensionManager();
    this.agentManager = new AgentManager();
    this.menuManager = new MenuManager();
  }

  async initialize(): Promise<void> {
    // Initialize all managers
    await this.appManager.initialize();
    await this.extensionManager.initialize();
    this.agentManager.initialize();
    this.menuManager.initialize();

    // Create the main window
    await this.windowManager.createMainWindow();
    
    // Load extensions
    await this.extensionManager.loadExtensions();
  }
}

// Handle app lifecycle
app.whenReady().then(async () => {
  try {
    const browzerApp = new BrowzerApp();
    await browzerApp.initialize();
  } catch (error) {
    console.error('Failed to initialize application:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const browzerApp = new BrowzerApp();
    await browzerApp.initialize();
  }
}); 