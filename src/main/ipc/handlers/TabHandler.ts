import { FindInPageOptions } from 'electron';
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

    this.handle('browser:restore-closed-tab', async () => {
      return tabService.restoreLastClosedTab();
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

    this.handle('browser:create-tab-group', async (_event, name?: string, color?: string) => {
      return tabService.createTabGroup(name, color);
    });

    this.handle('browser:update-tab-group', async (_event, groupId: string, name?: string, color?: string) => {
      return tabService.updateTabGroup(groupId, name, color);
    });

    this.handle('browser:assign-tab-group', async (_event, tabId: string, groupId: string | null) => {
      return tabService.assignTabToGroup(tabId, groupId);
    });

    this.handle('browser:remove-tab-group', async (_event, groupId: string) => {
      return tabService.removeTabGroup(groupId);
    });

    this.handle('browser:get-tab-groups', async () => {
      return tabService.getTabGroups();
    });

    this.handle('browser:toggle-tab-group-collapse', async (_event, groupId: string) => {
      return tabService.toggleTabGroupCollapse(groupId);
    });

    this.handle('browser:restore-session', async () => {
      return tabService.restoreSession();
    });

    this.handle('browser:discard-session', async () => {
      return tabService.discardSession();
    });

    this.handle('browser:find-in-page', async (_, tabId: string, text: string, options: FindInPageOptions) => {
      return tabService.startFindInPage(tabId, text, options);
    });

    this.handle('browser:stop-find-in-page', async (_, tabId: string, action: 'clearSelection' | 'keepSelection' | 'activateSelection') => {
      return tabService.stopFindInPage(tabId, action);
    });
  }
}
