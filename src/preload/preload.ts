import { contextBridge, ipcRenderer, shell } from 'electron';
import * as path from 'path';
import { AgentParams, AgentResult, Extension } from '../shared/types';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Agent execution
  executeAgent: (agentPath: string, agentParams: AgentParams): Promise<AgentResult> =>
    ipcRenderer.invoke('execute-agent', { agentPath, agentParams }),
  
  // Extension management
  installExtension: (extensionPath: string): Promise<{ success: boolean; extension?: Extension; error?: string }> =>
    ipcRenderer.invoke('install-extension', extensionPath),
  
  removeExtension: (extensionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('remove-extension', extensionId),
  
  getExtensions: (): Promise<Extension[]> =>
    ipcRenderer.invoke('get-extensions'),
  
  installFromStore: (extensionId: string): Promise<{ success: boolean; extension?: Extension; error?: string }> =>
    ipcRenderer.invoke('install-from-store', extensionId),
  
  enableDeveloperMode: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('enable-developer-mode'),
  
  // Workflow progress listeners
  onWorkflowProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('workflow-progress', (_, data) => callback(data));
  },
  
  onWorkflowComplete: (callback: (data: any) => void) => {
    ipcRenderer.on('workflow-complete', (_, data) => callback(data));
  },
  
  onWorkflowError: (callback: (data: any) => void) => {
    ipcRenderer.on('workflow-error', (_, data) => callback(data));
  },
  
  // Logging
  log: (message: string): void =>
    ipcRenderer.send('renderer-log', message),
  
  // Menu actions - listen to menu events from main process
  onMenuAction: (callback: (channel: string) => void) => {
    const channels = [
      'menu-new-tab',
      'menu-close-tab', 
      'menu-reload',
      'menu-back',
      'menu-forward'
    ];
    
    channels.forEach(channel => {
      ipcRenderer.on(channel, () => callback(channel));
    });
  },
  
  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // IPC communication - expose safe IPC methods
  ipcInvoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  ipcSend: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  ipcOn: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => callback(...args));
  },
  ipcOff: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.off(channel, callback);
  },

  // Shell methods
  openExternal: (url: string) => shell.openExternal(url),
  showItemInFolder: (path: string) => shell.showItemInFolder(path),

  // Process and environment info
  platform: process.platform,
  versions: process.versions,
  cwd: () => process.cwd(),

  // Path utilities
  path: {
    join: (...segments: string[]) => path.join(...segments),
    dirname: (p: string) => path.dirname(p),
    basename: (p: string, ext?: string) => path.basename(p, ext),
    extname: (p: string) => path.extname(p),
    resolve: (...segments: string[]) => path.resolve(...segments),
    relative: (from: string, to: string) => path.relative(from, to),
    isAbsolute: (p: string) => path.isAbsolute(p),
    normalize: (p: string) => path.normalize(p),
    sep: path.sep,
    delimiter: path.delimiter
  }
});

// Type declarations for the exposed API
declare global {
  interface Window {
    electronAPI: {
      executeAgent: (agentPath: string, agentParams: AgentParams) => Promise<AgentResult>;
      installExtension: (extensionPath: string) => Promise<{ success: boolean; extension?: Extension; error?: string }>;
      removeExtension: (extensionId: string) => Promise<{ success: boolean; error?: string }>;
      getExtensions: () => Promise<Extension[]>;
      installFromStore: (extensionId: string) => Promise<{ success: boolean; extension?: Extension; error?: string }>;
      enableDeveloperMode: () => Promise<{ success: boolean; error?: string }>;
      onWorkflowProgress: (callback: (data: any) => void) => void;
      onWorkflowComplete: (callback: (data: any) => void) => void;
      onWorkflowError: (callback: (data: any) => void) => void;
      log: (message: string) => void;
      onMenuAction: (callback: (channel: string) => void) => void;
      removeAllListeners: (channel: string) => void;
      ipcInvoke: (channel: string, ...args: any[]) => Promise<any>;
      ipcSend: (channel: string, ...args: any[]) => void;
      ipcOn: (channel: string, callback: (...args: any[]) => void) => void;
      ipcOff: (channel: string, callback: (...args: any[]) => void) => void;
      openExternal: (url: string) => Promise<void>;
      showItemInFolder: (path: string) => void;
      platform: string;
      versions: any;
      cwd: () => string;
      path: {
        join: (...segments: string[]) => string;
        dirname: (p: string) => string;
        basename: (p: string, ext?: string) => string;
        extname: (p: string) => string;
        resolve: (...segments: string[]) => string;
        relative: (from: string, to: string) => string;
        isAbsolute: (p: string) => boolean;
        normalize: (p: string) => string;
        sep: string;
        delimiter: string;
      };
    };
  }
} 