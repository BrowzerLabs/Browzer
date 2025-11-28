import path from 'node:path';
import { getRouteFromURL } from '@/shared/routes';
export class NavigationManager {
  public normalizeURL(url: string): string {
    const trimmed = url.trim();
    
    if (trimmed.startsWith('browzer://')) {
      return this.handleInternalURL(trimmed);
    }
    
    if (/^[a-z]+:\/\//i.test(trimmed)) {
      return trimmed;
    }
    
    if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  private handleInternalURL(url: string): string {
    const route = getRouteFromURL(url);
    if (!route) {
      console.warn('Unknown browzer:// URL:', url);
      return 'https://www.google.com';
    }
    
    return this.generateInternalPageURL(route.path.replace('/', ''));
  }

  private generateInternalPageURL(pageName: string): string {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/${pageName}`;
    }
    
    return `file://${path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)}#/${pageName}`;
  }

  public getInternalPageInfo(url: string): { url: string; title: string } | null {
    const hashMatch = url.match(/#\/([^?]+)/);
    if (!hashMatch) return null;
    
    const routePath = hashMatch[1];
    const browzerUrl = `browzer://${routePath}`;
    const route = getRouteFromURL(browzerUrl);
    
    if (route) {
      return {
        url: browzerUrl,
        title: route.title,
      };
    }
    
    return null;
  }

  public getInternalPageTitle(url: string): string | null {
    const info = this.getInternalPageInfo(url);
    return info?.title || null;
  }

  public isInternalPage(url: string): boolean {
    if (url.startsWith('browzer://')) return true;
    if (url.includes('index.html#/')) return true;
    
    const hashMatch = url.match(/#\/([^?]+)/);
    if (hashMatch) {
      const browzerUrl = `browzer://${hashMatch[1]}`;
      return getRouteFromURL(browzerUrl) !== null;
    }
    
    return false;
  }
}
