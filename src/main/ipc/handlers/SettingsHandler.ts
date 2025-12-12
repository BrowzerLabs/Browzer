import { BaseHandler } from './base';
import { AppSettings } from '@/shared/types';

export class SettingsHandler extends BaseHandler {
  register(): void {
    const { settingsService } = this.context;

    this.handle('settings:get-all', async () => {
      return settingsService.getAllSettings();
    });

    this.handle('settings:get-category', async (_, category: keyof AppSettings) => {
      return settingsService.getSetting(category);
    });

    this.handle('settings:update', async (_, category: keyof AppSettings, key: string, value: unknown) => {
      settingsService.updateSetting(category, key as never, value as never);
      return true;
    });

    this.handle('settings:update-category', async (_, category: keyof AppSettings, values: unknown) => {
      settingsService.updateCategory(category, values as never);
      return true;
    });

    this.handle('settings:reset-all', async () => {
      settingsService.resetToDefaults();
      return true;
    });

    this.handle('settings:reset-category', async (_, category: keyof AppSettings) => {
      settingsService.resetCategory(category);
      return true;
    });

    this.handle('settings:export', async () => {
      return settingsService.exportSettings();
    });

    this.handle('settings:import', async (_, jsonString: string) => {
      return settingsService.importSettings(jsonString);
    });
  }
}
