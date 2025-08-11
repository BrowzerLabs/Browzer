import { session, Session, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

interface FilterRule {
  pattern: string;
  type: 'block' | 'hide' | 'exception';
  domains?: string[];
  isRegex?: boolean;
}

export class AdBlocker {
  private enabled: boolean = true;
  private filterLists: FilterRule[] = [];
  private cssRules: string[] = [];
  private blockedDomains: Set<string> = new Set();
  private allowedDomains: Set<string> = new Set();
  private filtersPath: string;
  private customRulesPath: string;

  constructor() {
    // Use userData directory for filter storage in packaged apps
    this.filtersPath = path.join(app.getPath('userData'), 'adblock-filters');
    this.customRulesPath = path.join(this.filtersPath, 'custom-rules.json');
    
    // Ensure filters directory exists
    if (!fs.existsSync(this.filtersPath)) {
      fs.mkdirSync(this.filtersPath, { recursive: true });
    }
    
    this.loadBuiltinRules();
    this.loadCustomRules();
    this.downloadFilterLists();
  }

  /**
   * Initialize ad blocking for all sessions
   */
  public initialize(): void {
    // console.log('[AdBlocker] Initializing ad blocker...');
    
    // Set up blocking for default session
    this.setupSessionBlocking(session.defaultSession);
    
    // Set up blocking for auth session
    const authSession = session.fromPartition('persist:auth-session');
    this.setupSessionBlocking(authSession);
    
    // Set up blocking for main session
    const mainSession = session.fromPartition('persist:main-session');
    this.setupSessionBlocking(mainSession);
    
    // Set up blocking for compat session
    const compatSession = session.fromPartition('persist:compat-session');
    this.setupSessionBlocking(compatSession);
    
    // console.log(`[AdBlocker] Initialized with ${this.filterLists.length} filter rules`);
  }

  /**
   * Setup network request blocking for a session
   */
  private setupSessionBlocking(session: Session): void {
    // Block network requests
    session.webRequest.onBeforeRequest((details, callback) => {
      if (!this.enabled) {
        callback({ cancel: false });
        return;
      }

      const url = details.url;
      const shouldBlock = this.shouldBlockRequest(url, details.resourceType);
      
      if (shouldBlock) {
        // console.log(`[AdBlocker] Blocked: ${url}`);
        callback({ cancel: true });
      } else {
        callback({ cancel: false });
      }
    });

    // Inject CSS rules to hide elements
    session.webRequest.onHeadersReceived((details, callback) => {
      if (!this.enabled) {
        callback({});
        return;
      }

      const isHtmlPage = details.responseHeaders && 
        details.responseHeaders['content-type']?.some(ct => 
          ct.includes('text/html'));
      
      if (isHtmlPage && this.cssRules.length > 0) {
        // We'll inject CSS via the webview instead
        // This handler just ensures we have the right context
      }
      
      callback({});
    });
  }

  /**
   * Check if a request should be blocked
   */
  private shouldBlockRequest(url: string, resourceType: string): boolean {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      const fullUrl = url.toLowerCase();

      // Check if domain is explicitly allowed
      if (this.allowedDomains.has(domain)) {
        return false;
      }

      // Check blocked domains
      if (this.blockedDomains.has(domain)) {
        return true;
      }

      // Check filter rules
      for (const rule of this.filterLists) {
        if (rule.type === 'exception') continue;
        
        if (rule.type === 'block') {
          try {
            if (rule.isRegex) {
              // Validate regex before creating it
              if (this.isValidRegex(rule.pattern)) {
                const regex = new RegExp(rule.pattern, 'i');
                if (regex.test(fullUrl)) {
                  return true;
                }
              }
            } else {
              if (fullUrl.includes(rule.pattern.toLowerCase())) {
                return true;
              }
            }
          } catch (regexError) {
            // Skip invalid regex rules
            console.warn(`[AdBlocker] Skipping invalid regex rule: ${rule.pattern}`);
            continue;
          }
        }
      }

      // Block common ad-serving patterns
      const adPatterns = [
        'doubleclick.net',
        'googleadservices.com',
        'googlesyndication.com',
        'googletagservices.com',
        'amazon-adsystem.com',
        'facebook.com/tr',
        'outbrain.com',
        'taboola.com',
        'adsystem.com',
        '/ads/',
        '/ad?',
        'advertisement',
        'google-analytics.com',
        'googletagmanager.com'
      ];

      return adPatterns.some(pattern => fullUrl.includes(pattern));
    } catch (error) {
      console.error('[AdBlocker] Error checking URL:', error);
      return false;
    }
  }

  /**
   * Validate if a string is a valid regex pattern
   */
  private isValidRegex(pattern: string): boolean {
    try {
      new RegExp(pattern);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get CSS rules to inject into pages
   */
  public getCSSRules(): string {
    if (!this.enabled || this.cssRules.length === 0) {
      return '';
    }

    const css = this.cssRules.join(' ') + `
      /* Common ad selectors */
      [class*="ad-"], [class*="ads-"], [id*="ad-"], [id*="ads-"],
      .advertisement, .ads, .ad-banner, .ad-container,
      .google-ads, .adsbox, .adsbygoogle,
      iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
      div[class*="sponsor"], div[id*="sponsor"],
      .outbrain, .taboola, .promoted-content,
      [data-ad], [data-ads], .ad-slot, .banner-ad,
      .popup-ad, .floating-ad, .sidebar-ad,
      .header-ad, .footer-ad, .inline-ad {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        height: 0 !important;
        width: 0 !important;
      }
    `;

    return css;
  }

  /**
   * Load built-in blocking rules
   */
  private loadBuiltinRules(): void {
    // Common ad-serving domains
    const adDomains = [
      'doubleclick.net',
      'googleadservices.com',
      'googlesyndication.com',
      'amazon-adsystem.com',
      'facebook.com',
      'outbrain.com',
      'taboola.com',
      'media.net',
      'adsystem.com',
      'criteo.com',
      'bing.com/ads',
      'ads.yahoo.com'
    ];

    adDomains.forEach(domain => {
      this.blockedDomains.add(domain);
    });

    // Common CSS hiding rules
    this.cssRules = [
      '.ad { display: none !important; }',
      '.ads { display: none !important; }',
      '.advertisement { display: none !important; }',
      '.adsbygoogle { display: none !important; }',
      '.google-ads { display: none !important; }',
      '[class*="ad-banner"] { display: none !important; }',
      '[id*="google_ads"] { display: none !important; }'
    ];

    // console.log(`[AdBlocker] Loaded ${adDomains.length} built-in blocked domains`);
  }

  /**
   * Load custom user rules
   */
  private loadCustomRules(): void {
    try {
      if (fs.existsSync(this.customRulesPath)) {
        const customRules = JSON.parse(fs.readFileSync(this.customRulesPath, 'utf8'));
        
        if (customRules.blockedDomains) {
          customRules.blockedDomains.forEach((domain: string) => {
            this.blockedDomains.add(domain);
          });
        }
        
        if (customRules.allowedDomains) {
          customRules.allowedDomains.forEach((domain: string) => {
            this.allowedDomains.add(domain);
          });
        }
        
        if (customRules.cssRules) {
          this.cssRules.push(...customRules.cssRules);
        }
        
        // console.log('[AdBlocker] Loaded custom rules');
      }
    } catch (error) {
      console.error('[AdBlocker] Error loading custom rules:', error);
    }
  }

  /**
   * Download and parse EasyList filter
   */
  private async downloadFilterLists(): Promise<void> {
    // Check if we've already tried downloading recently (cache for 1 hour)
    const cacheFile = path.join(this.filtersPath, 'last-download.json');
    try {
      if (fs.existsSync(cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const hourAgo = Date.now() - (60 * 60 * 1000);
        if (cacheData.lastDownload > hourAgo) {
          // console.log('[AdBlocker] Using cached filter lists');
          return;
        }
      }
    } catch (error) {
      // Ignore cache errors
    }

    const filterUrls = [
      'https://easylist.to/easylist/easylist.txt',
      'https://easylist.to/easylist/easyprivacy.txt'
    ];

    let successCount = 0;
    for (const url of filterUrls) {
      try {
        await this.downloadFilterList(url);
        successCount++;
      } catch (error) {
        console.error(`[AdBlocker] Failed to download filter list from ${url}:`, error);
      }
    }

    // Update cache timestamp
    try {
      fs.writeFileSync(cacheFile, JSON.stringify({ 
        lastDownload: Date.now(),
        successCount 
      }));
    } catch (error) {
      // Ignore cache write errors
    }

    // console.log(`[AdBlocker] Downloaded ${successCount}/${filterUrls.length} filter lists`);
  }

  /**
   * Download a single filter list
   */
  private downloadFilterList(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // console.log(`[AdBlocker] Downloading filter list: ${url}`);
      
      // Set a timeout for the request
      const timeout = setTimeout(() => {
        reject(new Error('Download timeout'));
      }, 30000); // 30 second timeout
      
      const request = https.get(url, (response) => {
        let data = '';
        
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          clearTimeout(timeout);
          if (response.headers.location) {
            this.downloadFilterList(response.headers.location)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error('Redirect without location'));
          }
          return;
        }
        
        // Check for successful response
        if (response.statusCode !== 200) {
          clearTimeout(timeout);
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        
        response.on('data', (chunk) => {
          data += chunk;
          // Limit download size to prevent memory issues
          if (data.length > 10 * 1024 * 1024) { // 10MB limit
            clearTimeout(timeout);
            request.destroy();
            reject(new Error('Download too large'));
          }
        });
        
        response.on('end', () => {
          clearTimeout(timeout);
          try {
            this.parseFilterList(data);
            // console.log(`[AdBlocker] Successfully parsed filter list from ${url}`);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
        
        response.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      request.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      
      request.setTimeout(30000, () => {
        clearTimeout(timeout);
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Parse EasyList format filter rules
   */
  private parseFilterList(content: string): void {
    const lines = content.split('\n');
    let rulesAdded = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[')) {
        continue;
      }
      
      try {
        // Exception rules (@@)
        if (trimmed.startsWith('@@')) {
          const pattern = this.convertEasyListToPattern(trimmed.substring(2));
          if (pattern) {
            this.filterLists.push({
              pattern,
              type: 'exception'
            });
          }
          continue;
        }
        
        // Element hiding rules (##)
        if (trimmed.includes('##')) {
          const [domains, selector] = trimmed.split('##');
          if (selector && selector.trim()) {
            this.cssRules.push(`${selector.trim()} { display: none !important; }`);
            rulesAdded++;
          }
          continue;
        }
        
        // Network blocking rules
        if (!trimmed.includes('##') && !trimmed.includes('#@#')) {
          const pattern = this.convertEasyListToPattern(trimmed);
          if (pattern) {
            this.filterLists.push({
              pattern,
              type: 'block',
              isRegex: false // We'll use simple string matching for converted patterns
            });
            rulesAdded++;
          }
        }
      } catch (error) {
        // Skip malformed rules
        continue;
      }
    }
    
    // console.log(`[AdBlocker] Added ${rulesAdded} rules from filter list`);
  }

  /**
   * Convert EasyList pattern to a simple pattern for string matching
   */
  private convertEasyListToPattern(easyListPattern: string): string | null {
    try {
      let pattern = easyListPattern;
      
      // Skip very complex patterns that are likely to cause issues
      if (pattern.includes('$') || pattern.includes('|') || pattern.includes('^')) {
        // For now, skip complex patterns with options or special characters
        return null;
      }
      
      // Remove leading/trailing wildcards
      pattern = pattern.replace(/^\*+/, '').replace(/\*+$/, '');
      
      // Replace multiple wildcards with single ones
      pattern = pattern.replace(/\*+/g, '*');
      
      // Skip if pattern is too short or contains only wildcards
      if (pattern.length < 3 || pattern === '*' || pattern === '') {
        return null;
      }
      
      // For simple patterns, just return them for string matching
      // Remove wildcards for now - we'll do simple string contains matching
      pattern = pattern.replace(/\*/g, '');
      
      // Skip if the cleaned pattern is too short
      if (pattern.length < 3) {
        return null;
      }
      
      return pattern.toLowerCase();
    } catch (error) {
      return null;
    }
  }

  /**
   * Add a custom blocked domain
   */
  public addBlockedDomain(domain: string): void {
    this.blockedDomains.add(domain.toLowerCase());
    this.saveCustomRules();
    // console.log(`[AdBlocker] Added blocked domain: ${domain}`);
  }

  /**
   * Add a custom allowed domain  
   */
  public addAllowedDomain(domain: string): void {
    this.allowedDomains.add(domain.toLowerCase());
    this.saveCustomRules();
    // console.log(`[AdBlocker] Added allowed domain: ${domain}`);
  }

  /**
   * Remove a blocked domain
   */
  public removeBlockedDomain(domain: string): void {
    this.blockedDomains.delete(domain.toLowerCase());
    this.saveCustomRules();
    // console.log(`[AdBlocker] Removed blocked domain: ${domain}`);
  }

  /**
   * Remove an allowed domain
   */
  public removeAllowedDomain(domain: string): void {
    this.allowedDomains.delete(domain.toLowerCase());
    this.saveCustomRules();
    // console.log(`[AdBlocker] Removed allowed domain: ${domain}`);
  }

  /**
   * Save custom rules to file
   */
  private saveCustomRules(): void {
    try {
      const customRules = {
        blockedDomains: Array.from(this.blockedDomains),
        allowedDomains: Array.from(this.allowedDomains),
        cssRules: this.cssRules.filter(rule => !rule.includes('display: none !important;')) // Only save custom CSS
      };
      
      fs.writeFileSync(this.customRulesPath, JSON.stringify(customRules, null, 2));
    } catch (error) {
      console.error('[AdBlocker] Error saving custom rules:', error);
    }
  }

  /**
   * Enable/disable ad blocking
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // console.log(`[AdBlocker] Ad blocking ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if ad blocking is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get blocking statistics
   */
  public getStats(): { blockedDomains: number; cssRules: number; filterRules: number } {
    return {
      blockedDomains: this.blockedDomains.size,
      cssRules: this.cssRules.length,
      filterRules: this.filterLists.length
    };
  }
} 