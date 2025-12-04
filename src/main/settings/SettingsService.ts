import { AppSettings } from '@/shared/types';
import Store from 'electron-store';
import { EventEmitter } from 'events';

const defaultSettings: AppSettings = {
  general: {
    defaultSearchEngine: 'https://www.google.com/search?q=',
    newTabUrl: 'https://www.google.com',
  },
  privacy: {
    clearCacheOnExit: false,
    doNotTrack: true,
    blockThirdPartyCookies: false,
  },
  appearance: {
    fontSize: 16,
    showBookmarksBar: false,
  },
};

export interface SettingsChangeEvent<K extends keyof AppSettings = keyof AppSettings> {
  category: K;
  key?: keyof AppSettings[K];
  value: Partial<AppSettings[K]> | AppSettings[K][keyof AppSettings[K]];
  previousValue: AppSettings[K];
  newValue: AppSettings[K];
}

export interface SettingsServiceEvents {
  'settings:changed': (event: SettingsChangeEvent) => void;
  'settings:general': (event: SettingsChangeEvent<'general'>) => void;
  'settings:privacy': (event: SettingsChangeEvent<'privacy'>) => void;
  'settings:appearance': (event: SettingsChangeEvent<'appearance'>) => void;
}

export class SettingsService extends EventEmitter {
  private store: Store<AppSettings>;

  public on<K extends keyof SettingsServiceEvents>(
    event: K,
    listener: SettingsServiceEvents[K]
  ): this {
    return super.on(event, listener);
  }

  public emit<K extends keyof SettingsServiceEvents>(
    event: K,
    ...args: Parameters<SettingsServiceEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  constructor() {
    super();
    this.store = new Store<AppSettings>({
      name: 'settings',
      defaults: defaultSettings,
    });
  }

  public getAllSettings(): AppSettings {
    return this.store.store;
  }

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

  public updateSetting<K extends keyof AppSettings, T extends keyof AppSettings[K]>(
    category: K,
    key: T,
    value: AppSettings[K][T]
  ): void {
    const previousValue = this.store.get(category) as AppSettings[K];
    const newValue = { ...previousValue, [key]: value };
    this.store.set(category, newValue);
    
    const event: SettingsChangeEvent<K> = {
      category,
      key,
      value,
      previousValue,
      newValue,
    };
    
    this.emitSettingsEvent(category, event);
  }

  public updateCategory<K extends keyof AppSettings>(
    category: K,
    values: Partial<AppSettings[K]>
  ): void {
    const previousValue = this.store.get(category) as AppSettings[K];
    const newValue = { ...previousValue, ...values };
    this.store.set(category, newValue);

    const event: SettingsChangeEvent<K> = {
      category,
      value: values,
      previousValue,
      newValue,
    };
    
    this.emitSettingsEvent(category, event);
  }

  private emitSettingsEvent<K extends keyof AppSettings>(
    category: K,
    event: SettingsChangeEvent<K>
  ): void {
    const categoryEvent = `settings:${category}` as keyof SettingsServiceEvents;
    super.emit(categoryEvent, event);
    super.emit('settings:changed', event as unknown as SettingsChangeEvent);
  }

  public resetToDefaults(): void {
    this.store.clear();
    this.store.store = defaultSettings;
  }

  public resetCategory<K extends keyof AppSettings>(category: K): void {
    this.store.set(category, defaultSettings[category]);
  }

  public exportSettings(): string {
    return JSON.stringify(this.store.store, null, 2);
  }

  public importSettings(jsonString: string): boolean {
    try {
      const settings = JSON.parse(jsonString) as AppSettings;
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
}