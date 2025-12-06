import path from 'node:path';
import { getRouteFromURL } from '@/shared/routes';
import { AutocompleteSuggestion, AutocompleteSuggestionType } from '@/shared/types';
import { HistoryService } from '@/main/history/HistoryService';
import { isLikelyUrl } from '@/shared/utils';

export class NavigationService {
  constructor(
    private historyService: HistoryService,
  ) {}
  
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
      const browzerUrl = `browzer://${hashMatch[1]}`;
      return getRouteFromURL(browzerUrl) !== null;
    }
    
    return false;
  }

  public async getSearchSuggestions(query: string): Promise<string[]> {
    if (!query.trim()) return [];

    try {
      const response = await fetch(
        `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`
      );
      
      if (!response.ok) return [];
      
      const data = await response.json();
      return Array.isArray(data[1]) ? data[1].slice(0, 5) : [];
    } catch (error) {
      console.error('Error fetching search suggestions:', error);
      return [];
    }
  }

  public extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  public async getAutocompleteSuggestions(query: string): Promise<AutocompleteSuggestion[]> {
      const suggestions: AutocompleteSuggestion[] = [];
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        const mostVisited = await this.historyService.getMostVisited(6);
        return mostVisited.map((entry, index) => ({
          id: `history-${entry.id}`,
          type: AutocompleteSuggestionType.HISTORY,
          title: entry.title,
          url: entry.url,
          subtitle: this.extractDomain(entry.url),
          favicon: entry.favicon,
          visitCount: entry.visitCount,
          relevanceScore: 100 - index,
        }));
      }

      const historySuggestions = await this.historyService.getAutocompleteSuggestions(trimmedQuery, 6);
      historySuggestions.forEach((entry, index) => {
        suggestions.push({
          id: `history-${entry.id}`,
          type: AutocompleteSuggestionType.HISTORY,
          title: entry.title,
          url: entry.url,
          subtitle: this.extractDomain(entry.url),
          favicon: entry.favicon,
          visitCount: entry.visitCount,
          relevanceScore: 90 - index * 10,
        });
      });

      if (!isLikelyUrl(trimmedQuery)) {
        suggestions.push({
          id: 'search-google',
          type: AutocompleteSuggestionType.SEARCH,
          title: trimmedQuery,
          url: `https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`,
          subtitle: 'Search Google',
          relevanceScore: 80,
        });
      }

      return suggestions
        .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 8);
    }
}
