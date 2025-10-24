import { app, protocol, net } from 'electron';
import started from 'electron-squirrel-startup';
import { BrowserWindow } from './main/BrowserWindow';
import path from 'path';
import dotenv from 'dotenv';

// Load VLM environment configuration
const envPath = path.join(process.cwd(), '.env.vlm');
console.log('🧠 Loading VLM config from:', envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn('⚠️ Failed to load .env.vlm:', result.error.message);
} else {
  console.log('✅ VLM config loaded successfully');
  console.log('🧠 Loaded env vars:', Object.keys(result.parsed || {}));
}

if (started) {
  app.quit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'video-file',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
      stream: true
    }
  }
]);

app.whenReady().then(() => {
  protocol.handle('video-file', (request) => {
    const url = request.url.replace('video-file://', '');
    const decodedPath = decodeURIComponent(url);
    
    const normalizedPath = path.normalize(decodedPath);
    
    return net.fetch(`file://${normalizedPath}`);
  });
  
  createWindow();
});

let mainBrowserWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainBrowserWindow = new BrowserWindow();
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainBrowserWindow === null) {
    createWindow();
  }
});