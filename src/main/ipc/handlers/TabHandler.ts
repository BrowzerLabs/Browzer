import { BaseHandler } from './base';

export class TabHandler extends BaseHandler {
  register(): void {
    const { tabService } = this.context;

    this.handle('browser:initialize', async () => {
        tabService.initializeAfterAuth();
      return true;
    });

    this.handle('browser:create-tab', async (_, url?: string) => {
      const tab = tabService.createTab(url);
      return tab.info;
    });

    this.handle('browser:close-tab', async (_, tabId: string) => {
      return tabService.closeTab(tabId);
    });

    this.handle('browser:switch-tab', async (_, tabId: string) => {
      return tabService.switchToTab(tabId);
    });

    this.handle('browser:get-tabs', async () => {
      return tabService.getAllTabs();
    });

    this.handle('browser:reorder-tab', async (_, tabId: string, newIndex: number) => {
      return tabService.reorderTab(tabId, newIndex);
    });
  }
}
