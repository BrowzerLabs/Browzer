import { nativeTheme, BaseWindow } from 'electron';

import Store from 'electron-store';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeStore {
  theme: ThemeMode;
}

export class ThemeService {
  private store: Store<ThemeStore>;

  public constructor(private baseWindow: BaseWindow) {
    this.store = new Store<ThemeStore>({
      name: 'theme-preferences',
      defaults: {
        theme: 'system',
      },
    });

    this.applyTheme(this.getTheme());

    nativeTheme.on('updated', () => {
      this.updateWindowTitleBarOverlay();
    });
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
    this.updateWindowTitleBarOverlay();
  }

  private updateWindowTitleBarOverlay(): void {
    const isDark = nativeTheme.shouldUseDarkColors;
    if (process.platform === 'win32') {
      this.baseWindow.setTitleBarOverlay({
        symbolColor: isDark ? '#ffffff' : '#000000',
        height: 32,
      });
    }
  }

  public isDarkMode(): boolean {
    return nativeTheme.shouldUseDarkColors;
  }

  public onThemeChange(callback: (isDark: boolean) => void): () => void {
    const handler = () => callback(nativeTheme.shouldUseDarkColors);
    nativeTheme.on('updated', handler);
    return () => nativeTheme.off('updated', handler);
  }

  public destroy() {
    nativeTheme.off('updated', () => {
      this.updateWindowTitleBarOverlay();
    });
  }
}
