import { session, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { Extension } from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';

export class ExtensionManager {
  private loadedExtensions = new Map<string, Extension>();
  private extensionsDir: string;

  constructor() {
    this.extensionsDir = path.join(__dirname, '../../extensions');
  }

  async initialize(): Promise<void> {
    this.setupIpcHandlers();
    this.ensureExtensionsDirectory();
  }

  async loadExtensions(): Promise<void> {
    if (!fs.existsSync(this.extensionsDir)) {
      console.log('Extensions directory does not exist');
      return;
    }

    try {
      const extensions = fs.readdirSync(this.extensionsDir);
      
      if (extensions.length === 0) {
        console.log('No extensions found in directory');
        return;
      }

      for (const ext of extensions) {
        const extPath = path.join(this.extensionsDir, ext);
        if (fs.statSync(extPath).isDirectory()) {
          try {
            const extension = await session.defaultSession.loadExtension(extPath, {
              allowFileAccess: true
            });
            
            this.loadedExtensions.set(extension.id, {
              id: extension.id,
              name: extension.name,
              enabled: true,
              path: extPath
            });
            
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
  }

  private ensureExtensionsDirectory(): void {
    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true });
      console.log('Created extensions directory');
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