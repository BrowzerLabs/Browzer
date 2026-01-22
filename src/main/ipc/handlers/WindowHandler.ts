import { BaseHandler } from './base';

export class WindowHandler extends BaseHandler {
  register(): void {
    const { baseWindow, browserService, tabService } = this.context;

    this.handle('window:toggle-maximize', async () => {
      if (baseWindow.isMaximized()) {
        baseWindow.unmaximize();
      } else {
        baseWindow.maximize();
      }
    });

    this.handle('window:is-fullscreen', async () => {
      return baseWindow.isFullScreen();
    });

    this.handle('browser:bring-view-front', async () => {
      browserService.bringBrowserViewToFront();
      return true;
    });

    this.handle('browser:bring-view-bottom', async () => {
      browserService.bringBrowserViewToBottom();
      return true;
    });

    this.handle(
      'browser:scroll',
      async (_event, deltaX: number, deltaY: number, x: number, y: number) => {
        return tabService.handleScroll(deltaX, deltaY, x, y);
      }
    );
  }
}
