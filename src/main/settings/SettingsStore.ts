import Store from 'electron-store';

/**
 * Settings schema definition
 * This will be expanded as features are added
 */
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
  
  // Agent Settings
  agent: {
    autoSaveRecordings: boolean;
  };
}

/**
 * Default settings configuration
 */
const defaultSettings: AppSettings = {
  general: {
    defaultSearchEngine: 'https://www.google.com/search?q=',
    homepage: 'https://www.google.com',
    newTabPage: 'https://www.google.com',
  },
  privacy: {
    clearCacheOnExit: false,
    doNotTrack: true,
    blockThirdPartyCookies: false,
  },
  appearance: {
    theme: 'system',
    fontSize: 16,
    showBookmarksBar: false,
  },
  agent: {
    autoSaveRecordings: true,
  },
};

/**
 * SettingsStore - Manages application settings persistence
 * Uses electron-store for cross-platform settings storage
 */
export class SettingsStore {
  private store: Store<AppSettings>;

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'settings',
      defaults: defaultSettings,
    });
  }

  /**
   * Get all settings
   */
  public getAllSettings(): AppSettings {
    return this.store.store;
  }

  /**
   * Get a specific setting by path
   */
  public getSetting<K extends keyof AppSettings>(category: K): AppSettings[K];
  public getSetting<K extends keyof AppSettings, T extends keyof AppSettings[K]>(
    category: K,
    key: T
  ): AppSettings[K][T];
  public getSetting<K extends keyof AppSettings, T extends keyof AppSettings[K]>(
    category: K,
    key?: T
  ): AppSettings[K] | AppSettings[K][T] {
    if (key) {
      const categoryData = this.store.get(category) as AppSettings[K];
      return categoryData[key];
    }
    return this.store.get(category) as AppSettings[K];
  }

  /**
   * Update a specific setting
   */
  public updateSetting<K extends keyof AppSettings, T extends keyof AppSettings[K]>(
    category: K,
    key: T,
    value: AppSettings[K][T]
  ): void {
    const categoryData = this.store.get(category) as AppSettings[K];
    this.store.set(category, { ...categoryData, [key]: value });
  }

  /**
   * Update an entire category
   */
  public updateCategory<K extends keyof AppSettings>(
    category: K,
    values: Partial<AppSettings[K]>
  ): void {
    const current = this.store.get(category);
    this.store.set(category, { ...current, ...values });
  }

  /**
   * Reset all settings to defaults
   */
  public resetToDefaults(): void {
    this.store.clear();
    this.store.store = defaultSettings;
  }

  /**
   * Reset a specific category to defaults
   */
  public resetCategory<K extends keyof AppSettings>(category: K): void {
    this.store.set(category, defaultSettings[category]);
  }

  /**
   * Export settings as JSON
   */
  public exportSettings(): string {
    return JSON.stringify(this.store.store, null, 2);
  }

  /**
   * Import settings from JSON
   */
  public importSettings(jsonString: string): boolean {
    try {
      const settings = JSON.parse(jsonString) as AppSettings;
      // Validate structure (basic check)
      if (settings.general && settings.privacy && settings.appearance) {
        this.store.store = { ...defaultSettings, ...settings };
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }

  /**
   * Get the file path where settings are stored
   */
  public getStorePath(): string {
    return this.store.path;
  }
}
