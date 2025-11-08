import path from 'node:path';
import { getRouteFromURL } from '@/shared/routes';

/**
 * NavigationManager - URL normalization and browzer:// protocol handler
 * 
 * Simple responsibilities:
 * 1. Normalize user input to valid URLs
 * 2. Convert browzer:// to internal URLs
 */
export class NavigationManager {
  /**
   * Normalize URL (add protocol if missing, handle search queries)
   */
  public normalizeURL(url: string): string {
    const trimmed = url.trim();
    
    if (trimmed.startsWith('browzer://')) {
      return this.handleInternalURL(trimmed);
    }
    
    // If it looks like a URL with protocol, use it as is
    if (/^[a-z]+:\/\//i.test(trimmed)) {
      return trimmed;
    }
    
    // If it looks like a domain, add https://
    if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    
    // Otherwise, treat as search query
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  /**
   * Handle internal browzer:// URLs
   */
  private handleInternalURL(url: string): string {
    const route = getRouteFromURL(url);
    if (!route) {
      console.warn('Unknown browzer:// URL:', url);
      return 'https://www.google.com';
    }
    
    return this.generateInternalPageURL(route.path.replace('/', ''));
  }

  /**
   * Generate internal page URL with hash routing
   * @param pageName - Name of the internal page (settings, history, etc.)
   */
  private generateInternalPageURL(pageName: string): string {
    // In development, use the dev server with a hash route
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      return `${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/${pageName}`;
    }
    
    // In production, use file protocol with hash route
    return `file://${path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)}#/${pageName}`;
  }

  /**
   * Get internal page info from URL
   */
  public getInternalPageInfo(url: string): { url: string; title: string } | null {
    // Check if URL contains hash route
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

  /**
   * Get internal page title from URL
   */
  public getInternalPageTitle(url: string): string | null {
    const info = this.getInternalPageInfo(url);
    return info?.title || null;
  }

  /**
   * Check if URL is an internal page
   */
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
