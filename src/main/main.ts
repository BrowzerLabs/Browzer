import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { AppManager } from '../main/AppManager';
import { WindowManager } from '../main/WindowManager';
import { ExtensionManager } from '../main/ExtensionManager';
import { AgentManager } from '../main/AgentManager';
import { MenuManager } from '../main/MenuManager';
import { LLMService, LLMRequest } from '../main/LLMService';
import { LLMLogger } from '../main/LLMLogger';

// Set the application name early
app.setName('Browzer');
process.title = 'Browzer';

class BrowzerApp {
  private appManager: AppManager;
  private windowManager: WindowManager;
  private extensionManager: ExtensionManager;
  private agentManager: AgentManager;
  private menuManager: MenuManager;
  private llmService: LLMService;

  constructor() {
    this.appManager = new AppManager();
    this.windowManager = new WindowManager();
    this.extensionManager = new ExtensionManager();
    this.agentManager = new AgentManager();
    this.menuManager = new MenuManager();
    this.llmService = new LLMService();
  }

  async initialize(): Promise<void> {
    // Set up IPC handlers
    this.setupIpcHandlers();
    
    // Initialize all managers
    await this.appManager.initialize();
    await this.extensionManager.initialize();
    
    // Create the main window first
    const mainWindow = await this.windowManager.createMainWindow();
    
    // Initialize agent manager with main window reference for workflow progress
    this.agentManager.initialize(mainWindow);
    this.menuManager.initialize();
    
    // Load extensions
    await this.extensionManager.loadExtensions();
  }

  private setupIpcHandlers(): void {
    // LLM API call handler
    ipcMain.handle('call-llm', async (event, request: LLMRequest) => {
      try {
        console.log('[Main] Handling LLM call for provider:', request.provider);
        const response = await this.llmService.callLLM(request);
        console.log('[Main] LLM call completed, success:', response.success);
        return response;
      } catch (error) {
        console.error('[Main] LLM call failed:', error);
        return {
          success: false,
          error: (error as Error).message
        };
      }
    });

    // LLM logging handlers
    ipcMain.handle('log-llm-request', async (event, logData) => {
      try {
        const logger = LLMLogger.getInstance();
        logger.logRequest(logData);
      } catch (error) {
        console.error('[Main] Failed to log LLM request:', error);
      }
    });

    ipcMain.handle('log-llm-response', async (event, logData) => {
      try {
        const logger = LLMLogger.getInstance();
        logger.logRequest(logData);
      } catch (error) {
        console.error('[Main] Failed to log LLM response:', error);
      }
    });

    console.log('[Main] IPC handlers set up for LLM service');
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