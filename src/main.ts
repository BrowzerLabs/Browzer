import 'dotenv/config';
import { app, protocol, net } from 'electron';
import started from 'electron-squirrel-startup';
import { BrowserWindow } from './main/BrowserWindow';
import memoryService from './main/MemoryService';
import path from 'path';

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

const createWindow = async () => {
  await memoryService.initialize();
  
  mainBrowserWindow = new BrowserWindow();
};

app.on('window-all-closed', () => {
  memoryService.cleanup();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (mainBrowserWindow === null) {
    await createWindow();
  }
});