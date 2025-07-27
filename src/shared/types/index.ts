// Shared types across main and renderer processes

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
  webviewId?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

export interface Extension {
  id: string;
  name: string;
  enabled: boolean;
  path?: string;
}

export interface AgentParams {
  query: string;
  pageContent?: PageContent;
  urls?: string[];
  modelInfo?: ModelInfo;
  conversationHistory?: ConversationMessage[];
  isQuestion?: boolean;
}

export interface PageContent {
  title: string;
  content: string;
  url: string;
  metadata?: Record<string, any>;
}

export interface ModelInfo {
  provider: string;
  model: string;
  apiKey?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AgentResult {
  success: boolean;
  data?: any;
  error?: string;
  timing?: {
    start: number;
    end: number;
    duration: number;
  };
}

export interface CacheItem {
  data: any;
  originalType: string;
  type: string;
  identifier: string;
  params: Record<string, any>;
  createdAt: number;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
}

export interface CacheSettings {
  maxSize: number;
  maxItems: number;
  defaultTTL: number;
  enableCompression: boolean;
  enableAutoCleanup: boolean;
  cleanupInterval: number;
  typeTTLs: Record<string, number>;
}

export interface HistoryItem {
  id: string;
  url: string;
  title: string;
  visitTime: number;
  favicon?: string;
}

export interface Memory {
  id: string;
  url: string;
  question: string;
  answer: string;
  title: string;
  timestamp: number;
  keywords: string[];
  topic: string;
}

export const CACHE_TYPES = {
  PAGE_CONTENT: 'page_content',
  API_RESPONSE: 'api_response',
  METADATA: 'metadata',
  RESOURCES: 'resources',
  AI_ANALYSIS: 'ai_analysis'
} as const;

export type CacheType = typeof CACHE_TYPES[keyof typeof CACHE_TYPES];

// IPC channel names
export const IPC_CHANNELS = {
  // Extension management
  INSTALL_EXTENSION: 'install-extension',
  REMOVE_EXTENSION: 'remove-extension',
  GET_EXTENSIONS: 'get-extensions',
  INSTALL_FROM_STORE: 'install-from-store',
  ENABLE_DEVELOPER_MODE: 'enable-developer-mode',
  
  // Agent execution (legacy)
  EXECUTE_AGENT: 'execute-agent',
  
  // Extension execution (new framework)
  EXECUTE_PYTHON_EXTENSION: 'execute-python-extension',
  
  // Logging
  RENDERER_LOG: 'renderer-log',
  
  // Menu actions
  MENU_NEW_TAB: 'menu-new-tab',
  MENU_NEW_TAB_WITH_URL: 'menu-new-tab-with-url',
  MENU_CLOSE_TAB: 'menu-close-tab',
  MENU_RELOAD: 'menu-reload',
  MENU_BACK: 'menu-back',
  MENU_FORWARD: 'menu-forward',
  
  // Settings menu actions
  MENU_SETTINGS_API_KEYS: 'menu-settings-api-keys',
  MENU_SETTINGS_INTERFACE: 'menu-settings-interface',
  MENU_SETTINGS_AI_MEMORY: 'menu-settings-ai-memory',
  MENU_SETTINGS_PRIVACY: 'menu-settings-privacy',
  MENU_SETTINGS_CACHE: 'menu-settings-cache',
  MENU_SETTINGS_GENERAL: 'menu-settings-general'
} as const; 