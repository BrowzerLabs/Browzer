// Set the application name first, before any other imports or operations
const { app } = require('electron');

// Set multiple name properties aggressively
app.setName('Browzer');
process.title = 'Browzer';

// Set additional name properties for comprehensive coverage
if (process.platform === 'darwin') {
  app.dock?.setIcon(null); // This can help refresh the dock name
  
  // Try to set the bundle identifier
  try {
    app.setAppUserModelId('com.browzer.app');
  } catch (e) {
    console.log('Could not set app user model ID');
  }
}

const { BrowserWindow, session, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { URL } = require('url');
const { spawn } = require('child_process');

const os = require('os');
const logFile = path.join(__dirname, 'agent_debug.log');

const rendererLogFile = path.join(__dirname, 'renderer_agent.log');

ipcMain.on('renderer-log', (event, message) => {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(rendererLogFile, `[${timestamp}] ${message}\n`);
});

function logAgentEvent(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

// Helper function to clean query string
function cleanQueryString(query) {
  // Extract search term from Google URLs
  if (query.includes('google.com/search')) {
    try {
      const urlObj = new URL(query);
      const searchQuery = urlObj.searchParams.get('q');
      if (searchQuery) {
        console.log(`Extracted search query from URL: ${searchQuery}`);
        return searchQuery;
      }
    } catch (err) {
      console.error('Error extracting search query:', err);
    }
  }
  
  // Truncate very long queries
  if (query.length > 500) {
    console.log(`Truncating long query: ${query.length} chars`);
    return query.substring(0, 500);
  }
  
  return query;
}

// Store loaded extensions
let loadedExtensions = new Map();

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Browzer',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            webSecurity: true
        }
    });

    // Set proper user agent for Chrome Web Store
    session.defaultSession.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Load the main HTML file
    mainWindow.loadFile('index.html');

    // Load extensions from the extensions directory
    loadExtensions();

    // Handle renderer process crashes
    mainWindow.webContents.on('crashed', (event, killed) => {
        console.error('Renderer process crashed:', killed ? 'killed' : 'crashed');
        fs.appendFileSync(path.join(__dirname, 'crash-log.txt'), 
            `[${new Date().toISOString()}] Renderer process ${killed ? 'killed' : 'crashed'}\n`);
    });

    // Handle renderer process gone
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        console.error('Renderer process gone:', details.reason);
        fs.appendFileSync(path.join(__dirname, 'crash-log.txt'), 
            `[${new Date().toISOString()}] Renderer process gone: ${details.reason}\n`);
    });

    // Handle unresponsive
    mainWindow.on('unresponsive', () => {
        console.error('Browser window is unresponsive');
        fs.appendFileSync(path.join(__dirname, 'crash-log.txt'), 
            `[${new Date().toISOString()}] Browser window became unresponsive\n`);
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://chrome.google.com/webstore')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });
}

// Function to download extension from Chrome Web Store
async function downloadExtension(extensionId) {
    return new Promise((resolve, reject) => {
        const url = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&x=id%3D${extensionId}%26uc`;
        
        https.get(url, (response) => {
            if (response.statusCode === 302) {
                // Follow redirect
                https.get(response.headers.location, (downloadResponse) => {
                    const extensionPath = path.join(__dirname, 'extensions', `${extensionId}.crx`);
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

// Handle extension installation from Chrome Web Store
ipcMain.handle('install-from-store', async (event, extensionId) => {
    try {
        const extensionPath = await downloadExtension(extensionId);
        const extension = await session.defaultSession.loadExtension(extensionPath);
        loadedExtensions.set(extension.id, extension);
        return { success: true, extension };
    } catch (err) {
        console.error('Failed to install extension from store:', err);
        return { success: false, error: err.message };
    }
});

async function loadExtensions() {
    const extensionsDir = path.join(__dirname, 'extensions');
    
    if (!fs.existsSync(extensionsDir)) {
        fs.mkdirSync(extensionsDir);
        console.log('Created extensions directory');
        return;
    }

    try {
        const extensions = fs.readdirSync(extensionsDir);
        
        if (extensions.length === 0) {
            console.log('No extensions found in directory');
            return;
        }

        for (const ext of extensions) {
            const extPath = path.join(extensionsDir, ext);
            if (fs.statSync(extPath).isDirectory()) {
                try {
                    const extension = await session.defaultSession.loadExtension(extPath, {
                        allowFileAccess: true,
                        allowServiceWorkers: true
                    });
                    loadedExtensions.set(extension.id, extension);
                    console.log(`Loaded extension: ${extension.name}`);
                } catch (err) {
                    console.error(`Failed to load extension ${ext}:`, err);
                }
            }
        }
    } catch (err) {
        console.error('Error loading extensions:', err);
    }
}

// Handle extension installation
ipcMain.handle('install-extension', async (event, extensionPath) => {
    try {
        const extension = await session.defaultSession.loadExtension(extensionPath, {
            allowFileAccess: true,
            allowServiceWorkers: true
        });
        loadedExtensions.set(extension.id, extension);
        return { success: true, extension };
    } catch (err) {
        console.error('Failed to install extension:', err);
        return { success: false, error: err.message };
    }
});

// Handle extension removal
ipcMain.handle('remove-extension', async (event, extensionId) => {
    try {
        const extension = loadedExtensions.get(extensionId);
        if (extension) {
            await session.defaultSession.removeExtension(extensionId);
            loadedExtensions.delete(extensionId);
            return { success: true };
        }
        return { success: false, error: 'Extension not found' };
    } catch (err) {
        console.error('Failed to remove extension:', err);
        return { success: false, error: err.message };
    }
});

// Get list of installed extensions
ipcMain.handle('get-extensions', () => {
    return Array.from(loadedExtensions.values()).map(ext => ({
        id: ext.id,
        name: ext.name
    }));
});

// Enable developer mode for extensions
ipcMain.handle('enable-developer-mode', async () => {
    try {
        await session.defaultSession.setPreloads([path.join(__dirname, 'preload.js')]);
        return { success: true };
    } catch (err) {
        console.error('Failed to enable developer mode:', err);
        return { success: false, error: err.message };
    }
});

// Check if IPC handler for execute-agent exists
// If it doesn't, add it. If it does, replace it with this more robust version
ipcMain.handle('execute-agent', async (event, { agentPath, agentParams }) => {
  console.log(`IPC: execute-agent received with path=${agentPath} params=`, agentParams);
  
  // Verify sender is still valid (may help with the disposed frame issue)
  if (!event.sender || event.sender.isDestroyed()) {
    console.error('The sender webContents was destroyed');
    return { success: false, error: 'The sender webContents was destroyed' };
  }
  
  // Get query from params
  const query = agentParams.query || '';
  
  // Clean up the query
  const cleanedQuery = cleanQueryString(query);
  console.log(`Using cleaned query: ${cleanedQuery}`);
  
  // Log to a file to ensure we can track execution
  fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
    `[${new Date().toISOString()}] Executing: ${agentPath} with params: ${JSON.stringify(agentParams)}\n`);
  
  try {
    // Platform check for python path
    let pythonPath;
    if (os.platform() === 'win32') {
      pythonPath = path.join(__dirname, 'agents', 'venv', 'Scripts', 'python.exe');
    } else {
      pythonPath = path.join(__dirname, 'agents', 'venv', 'bin', 'python');
    }
    
    // Check if Python path exists
    if (!fs.existsSync(pythonPath)) {
      console.error(`Python executable not found at: ${pythonPath}`);
      fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
        `[${new Date().toISOString()}] ERROR: Python executable not found at: ${pythonPath}\n`);
      
      // Try falling back to system Python
      pythonPath = os.platform() === 'win32' ? 'python.exe' : 'python3';
      console.log(`Falling back to system Python: ${pythonPath}`);
      fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
        `[${new Date().toISOString()}] Falling back to system Python: ${pythonPath}\n`);
    }
    
    // Check if agent script exists
    if (!fs.existsSync(agentPath)) {
      console.error(`Agent script not found at: ${agentPath}`);
      fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
        `[${new Date().toISOString()}] ERROR: Agent script not found at: ${agentPath}\n`);
      return { success: false, error: `Agent script not found at: ${agentPath}` };
    }
    
    // Sanitize page content if present to remove potentially problematic content
    if (agentParams.pageContent) {
      // Limit content length to prevent massive payloads
      // Use a much higher limit for questions to ensure we capture all relevant content
      const maxContentLength = agentParams.isQuestion ? 500000 : 100000;
      
      if (agentParams.pageContent.content && 
          agentParams.pageContent.content.length > maxContentLength) {
        agentParams.pageContent.content = agentParams.pageContent.content.substring(0, maxContentLength) + 
          "... [content truncated due to length]";
        
        // Log truncation for debugging
        console.log(`Page content truncated from ${agentParams.pageContent.content.length} to ${maxContentLength} characters`);
        fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
          `[${new Date().toISOString()}] Content truncated from ${agentParams.pageContent.content.length} to ${maxContentLength} characters\n`);
      }
    }
    
    // Prepare arguments for the Python process
    // The first arg is always the agent path
    const pythonArgs = [agentPath];
    
    // Determine what data to pass to the agent
    if (agentParams.pageContent) {
      // For direct page content summarization
      pythonArgs.push(JSON.stringify({
        query: cleanedQuery,
        pageContent: agentParams.pageContent,
        isDirectPage: true,
        modelInfo: agentParams.modelInfo,
        conversationHistory: agentParams.conversationHistory || null
      }));
    } else if (agentParams.urls && agentParams.urls.length > 0) {
      // For search results with URLs
      pythonArgs.push(JSON.stringify({
        query: cleanedQuery,
        urls: agentParams.urls,
        modelInfo: agentParams.modelInfo,
        conversationHistory: agentParams.conversationHistory || null
      }));
    } else {
      // Otherwise just pass the query as JSON with modelInfo
      pythonArgs.push(JSON.stringify({
        query: cleanedQuery,
        modelInfo: agentParams.modelInfo,
        conversationHistory: agentParams.conversationHistory || null
      }));
    }
    
    console.log(`Starting Python process: ${pythonPath} ${pythonArgs.join(' ')}`);
    fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
      `[${new Date().toISOString()}] Starting Python process: ${pythonPath} ${pythonArgs.join(' ')}\n`);
    
    // Execute the Python script and capture its output
    const pythonProcess = spawn(pythonPath, pythonArgs);
    let result = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      const dataStr = data.toString();
      result += dataStr;
      console.log(`Python stdout: ${dataStr}`);
      fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
        `[${new Date().toISOString()}] Python stdout: ${dataStr}\n`);
    });

    pythonProcess.stderr.on('data', (data) => {
      const dataStr = data.toString();
      error += dataStr;
      console.error(`Python stderr: ${dataStr}`);
      fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
        `[${new Date().toISOString()}] Python stderr: ${dataStr}\n`);
    });

    // Add a timeout to kill the process if it takes too long
    const timeout = setTimeout(() => {
      if (!pythonProcess.killed) {
        pythonProcess.kill();
        error = 'Process timeout: Agent execution took too long and was terminated.';
        console.error(error);
        fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
          `[${new Date().toISOString()}] ${error}\n`);
      }
    }, 45000); // 45 second timeout (increased from 30 seconds to allow for API calls)

    return new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        clearTimeout(timeout); // Clear timeout if process completes normally
        
        console.log(`Python process exited with code ${code}`);
        fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
          `[${new Date().toISOString()}] Python process exited with code ${code}\n`);
        
        // Check if sender is still valid before resolving
        if (event.sender && !event.sender.isDestroyed()) {
          if (code !== 0) {
            console.error(`Error running agent: ${error}`);
            fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
              `[${new Date().toISOString()}] Error running agent: ${error}\n`);
            resolve({ success: false, error: error || `Python process exited with code ${code}` });
          } else {
            try {
              console.log(`Parsing result: ${result}`);
              fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
                `[${new Date().toISOString()}] Parsing result: ${result}\n`);
              const parsedResult = JSON.parse(result);
              resolve(parsedResult);
            } catch (e) {
              console.error(`Failed to parse Python output: ${e.message}`);
              fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
                `[${new Date().toISOString()}] Failed to parse Python output: ${e.message}\n Result was: ${result}\n`);
              resolve({ success: false, error: `Failed to parse Python output: ${e.message}` });
            }
          }
        } else {
          console.error('Cannot return result: WebContents was destroyed');
          fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
            `[${new Date().toISOString()}] Cannot return result: WebContents was destroyed\n`);
          // Just resolve with an error rather than rejecting
          resolve({ success: false, error: 'WebContents was destroyed' });
        }
      });
      
      // Handle process error events
      pythonProcess.on('error', (err) => {
        clearTimeout(timeout);
        console.error(`Process error: ${err.message}`);
        fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
          `[${new Date().toISOString()}] Process error: ${err.message}\n`);
        resolve({ success: false, error: `Process error: ${err.message}` });
      });
    });
  } catch (error) {
    console.error(`Exception in execute-agent: ${error.message}`);
    fs.appendFileSync(path.join(__dirname, 'agent-execution.log'), 
      `[${new Date().toISOString()}] Exception in execute-agent: ${error.message}\n`);
    return { success: false, error: error.message };
  }
});

// Start the app when ready
app.whenReady().then(() => {
  // Ensure the app name is set again when ready
  app.setName('Browzer');
  
  // Set about panel options (this can help with app name recognition)
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'Browzer',
      applicationVersion: '0.0.1 (alpha)',
      copyright: 'Copyright © 2025 Browzer'
    });
  }
  
  // Create the application menu
  const template = [
    // macOS app menu
    ...(process.platform === 'darwin' ? [{
      label: 'Browzer',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            // Send message to renderer to create new tab
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-new-tab');
            }
          }
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            createWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-close-tab');
            }
          }
        },
        ...(process.platform !== 'darwin' ? [
          { type: 'separator' },
          { role: 'quit' }
        ] : [])
      ]
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    // View menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-reload');
            }
          }
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-force-reload');
            }
          }
        },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    // History menu
    {
      label: 'History',
      submenu: [
        {
          label: 'Show History',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-show-history');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+Left',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-go-back');
            }
          }
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+Right',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-go-forward');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Clear History',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-clear-history');
            }
          }
        }
      ]
    },
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  createWindow();

  // Add specific error handler for webframe disposal errors
  process.on('uncaughtException', (error) => {
    if (error.message.includes('Render frame was disposed') || 
        error.message.includes('WebFrameMain')) {
      console.error('Caught frame disposal error:', error.message);
      fs.appendFileSync(path.join(__dirname, 'webframe-errors.log'), 
          `[${new Date().toISOString()}] ${error.message}\n${error.stack}\n\n`);
      // Don't re-throw, just log and continue
      return;
    }
    
    // For other errors, log them but allow them to propagate
    console.error('Uncaught exception:', error);
    fs.appendFileSync(path.join(__dirname, 'crash-log.txt'), 
        `[${new Date().toISOString()}] Uncaught exception: ${error.message}\n${error.stack}\n`);
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
}); 