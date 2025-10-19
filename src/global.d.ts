import type { BrowserAPI } from './preload';

declare global {
  interface Window {
    browserAPI: BrowserAPI;
    aiAPI: {
      sendClaude: (fullMessage: string, contexts?: Array<{ type: 'tab'; tabId: string; title?: string; url?: string; markdown?: string }>) => Promise<string>;
      runOrchestrator: (query: string, tabId?: string) => Promise<string>;
      executeDoAgent: (instruction: string) => Promise<{ success: boolean; data?: any; error?: string; executionTime: number }>;
    };
  }

  // Vite Electron Forge globals
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
}

export {};

// Type shim for optional dependency used at runtime
declare module '@google/genai';
