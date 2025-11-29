import { nativeTheme } from 'electron';
import Store from 'electron-store';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeStore {
  theme: ThemeMode;
}

export class ThemeService {
  private static instance: ThemeService | null = null;
  private store: Store<ThemeStore>;

  private constructor() {
    this.store = new Store<ThemeStore>({
      name: 'theme-preferences',
      defaults: {
        theme: 'system',
      }
    });

    this.applyTheme(this.getTheme());
  }

  public static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  public getTheme(): ThemeMode {
    return this.store.get('theme', 'system');
  }

  public setTheme(theme: ThemeMode): void {
    this.store.set('theme', theme);
    this.applyTheme(theme);
  }

  private applyTheme(theme: ThemeMode): void {
    nativeTheme.themeSource = theme;
  }
  
  public isDarkMode(): boolean {
    return nativeTheme.shouldUseDarkColors;
  }

  public onThemeChange(callback: (isDark: boolean) => void): () => void {
    const handler = () => callback(nativeTheme.shouldUseDarkColors);
    nativeTheme.on('updated', handler);
    return () => nativeTheme.off('updated', handler);
  }
}
