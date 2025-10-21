export interface AppSettings {
  // General Settings
  general: {
    defaultSearchEngine: string;
    homepage: string;
    newTabPage: string;
  };
  
  // Privacy & Security
  privacy: {
    clearCacheOnExit: boolean;
    doNotTrack: boolean;
    blockThirdPartyCookies: boolean;
  };
  
  // Appearance
  appearance: {
    theme: 'light' | 'dark' | 'system';
    fontSize: number;
    showBookmarksBar: boolean;
  };
  
  // Automation Settings
  automation: {
    defaultProvider: 'gemini' | 'claude' | 'openai';
    geminiApiKey: string;
    claudeApiKey: string;
    openaiApiKey: string;
  };
}