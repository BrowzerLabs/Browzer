import { BaseHandler } from './base';

export class ThemeHandler extends BaseHandler {
  register(): void {
    const { themeService } = this.context;

    this.handle('theme:get', async () => {
      return themeService.getTheme();
    });

    this.handle('theme:set', async (_, theme: 'light' | 'dark' | 'system') => {
      themeService.setTheme(theme);
      return true;
    });

    this.handle('theme:is-dark', async () => {
      return themeService.isDarkMode();
    });
  }
}
