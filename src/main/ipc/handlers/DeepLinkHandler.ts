import { BaseHandler } from './base';

export class DeepLinkHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;

    this.handle('deeplink:hide-tabs', async () => {
      browserService.hideAllTabs();
      return true;
    });

    this.handle('deeplink:show-tabs', async () => {
      browserService.showAllTabs();
      return true;
    });

    this.handle('deeplink:navigate-tab', async (_, url: string) => {
      browserService.navigateToBrowzerURL(url);
      return true;
    });
  }
}
