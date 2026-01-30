import { BaseWindow, WebContents } from 'electron';

import { getRouteFromURL } from '@/shared/routes';

export class DeepLinkService {
  private baseWindow: BaseWindow | null = null;
  private webContents: WebContents | null = null;

  constructor(baseWindow: BaseWindow, webContents: WebContents) {
    this.baseWindow = baseWindow;
    this.webContents = webContents;
  }

  private parseDeepLink(
    url: string
  ): { path: string; params?: string; fragment?: string; fullWindow?: boolean } | null {
    try {
      if (!url.startsWith('browzer://')) {
        return null;
      }

      const route = getRouteFromURL(url);
      if (!route) {
        console.warn('[DeepLinkService] Unknown route:', url);
        return null;
      }

      return {
        path: route.path,
        params: route.params,
        fragment: route.fragment,
        fullWindow: route.fullWindow,
      };
    } catch (error) {
      console.error('[DeepLinkService] Parse error:', error);
      return null;
    }
  }

  public handleDeepLink(url: string): void {
    console.log('[DeepLinkService] Handling deep link:', url);
    const data = this.parseDeepLink(url);
    if (!data) return;

    if (!this.webContents || this.webContents.isDestroyed()) {
      console.warn(
        '[DeepLinkService] WebContents is destroyed, cannot handle deeplink'
      );
      return;
    }

    this.focusMainWindow();

    let fullPath = data.path;
    if (data.fragment) {
      fullPath += `#${data.fragment}`;
    }
    if (data.params) {
      fullPath += `?${data.params}`;
    }

    this.webContents.send('deeplink:navigate', {
      path: fullPath,
      fullWindow: data.fullWindow || false
    });
  }

  public focusMainWindow(): void {
    if (!this.baseWindow || this.baseWindow.isDestroyed()) {
      console.warn('[DeepLinkService] BaseWindow is destroyed, cannot focus');
      return;
    }

    try {
      if (this.baseWindow.isMinimized()) {
        this.baseWindow.restore();
      }
      this.baseWindow.focus();
      this.baseWindow.show();
    } catch (error) {
      console.error('[DeepLinkService] Error focusing window:', error);
    }
  }

  public destroy(): void {
    console.log('[DeepLinkService] Cleaning up');
    this.baseWindow = null;
    this.webContents = null;
  }
}
