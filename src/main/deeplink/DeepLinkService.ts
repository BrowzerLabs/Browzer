import { app, BaseWindow, WebContents } from 'electron';
import { getRouteFromURL } from '@/shared/routes';

export class DeepLinkService {
  private baseWindow: BaseWindow | null = null;
  private webContents: WebContents | null = null;
  private pendingDeepLink: string | null = null;

  constructor(
    baseWindow: BaseWindow,
    webContents: WebContents
  ) {
    this.baseWindow = baseWindow;
    this.webContents = webContents;
    this.setupDeepLinkHandlers();

    if (this.pendingDeepLink) {
      this.handleDeepLink(this.pendingDeepLink);
      this.pendingDeepLink = null;
    }
  }

  private setupDeepLinkHandlers(): void {
    // macOS: Handle deep links when app is already running
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleDeepLink(url);
    });

    app.on('second-instance', (event, commandLine) => {
      
      const deepLinkUrl = commandLine.find(arg => arg.startsWith('browzer://'));
      
      if (deepLinkUrl) {
        this.handleDeepLink(deepLinkUrl);
      }

      this.focusMainWindow();
    });

    if (process.platform !== 'darwin') {
      const deepLinkUrl = process.argv.find(arg => arg.startsWith('browzer://'));
      if (deepLinkUrl) {
        this.handleDeepLink(deepLinkUrl);
      }
    }
  }

  private parseDeepLink(url: string): { path: string; params?: string; fragment?: string } | null {
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
      };
    } catch (error) {
      console.error('[DeepLinkService] Parse error:', error);
      return null;
    }
  }

  private handleDeepLink(url: string): void {
    console.log('[DeepLinkService] Handling deep link:', url);
    const data = this.parseDeepLink(url);
    if (!data) return;

    if (!this.webContents) {
      this.pendingDeepLink = url;
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
    this.webContents.send('deeplink:navigate', fullPath);
  }


  private focusMainWindow(): void {
    if (this.baseWindow) {
      if (this.baseWindow.isMinimized()) {
        this.baseWindow.restore();
      }
      this.baseWindow.focus();
      this.baseWindow.show();
    }
  }
}
