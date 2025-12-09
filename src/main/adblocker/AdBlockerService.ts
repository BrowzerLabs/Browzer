import { session, WebContents } from 'electron';

export class AdBlockerService {
  private enabled = false;
  private blockedDomainsSet: Set<string>;
  private blockedPatterns: RegExp[];
  private registeredWebContents: Set<WebContents> = new Set();

  // Common ad-serving domains and trackers
  private readonly blockedDomains = [
    // Major ad networks
    'doubleclick.net',
    'googlesyndication.com',
    'googleadservices.com',
    'google-analytics.com',
    'googletagmanager.com',
    'googletagservices.com',
    'adsystem.com',
    'adservice.google.com',
    'pagead2.googlesyndication.com',
    
    // Social media trackers
    'facebook.net',
    'connect.facebook.net',
    'facebook.com/tr',
    'facebook.com/plugins',
    'graph.facebook.com',
    
    // Analytics and trackers
    'mixpanel.com',
    'segment.com',
    'segment.io',
    'hotjar.com',
    'clarity.ms',
    'mouseflow.com',
    'crazyegg.com',
    'amplitude.com',
    
    // Ad exchanges and networks
    'adnxs.com',
    'adsafeprotected.com',
    'advertising.com',
    'adbrite.com',
    'adbureau.net',
    'admob.com',
    'adriver.ru',
    'advertising.amazon.com',
    'ads.twitter.com',
    'ads.linkedin.com',
    'ads.youtube.com',
    
    // Tracking pixels
    'quantserve.com',
    'scorecardresearch.com',
    'pixel.facebook.com',
    'bat.bing.com',
    'analytics.twitter.com',
    
    // Pop-ups and malicious
    'popads.net',
    'popcash.net',
    'propeller-tracking.com',
    'outbrain.com',
    'taboola.com',
    'revcontent.com',
    'mgid.com',
    'disqus.com/count.js',
  ];

  // URL patterns to block
  private readonly blockedPatternStrings = [
    '/ads/',
    '/ad/',
    '/advert',
    '/banner',
    '/tracking',
    '/analytics',
    '/pixel',
    '/beacon',
    '/collect?',
    '/track?',
    '/impression',
    '/click?',
  ];

  // CSS selectors for common ad containers to hide
  private readonly cosmeticFilters = `
    /* Google Ads */
    ins.adsbygoogle,
    .adsbygoogle,
    .google-ad,
    .google-ads,
    iframe[id^="google_ads"],
    iframe[name^="google_ads"],
    
    /* Specific ad containers (not too broad to avoid false positives) */
    div[id^="ad-"],
    div[id^="ads-"],
    div[id^="google_ads"],
    div[class^="ad-container"],
    div[class^="ad-wrapper"],
    div[class^="ad-banner"],
    div[class^="ad-slot"],
    div[class^="ad-unit"],
    div[class^="ad-box"],
    div[class^="ad-section"],
    div[class^="ad-space"],
    div[class*="advertisement-"],
    div[class*="adsense"],
    [data-ad-slot],
    [data-ad-unit],
    [data-ad-name],
    div[id^="div-gpt-ad"],
    div[id*="dfp-ad"],
    
    /* Specific ad networks - be precise to avoid false positives */
    div.ad:not([class*="head"]):not([class*="read"]):not([class*="load"]),
    div.ads,
    .banner-ad,
    .banner_ad,
    .top-ad,
    .bottom-ad,
    .sidebar-ad,
    .header-ad,
    .footer-ad,
    .sponsored,
    .sponsoredContent,
    .sponsored-content,
    div[class^="sponsor-"],
    div[class$="-sponsor"]
    
    /* Outbrain, Taboola, etc */
    .taboola,
    .tbl-feed-container,
    .OUTBRAIN,
    [data-outbrain-container],
    .native-ad,
    .native-ads,
    
    /* Social widgets */
    .fb_iframe_widget,
    .twitter-timeline,
    
    /* Pop-ups and overlays */
    [class*="popup"],
    [class*="modal"][class*="ad"],
    [id*="popup"][id*="ad"],
    
    /* iFrames containing ads */
    iframe[src*="doubleclick"],
    iframe[src*="googlesyndication"],
    iframe[src*="googleadservices"],
    iframe[id*="ad"],
    iframe[class*="ad"],
    
    /* Lazy loaded ads */
    [data-google-query-id],
    
    /* Text-based "ADVERTISEMENT" labels */
    div:has(> span:only-child):has-text("ADVERTISEMENT"),
    div:has(> span:only-child):has-text("Advertisement"),
    div:has(> div:only-child):has-text("ADVERTISEMENT")
    {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      max-height: 0 !important;
      width: 0 !important;
      max-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      position: absolute !important;
      left: -9999px !important;
    }
    
    /* Also hide parent containers that only have ad children */
    div:has(> .adsbygoogle:only-child),
    div:has(> ins.adsbygoogle:only-child),
    div:has(> [id*="google_ads"]:only-child),
    section:has(> .ad:only-child),
    aside:has(> .ad:only-child) {
      display: none !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  `;

  constructor() {
    this.blockedDomainsSet = new Set(this.blockedDomains);
    this.blockedPatterns = this.blockedPatternStrings.map(pattern => 
      new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    );
  }

  public enable(): void {
    if (this.enabled) return;
    
    this.enabled = true;
    this.setupRequestInterceptor();
    this.injectCosmeticFiltersToAll();
  }

  public disable(): void {
    if (!this.enabled) return;
    
    this.enabled = false;
    this.removeRequestInterceptor();
    this.removeCosmeticFiltersFromAll();
  }

  public registerWebContents(webContents: WebContents): void {
    if (this.registeredWebContents.has(webContents)) return;
    
    // Don't register the browser UI view (it handles browzer:// pages)
    // Only register actual web tab views
    const url = webContents.getURL();
    if (url && (
      url.startsWith('browzer://') || 
      url.startsWith('file://') || 
      url.startsWith('about:') ||
      url.includes('#/settings') ||
      url.includes('#/passwords') ||
      url.includes('#/privacy') ||
      url.includes('#/appearance')
    )) {
      console.log('[AdBlocker] Skipping registration for internal page:', url);
      return;
    }
    
    this.registeredWebContents.add(webContents);
    
    if (this.enabled) {
      this.injectCosmeticFilters(webContents);
    }

    webContents.on('did-navigate', () => {
      const url = webContents.getURL();
      if (url && (url.startsWith('browzer://') || url.startsWith('file://') || url.includes('#/settings'))) {
        this.removeCosmeticFilters(webContents);
        return;
      }
      if (this.enabled) {
        this.injectCosmeticFilters(webContents);
      }
    });

    webContents.on('did-navigate-in-page', () => {
      const url = webContents.getURL();
      if (url && (url.startsWith('browzer://') || url.startsWith('file://') || url.includes('#/settings'))) {
        this.removeCosmeticFilters(webContents);
        return;
      }
      if (this.enabled) {
        this.injectCosmeticFilters(webContents);
      }
    });

    webContents.on('did-finish-load', () => {
      const url = webContents.getURL();
      if (url && (url.startsWith('browzer://') || url.startsWith('file://') || url.includes('#/settings'))) {
        this.removeCosmeticFilters(webContents);
        return;
      }
      if (this.enabled) {
        // Delay slightly to let ads attempt to load
        setTimeout(() => {
          this.injectCosmeticFilters(webContents);
        }, 500);
      }
    });

    webContents.on('destroyed', () => {
      this.registeredWebContents.delete(webContents);
    });
  }

  public unregisterWebContents(webContents: WebContents): void {
    this.registeredWebContents.delete(webContents);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private setupRequestInterceptor(): void {
    const filter = {
      urls: ['*://*/*']
    };

    session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
      if (!this.enabled) {
        callback({ cancel: false });
        return;
      }

      const url = details.url.toLowerCase();
      const shouldBlock = this.shouldBlockRequest(url);

      callback({ cancel: shouldBlock });
    });
  }

  private removeRequestInterceptor(): void {
    session.defaultSession.webRequest.onBeforeRequest(null);
  }

  private shouldBlockRequest(url: string): boolean {
    try {
      if (url.startsWith('browzer://') || url.startsWith('file://') || url.startsWith('about:') || url.startsWith('data:')) {
        return false;
      }

      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      for (const blockedDomain of this.blockedDomainsSet) {
        if (hostname === blockedDomain || hostname.endsWith(`.${blockedDomain}`)) {
          return true;
        }
      }

      const path = urlObj.pathname + urlObj.search;
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(path)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  public addBlockedDomain(domain: string): void {
    this.blockedDomainsSet.add(domain.toLowerCase());
  }

  public removeBlockedDomain(domain: string): void {
    this.blockedDomainsSet.delete(domain.toLowerCase());
  }

  private injectCosmeticFilters(webContents: WebContents): void {
    if (webContents.isDestroyed()) return;

    const url = webContents.getURL();
    if (!url || url.startsWith('browzer://') || url.startsWith('file://') || url.startsWith('about:') || url === '') {
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return;
    }

    const filterCode = `
      (function() {
        // CRITICAL: Exit immediately if this is an internal page
        const currentUrl = window.location.href || window.location.toString() || '';
        if (currentUrl.startsWith('browzer://') || 
            currentUrl.startsWith('file://') || 
            currentUrl.startsWith('about:') ||
            currentUrl.includes('#/settings') ||
            currentUrl.includes('#/passwords') ||
            currentUrl.includes('#/privacy') ||
            currentUrl.includes('#/appearance')) {
          return; // Never run on internal pages
        }
        
        // Additional check: Only run on http/https URLs
        if (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://')) {
          return;
        }
        
        // 1. Inject CSS
        const style = document.createElement('style');
        style.id = 'browzer-adblocker-style';
        style.textContent = \`${this.cosmeticFilters}\`;
        
        // Remove existing style if present
        const existing = document.getElementById('browzer-adblocker-style');
        if (existing) existing.remove();
        
        // Inject at the end of head or beginning of body
        (document.head || document.body || document.documentElement).appendChild(style);
        
        // 2. Surgically remove ONLY ad elements (not their parents with real content)
        function removeAdContainers() {
          const elementsToRemove = [];
          
          // Helper: Check if element contains real content (not just ads)
          function hasRealContent(el) {
            // Count visible text (excluding whitespace)
            const text = el.textContent?.trim() || '';
            const hasText = text.length > 20;
            
            // Count visible children that aren't ads
            const visibleChildren = Array.from(el.children).filter(child => {
              const style = window.getComputedStyle(child);
              const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
              const childId = child.id || '';
              const childClass = child.className || '';
              const isAd = childId.toLowerCase().includes('ad') || 
                          childClass.toString().toLowerCase().includes('ad');
              return isVisible && !isAd;
            });
            
            return hasText || visibleChildren.length > 1;
          }
          
          // Find specific ad elements (be conservative)
          const adSelectors = [
            'ins.adsbygoogle',
            '.adsbygoogle',
            'iframe[src*="doubleclick"]',
            'iframe[src*="googlesyndication"]',
            'iframe[src*="googleadservices"]',
            '[data-ad-slot]',
            '[data-ad-unit]',
            '[data-google-query-id]'
          ];
          
          adSelectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                if (!el.dataset.browzerProcessed) {
                  el.dataset.browzerProcessed = 'true';
                  elementsToRemove.push(el);
                }
              });
            } catch (e) {}
          });
          
          // Find containers that ONLY contain ads (not mixed content)
          const containers = document.querySelectorAll('div, section, aside');
          containers.forEach(el => {
            if (el.dataset.browzerProcessed) return;
            
            const id = el.id || '';
            const className = el.className || '';
            const idLower = id.toLowerCase();
            const classLower = className.toString().toLowerCase();
            
            // Very specific ad patterns for containers
            const strictAdPatterns = [
              'google_ads_iframe',
              'google_ads_frame',
              'div-gpt-ad',
              'dfp-ad-',
              'ad-slot-',
              'ad-unit-',
              'adsbygoogle',
              'ad-placeholder'
            ];
            
            const isStrictAd = strictAdPatterns.some(pattern => 
              idLower.includes(pattern) || classLower.includes(pattern)
            );
            
            // Only remove if it's a strict ad pattern AND has no real content
            if (isStrictAd && !hasRealContent(el)) {
              el.dataset.browzerProcessed = 'true';
              elementsToRemove.push(el);
              return;
            }
            
            // Check for containers with ONLY "ADVERTISEMENT" text
            const text = el.textContent?.trim() || '';
            const adTexts = ['ADVERTISEMENT', 'Advertisement', 'Sponsored', 'SPONSORED'];
            if (adTexts.includes(text) && text.length < 20 && el.children.length === 0) {
              el.dataset.browzerProcessed = 'true';
              elementsToRemove.push(el);
              return;
            }
          });
          
          // Remove identified elements
          elementsToRemove.forEach(el => {
            try {
              el.remove();
            } catch (e) {
              // Fallback: collapse it
              el.style.cssText = 'display:none!important;height:0!important;width:0!important;margin:0!important;padding:0!important;opacity:0!important;overflow:hidden!important;';
            }
          });
          
          // Clean up direct parent wrappers ONLY if they're now completely empty
          document.querySelectorAll('div, section, aside').forEach(el => {
            if (el.dataset.browzerChecked) return;
            el.dataset.browzerChecked = 'true';
            
            // Check if completely empty now
            const hasNoChildren = el.children.length === 0;
            const hasNoText = !el.textContent?.trim();
            
            if (hasNoChildren && hasNoText) {
              const id = el.id || '';
              const className = el.className || '';
              const idLower = id.toLowerCase();
              const classLower = className.toString().toLowerCase();
              
              // Only collapse if it has ad-related naming
              if (idLower.includes('ad') || classLower.includes('ad')) {
                el.style.cssText = 'display:none!important;height:0!important;margin:0!important;padding:0!important;';
              }
            }
          });
        }
        
        // Run immediately
        removeAdContainers();
        
        // Run again after DOM is fully loaded
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', removeAdContainers);
        }
        
        // Run periodically for dynamic content (ads load at different times)
        setTimeout(removeAdContainers, 500);
        setTimeout(removeAdContainers, 1000);
        setTimeout(removeAdContainers, 2000);
        setTimeout(removeAdContainers, 3000);
        setTimeout(removeAdContainers, 5000);
        
        // Watch for DOM changes and remove new ads immediately
        const observer = new MutationObserver((mutations) => {
          // Double-check we're still on a valid page (URL might have changed)
          const currentUrl = window.location.href || window.location.toString() || '';
          if (currentUrl.startsWith('browzer://') || 
              currentUrl.startsWith('file://') || 
              currentUrl.startsWith('about:') ||
              currentUrl.includes('#/settings') ||
              currentUrl.includes('#/passwords') ||
              currentUrl.includes('#/privacy') ||
              currentUrl.includes('#/appearance')) {
            observer.disconnect(); // Stop observing internal pages
            return;
          }
          
          let shouldCheck = false;
          for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
              // Check if any added nodes are ads
              mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                  const el = node;
                  const id = el.id || '';
                  const className = el.className || '';
                  if (id.toLowerCase().includes('ad') || 
                      className.toString().toLowerCase().includes('ad')) {
                    shouldCheck = true;
                  }
                }
              });
            }
          }
          if (shouldCheck) {
            setTimeout(removeAdContainers, 100);
          }
        });
        
        // Start observing
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
        }
      })();
    `;

    webContents.executeJavaScript(filterCode).catch(err => {
      console.error('[AdBlocker] Failed to inject cosmetic filters:', err);
    });
  }

  private removeCosmeticFilters(webContents: WebContents): void {
    if (webContents.isDestroyed()) return;

    const url = webContents.getURL();
    if (url.startsWith('browzer://') || url.startsWith('file://') || url.startsWith('about:')) {
      return;
    }

    const removeCode = `
      (function() {
        const style = document.getElementById('browzer-adblocker-style');
        if (style) style.remove();
        
        document.querySelectorAll('[data-browzer-processed]').forEach(el => {
          delete el.dataset.browzerProcessed;
        });
        document.querySelectorAll('[data-browzer-checked]').forEach(el => {
          delete el.dataset.browzerChecked;
        });
        
        // Note: We can't directly disconnect MutationObservers created in closures,
        // but removing the style and data attributes will prevent further interference
      })();
    `;

    webContents.executeJavaScript(removeCode).catch(err => {
      console.error('[AdBlocker] Failed to remove cosmetic filters:', err);
    });
  }

  private injectCosmeticFiltersToAll(): void {
    this.registeredWebContents.forEach(webContents => {
      this.injectCosmeticFilters(webContents);
    });
  }

  private removeCosmeticFiltersFromAll(): void {
    this.registeredWebContents.forEach(webContents => {
      this.removeCosmeticFilters(webContents);
    });
  }

  public getStats(): { blockedCount: number } {
    return { blockedCount: 0 };
  }
}

