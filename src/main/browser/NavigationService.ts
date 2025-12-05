import path from 'node:path';
import { getRouteFromURL } from '@/shared/routes';
import { buildSearchUrl } from '@/shared/searchEngines';
import { SettingsChangeEvent, SettingsService } from '@/main/settings/SettingsService';

export class NavigationService {
  private searchEngineId: string = 'google'
  
  constructor(
    private settingsService: SettingsService,
  ){
    this.searchEngineId = this.settingsService.getSetting('general', 'searchEngineId') || 'google';
    
    this.setUpSettingsListner();
  }

  private setUpSettingsListner(){
    this.settingsService.on('settings:general', (event: SettingsChangeEvent<'general'>) => {
      const { newValue } = event;
      this.searchEngineId = newValue.searchEngineId || 'google'
    });
  }

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
    
    return buildSearchUrl(this.searchEngineId, trimmed);
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

  public getInternalPageInfo(url: string): { url: string; title: string; favicon?: string } | null {
    const hashMatch = url.match(/#\/([^?]+)/);
    if (!hashMatch) return null;
    
    const routePath = hashMatch[1];
    const browzerUrl = `browzer://${routePath}`;
    const route = getRouteFromURL(browzerUrl);
    
    if (route) {
      return {
        url: browzerUrl,
        title: route.title,
        favicon: route.favicon,
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
      const routePath = hashMatch[1];
      if (routePath === 'error') return true;
      
      const browzerUrl = `browzer://${routePath}`;
      return getRouteFromURL(browzerUrl) !== null;
    }
    
    return false;
  }

  public isErrorPage(url: string): boolean {
    return url.includes('#/error?data=') || url.includes('browzer://error');
  }
}
