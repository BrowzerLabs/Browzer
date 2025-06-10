export class URLUtils {
  private static readonly PROBLEMATIC_SITES = [
    'facebook.com',
    'instagram.com', 
    'twitter.com',
    'linkedin.com',
    'discord.com'
  ];

  /**
   * Check if a URL belongs to a problematic site that requires special handling
   */
  static isProblematicSite(url: string): boolean {
    if (!url) return false;
    
    try {
      const urlObj = new URL(url);
      return this.PROBLEMATIC_SITES.some(site => urlObj.hostname.includes(site));
    } catch (e) {
      console.error('Error parsing URL:', e);
      return false;
    }
  }

  /**
   * Validate if a string is a valid URL
   */
  static isValidURL(urlString: string): boolean {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if URL is HTTP/HTTPS
   */
  static isWebURL(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  /**
   * Extract domain from URL
   */
  static getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  /**
   * Extract domain without www prefix
   */
  static getBaseDomain(url: string): string {
    const domain = this.getDomain(url);
    return domain.replace(/^www\./, '');
  }

  /**
   * Check if two URLs are from the same domain
   */
  static isSameDomain(url1: string, url2: string): boolean {
    try {
      const domain1 = new URL(url1).hostname;
      const domain2 = new URL(url2).hostname;
      return domain1 === domain2;
    } catch {
      return false;
    }
  }

  /**
   * Normalize URL for consistent comparison
   */
  static normalizeURL(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove trailing slash, fragments, and common tracking parameters
      urlObj.hash = '';
      urlObj.search = this.removeTrackingParams(urlObj.search);
      
      let normalized = urlObj.toString();
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      
      return normalized;
    } catch {
      return url;
    }
  }

  /**
   * Remove common tracking parameters from URL search params
   */
  private static removeTrackingParams(search: string): string {
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid'
    ];

    const params = new URLSearchParams(search);
    trackingParams.forEach(param => params.delete(param));
    
    return params.toString();
  }

  /**
   * Convert user input to valid URL
   */
  static processUserInput(input: string): string {
    const trimmed = input.trim();
    
    if (!trimmed) return '';
    
    // Already a valid URL
    if (this.isValidURL(trimmed)) {
      return trimmed;
    }
    
    // Add protocol if it looks like a domain
    if (trimmed.includes('.') && !trimmed.includes(' ')) {
      const withProtocol = 'https://' + trimmed;
      if (this.isValidURL(withProtocol)) {
        return withProtocol;
      }
    }
    
    // Treat as search query
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  /**
   * Extract all URLs from text
   */
  static extractURLsFromText(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"]{2,}/g;
    return text.match(urlRegex) || [];
  }

  /**
   * Check if URL is a search query result page
   */
  static isSearchResultsPage(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      
      // Google search
      if (domain.includes('google.') && urlObj.pathname.includes('/search')) {
        return true;
      }
      
      // Bing search
      if (domain.includes('bing.com') && urlObj.pathname.includes('/search')) {
        return true;
      }
      
      // DuckDuckGo
      if (domain.includes('duckduckgo.com')) {
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get page type based on URL patterns
   */
  static getPageType(url: string): 'article' | 'video' | 'social' | 'ecommerce' | 'search' | 'homepage' | 'other' {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      const path = urlObj.pathname.toLowerCase();
      
      // Search engines
      if (this.isSearchResultsPage(url)) {
        return 'search';
      }
      
      // Video platforms
      if (domain.includes('youtube.') || domain.includes('vimeo.') || domain.includes('twitch.')) {
        return 'video';
      }
      
      // Social media
      if (this.PROBLEMATIC_SITES.some(site => domain.includes(site))) {
        return 'social';
      }
      
      // E-commerce indicators
      if (path.includes('/product') || path.includes('/shop') || 
          domain.includes('amazon.') || domain.includes('ebay.') || 
          domain.includes('etsy.') || domain.includes('shopify.')) {
        return 'ecommerce';
      }
      
      // Article indicators
      if (path.includes('/article') || path.includes('/blog') || 
          path.includes('/news') || path.includes('/post')) {
        return 'article';
      }
      
      // Homepage (root path)
      if (path === '/' || path === '') {
        return 'homepage';
      }
      
      return 'other';
    } catch {
      return 'other';
    }
  }

  /**
   * Get friendly display name for URL
   */
  static getDisplayName(url: string): string {
    try {
      const urlObj = new URL(url);
      let domain = urlObj.hostname.replace(/^www\./, '');
      
      // Capitalize first letter
      domain = domain.charAt(0).toUpperCase() + domain.slice(1);
      
      // Remove .com, .org, etc. for shorter display
      domain = domain.replace(/\.(com|org|net|edu|gov)$/i, '');
      
      return domain;
    } catch {
      return url;
    }
  }

  /**
   * Build URL with query parameters
   */
  static buildURL(base: string, params: Record<string, string | number | boolean>): string {
    try {
      const url = new URL(base);
      
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
      
      return url.toString();
    } catch {
      return base;
    }
  }

  /**
   * Parse query parameters from URL
   */
  static parseQueryParams(url: string): Record<string, string> {
    try {
      const urlObj = new URL(url);
      const params: Record<string, string> = {};
      
      urlObj.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      
      return params;
    } catch {
      return {};
    }
  }

  /**
   * Check if URL appears to be an API endpoint
   */
  static isAPIEndpoint(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();
      
      return path.includes('/api/') || 
             path.includes('/v1/') || 
             path.includes('/v2/') ||
             path.includes('.json') ||
             path.includes('.xml') ||
             urlObj.hostname.startsWith('api.');
    } catch {
      return false;
    }
  }

  /**
   * Get URL without query parameters and fragments
   */
  static getCleanURL(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Check if URL is likely a file download
   */
  static isFileDownload(url: string): boolean {
    const fileExtensions = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.rar', '.tar', '.gz', '.7z',
      '.mp3', '.mp4', '.avi', '.mkv', '.mov',
      '.jpg', '.jpeg', '.png', '.gif', '.svg',
      '.exe', '.dmg', '.pkg', '.deb', '.rpm'
    ];
    
    const lowerURL = url.toLowerCase();
    return fileExtensions.some(ext => lowerURL.includes(ext));
  }

  /**
   * Generate a short hash for URL (useful for caching keys)
   */
  static hashURL(url: string): string {
    let hash = 0;
    const normalizedUrl = this.normalizeURL(url);
    
    for (let i = 0; i < normalizedUrl.length; i++) {
      const char = normalizedUrl.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }
} 