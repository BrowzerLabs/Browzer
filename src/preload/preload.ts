import { contextBridge, ipcRenderer } from 'electron';
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
    };
  }
} 