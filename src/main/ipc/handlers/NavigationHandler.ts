import { BaseHandler } from './base';

export class NavigationHandler extends BaseHandler {
  register(): void {
    const { tabService } = this.context;

    this.handle('browser:navigate', async (_, tabId: string, url: string) => {
      return tabService.navigate(tabId, url);
    });

    this.handle('browser:go-back', async (_, tabId: string) => {
      return tabService.goBack(tabId);
    });

    this.handle('browser:go-forward', async (_, tabId: string) => {
      return tabService.goForward(tabId);
    });

    this.handle('browser:reload', async (_, tabId: string) => {
      return tabService.reload(tabId);
    });

    this.handle('browser:stop', async (_, tabId: string) => {
      return tabService.stop(tabId);
    });

    this.handle('browser:can-go-back', async (_, tabId: string) => {
      return tabService.canGoBack(tabId);
    });

    this.handle('browser:can-go-forward', async (_, tabId: string) => {
      return tabService.canGoForward(tabId);
    });
  }
}
