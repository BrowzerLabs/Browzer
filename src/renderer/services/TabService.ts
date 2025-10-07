import CONSTANTS from '../constants';
import { ITabService, TabInfo } from '../types';
import { URLUtils } from '../utils/urlUtils';

export class TabService implements ITabService {
  // Preview configuration
  private readonly PREVIEW_WIDTH = 320;
  private readonly PREVIEW_HEIGHT = 180;
  private readonly PREVIEW_CACHE_DURATION = 1000 * 60 * 5; // 5 minutes

  // State
  private tabs: TabInfo[] = [];
  private activeTabId: string = '';
  private faviconTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // DOM elements
  private tabsContainer: HTMLElement | null = null;
  private newTabBtn: HTMLElement | null = null;
  private webviewsContainer: HTMLElement | null = null;
  
  // Preview elements
  private tabPreview: HTMLElement | null = null;
  private tabPreviewCanvas: HTMLCanvasElement | null = null;
  private tabPreviewTitle: HTMLElement | null = null;
  private tabPreviewUrl: HTMLElement | null = null;
  private tabPreviewLoading: HTMLElement | null = null;

  // Preview state
  private previewTimeout: NodeJS.Timeout | null = null;
  private hidePreviewTimeout: NodeJS.Timeout | null = null;
  private previewCache = new Map<string, { dataUrl: string, timestamp: number }>();

  // Callbacks
  private newTabCallback?: () => void;
  private tabSelectCallback?: (tabId: string) => void;
  private tabCloseCallback?: (tabId: string) => void;

  constructor() {
    console.log('[TabService] Initializing tab Service...');
  }

  // ========================= INITIALIZATION =========================
  public initializeElements(): void {
    try {
      this.tabsContainer = document.getElementById('tabsContainer') as HTMLElement;
      this.newTabBtn = document.getElementById('newTabBtn') as HTMLElement;
      this.webviewsContainer = document.querySelector('.webviews-container') as HTMLElement;
      
      if (!this.tabsContainer || !this.newTabBtn || !this.webviewsContainer) {
        throw new Error('Required DOM elements not found');
      }

      this.initializeTabPreview();
      this.setupPreviewCacheCleanup();
      this.setupEventListeners();
      this.setupAutoSaveEvents();
      this.loadTabs();
    } catch (error) {
      console.error('[TabService] Failed to initialize elements:', error);
    }
  }

  private initializeTabPreview(): void {
    this.tabPreview = document.getElementById('tabPreview');
    this.tabPreviewCanvas = document.getElementById('tabPreviewCanvas') as HTMLCanvasElement;
    this.tabPreviewTitle = this.tabPreview?.querySelector('.tab-preview-title') as HTMLElement;
    this.tabPreviewUrl = this.tabPreview?.querySelector('.tab-preview-url') as HTMLElement;
    this.tabPreviewLoading = this.tabPreview?.querySelector('.tab-preview-loading') as HTMLElement;

    if (!this.tabPreview || !this.tabPreviewCanvas || !this.tabPreviewTitle || !this.tabPreviewUrl || !this.tabPreviewLoading) {
      console.warn('[TabService] Tab preview elements not found - preview functionality disabled');
      return;
    }

    // Set canvas dimensions
    this.tabPreviewCanvas.width = this.PREVIEW_WIDTH;
    this.tabPreviewCanvas.height = this.PREVIEW_HEIGHT;

  }

  private setupEventListeners(): void {
    if (this.newTabBtn) {
      // Remove existing listeners by cloning the element
      const newNewTabBtn = this.newTabBtn.cloneNode(true) as HTMLElement;
      this.newTabBtn.parentNode?.replaceChild(newNewTabBtn, this.newTabBtn);
      this.newTabBtn = newNewTabBtn;

      this.newTabBtn.addEventListener('click', () => {
        if (this.newTabCallback) {
          this.newTabCallback();
        }
      });
    }

    // Note: Keyboard shortcuts are handled in index.ts to avoid duplicate listeners
  }

  private setupAutoSaveEvents(): void {
    // Save when browser window is about to close
    window.addEventListener('beforeunload', () => {
      this.saveTabs();
      
      // Force synchronous save as backup
      try {
        if (this.tabs.length > 0) {
          const sessionData = {
            tabs: this.tabs.map(tab => ({
              url: tab.url,
              title: tab.title,
              isActive: tab.isActive,
              webviewId: tab.webviewId
            })),
            timestamp: Date.now(),
            activeTabId: this.activeTabId
          };
          localStorage.setItem(CONSTANTS.SAVED_TABS_KEY, JSON.stringify(sessionData));
        }
      } catch (err) {
        console.error('[TabService] Error in beforeunload save:', err);
      }
    });

    // Save when window loses focus
    window.addEventListener('blur', () => {
      if (this.tabs.length > 0) {
        this.saveTabs();
      }
    });

    // Save when visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.tabs.length > 0) {
        this.saveTabs();
      }
    });
  }

  private setupPreviewCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.previewCache.entries()) {
        if (now - value.timestamp > this.PREVIEW_CACHE_DURATION) {
          this.previewCache.delete(key);
        }
      }
    }, this.PREVIEW_CACHE_DURATION);
  }

  // ========================= TAB MANAGEMENT =========================
  public createTab(url: string = CONSTANTS.NEW_TAB_URL, title?: string): string | null {
    if (!this.tabsContainer || !this.webviewsContainer) {
      console.error('[TabService] Cannot create tab: containers not found');
      return null;
    }
  
    try {
      const tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const webviewId = 'webview-' + tabId;
  
      // Create tab element with loading state
      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.id = tabId;
      tab.dataset.webviewId = webviewId;
  
      const initialTitle = title || this.getInitialTitle(url);
      tab.innerHTML = `
        <div class="tab-favicon"></div>
        <span class="tab-title">${initialTitle}</span>
        <button class="tab-close">×</button>
      `;
  
      this.tabsContainer.appendChild(tab);
  
      // Create tab info
      const newTab: TabInfo = {
        id: tabId,
        url: url,
        title: initialTitle,
        isActive: false,
        webviewId: webviewId,
        history: [],
        currentHistoryIndex: -1,
        isProblematicSite: URLUtils.isProblematicSite(url)
      };
  
      this.tabs.push(newTab);
      this.setupTabEventListeners(tab, tabId);
      
      // Don't save immediately, let the webview creation complete first
      setTimeout(() => this.saveTabs(), 1000);
  
      return tabId;
    } catch (error) {
      console.error('[TabService] Error creating tab:', error);
      return null;
    }
  }

  private getInitialTitle(url: string): string {
    if (url.startsWith('file://browzer-settings')) {
      return '⚙️ Browzer Settings';
    }
    if (url === 'file://browzer-store') {
      return '🏪 Extension Store';
    }
    if (url === CONSTANTS.NEW_TAB_URL || url === 'about:blank') {
      return 'New Tab';
    }
    return 'Loading...';
  }
  
  private setupTabEventListeners(tab: HTMLElement, tabId: string): void {
    tab.addEventListener('click', (e) => {
      if (!e.target || !(e.target as HTMLElement).classList.contains('tab-close')) {
        if (this.tabSelectCallback) {
          this.tabSelectCallback(tabId);
        }
      }
    });

    const closeBtn = tab.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.tabCloseCallback) {
          this.tabCloseCallback(tabId);
        }
      });
    }

    if (this.tabPreview) {
      tab.addEventListener('mouseenter', () => {
        this.previewTimeout = setTimeout(() => {
          this.showTabPreview(tabId, tab);
        }, 500);
      });

      tab.addEventListener('mouseleave', () => {
        if (this.previewTimeout) {
          clearTimeout(this.previewTimeout);
          this.previewTimeout = null;
        }
        
        this.hidePreviewTimeout = setTimeout(() => {
          this.hideTabPreview();
        }, 200);
      });
    }
  }

  public selectTab(tabId: string): void {
    try {
      if (!this.tabs || this.tabs.length === 0) return;

      const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) return;
      
      const selectedTab = this.tabs[tabIndex];
      if (!selectedTab) return;
      
      this.activeTabId = tabId;
      this.tabs.forEach(tab => tab.isActive = tab.id === tabId);

      // Update DOM classes
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });

      const tabElement = document.getElementById(tabId);
      if (tabElement) {
        tabElement.classList.add('active');
      }

      // Handle webview visibility
      this.handleTabVisibility(selectedTab);
      
      // Update URL bar with current tab's URL
      const urlBar = document.getElementById('urlBar') as HTMLInputElement;
      if (urlBar && selectedTab.url) {
        urlBar.value = selectedTab.url;
      }

      // Update navigation buttons
      setTimeout(() => {
        const customEvent = new CustomEvent('tab-selected', { 
          detail: { tabId, url: selectedTab.url || '' } 
        });
        window.dispatchEvent(customEvent);
      }, 100);

    } catch (error) {
      console.error('[TabService] Error in selectTab:', error);
    }
  }

  private handleTabVisibility(tab: TabInfo): void {
    document.querySelectorAll('.webview').forEach((view: any) => {
      view.style.display = 'none';
      view.classList.remove('active');
    });

    const storeContainer = document.getElementById('extension-store-container');
    if (storeContainer) {
      storeContainer.style.display = 'none';
      storeContainer.classList.remove('active');
    }

    if (tab.url === 'file://browzer-store') {
      if (storeContainer) {
        storeContainer.style.display = 'block';
        storeContainer.classList.add('active');
      }
    } else {
      const webview = document.getElementById(tab.webviewId) as any;
      if (webview) {
        webview.style.display = 'flex';
        webview.classList.add('active');
      }
    }
  }

  public closeTab(tabId: string): void {
    try {
      if (this.tabs.length <= 1) {
        return;
      }
  
      const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) return;
  
      const webviewId = this.tabs[tabIndex].webviewId;
      const webview = document.getElementById(webviewId);
      const tabElement = document.getElementById(tabId);
  
      if (tabElement) tabElement.remove();
      if (webview) webview.remove();
  
      this.tabs.splice(tabIndex, 1);
  
      if (this.activeTabId === tabId && this.tabs.length > 0) {
        const newTabId = this.tabs[Math.max(0, tabIndex - 1)].id;
        this.selectTab(newTabId);
      }
  
      // Notify history service about tab closure
      window.dispatchEvent(new CustomEvent('tab-closed', { 
        detail: { tabId } 
      }));
  
      this.saveTabs();
    } catch (error) {
      console.error('[TabService] Error closing tab:', error);
    }
  }

  public cycleTab(direction: number): void {
    if (this.tabs.length <= 1) return;

    const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTabId);
    if (currentIndex === -1) return;

    let newIndex = currentIndex + direction;
    if (newIndex >= this.tabs.length) {
      newIndex = 0;
    } else if (newIndex < 0) {
      newIndex = this.tabs.length - 1;
    }

    this.selectTab(this.tabs[newIndex].id);
  }

  // ========================= TAB UPDATES =========================
  public async updateTabTitle(webview: any, title: string): Promise<void> {
    try {
      const tabId = this.getTabIdFromWebviewId(webview.id);
      if (!tabId) return;

      const tabTitle = document.querySelector(`#${tabId} .tab-title`) as HTMLElement;
      if (!tabTitle) return;

      let pageTitle = title || '';
      
      // Handle empty titles
      if (!pageTitle || pageTitle.trim() === '') {
        try {
          pageTitle = await webview.executeJavaScript('document.title') || 'New Tab';
        } catch (error) {
          pageTitle = 'New Tab';
        }
      }
      
      // Handle special pages
      const tab = this.tabs.find(t => t.id === tabId);
      if (tab) {
        if (tab.url.startsWith('file://browzer-settings')) {
          pageTitle = '⚙️ Browzer Settings';
        } else if (tab.url === 'file://browzer-store') {
          pageTitle = '🪟 Extension Store';
        }
        
        // Update tab object
        tab.title = pageTitle;
      }
      
      // Update DOM
      tabTitle.textContent = pageTitle;
      
      // Clear loading state if it exists
      const tabElement = document.getElementById(tabId);
      if (tabElement) {
        tabElement.classList.remove('loading');
      }
      
      this.saveTabs();
    } catch (error) {
      console.error('[TabService] Error updating tab title:', error);
    }
  }

  public updateTabUrl(tabId: string, url: string): void {
    if (!tabId || !url) return;
    
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.url = url;
      tab.isProblematicSite = URLUtils.isProblematicSite(url);
      
      // Update URL bar if this is the active tab
      if (tabId === this.activeTabId) {
        const urlBar = document.getElementById('urlBar') as HTMLInputElement;
        if (urlBar) {
          urlBar.value = url;
        }
      }
      
      this.saveTabs();
    }
  }

  public updateTabFavicon(webview: any, faviconUrl: string): void {
    try {
      const tabId = this.getTabIdFromWebviewId(webview.id);
      if (!tabId) return;
      
      const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`) as HTMLElement;
      const tabElement = document.getElementById(tabId);
      
      if (!faviconContainer) return;
      
      // Validate favicon URL
      if (!faviconUrl || faviconUrl === 'about:blank' || faviconUrl.trim() === '') {
        this.setDefaultFavicon(tabId);
        return;
      }
      
      // Create an image to test if the favicon loads successfully
      const img = new Image();
      
      // Set a timeout for favicon loading (Chrome-like behavior)
      const timeoutId = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        this.setDefaultFavicon(tabId);
      }, 5000);
      
      img.onload = () => {
        clearTimeout(timeoutId);
        // Clear the safety timeout from handleNavigationStart
        this.clearFaviconTimeout(tabId);
        // Favicon loaded successfully - remove loading state and show favicon
        if (tabElement) {
          tabElement.classList.remove('loading');
        }
        faviconContainer.style.backgroundImage = `url(${faviconUrl})`;
        faviconContainer.classList.add('has-favicon');
        faviconContainer.classList.remove('favicon-error', 'favicon-loading');
      };
      
      img.onerror = () => {
        clearTimeout(timeoutId);
        // Favicon failed to load - try default favicon.ico
        this.tryDefaultFavicon(webview, tabId);
      };
      
      // Mark as loading favicon
      // faviconContainer.classList.add('favicon-loading');
      img.src = faviconUrl;
    } catch (error) {
      console.error('[TabService] Error updating favicon:', error);
      const tabId = this.getTabIdFromWebviewId(webview.id);
      if (tabId) {
        this.setDefaultFavicon(tabId);
      }
    }
  }
  
  private async tryDefaultFavicon(webview: any, tabId: string): Promise<void> {
    try {
      // Try to get the origin and attempt /favicon.ico
      const url = webview.src || webview.getURL();
      if (!url || url === 'about:blank' || url.startsWith('file://')) {
        this.setDefaultFavicon(tabId);
        return;
      }
      
      const urlObj = new URL(url);
      const defaultFaviconUrl = `${urlObj.origin}/favicon.ico`;
      
      const img = new Image();
      const timeoutId = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        this.setDefaultFavicon(tabId);
      }, 3000);
      
      img.onload = () => {
        clearTimeout(timeoutId);
        // Clear the safety timeout from handleNavigationStart
        this.clearFaviconTimeout(tabId);
        const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`) as HTMLElement;
        const tabElement = document.getElementById(tabId);
        
        if (faviconContainer) {
          if (tabElement) {
            tabElement.classList.remove('loading');
          }
          faviconContainer.style.backgroundImage = `url(${defaultFaviconUrl})`;
          faviconContainer.classList.add('has-favicon');
          faviconContainer.classList.remove('favicon-error', 'favicon-loading');
        }
      };
      
      img.onerror = () => {
        clearTimeout(timeoutId);
        this.setDefaultFavicon(tabId);
      };
      
      img.src = defaultFaviconUrl;
    } catch (error) {
      this.setDefaultFavicon(tabId);
    }
  }
  
  private setDefaultFavicon(tabId: string): void {
    const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`) as HTMLElement;
    const tabElement = document.getElementById(tabId);
    
    if (faviconContainer) {
      // Don't override if favicon was already successfully loaded
      if (faviconContainer.classList.contains('has-favicon') && faviconContainer.style.backgroundImage) {
        // Favicon already loaded successfully, just remove loading states
        if (tabElement) {
          tabElement.classList.remove('loading');
        }
        faviconContainer.classList.remove('favicon-loading');
        return;
      }
      
      // Remove loading state and show default icon
      if (tabElement) {
        tabElement.classList.remove('loading');
      }
      faviconContainer.style.backgroundImage = '';
      faviconContainer.classList.remove('has-favicon', 'favicon-loading');
      faviconContainer.classList.add('favicon-error');
    }
  }
  
  public clearTabFavicon(tabId: string): void {
    try {
      const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`) as HTMLElement;
      if (faviconContainer) {
        faviconContainer.style.backgroundImage = '';
        faviconContainer.classList.remove('has-favicon', 'favicon-loading');
        faviconContainer.classList.add('favicon-error');
      }
    } catch (error) {
      console.error('[TabService] Error clearing favicon:', error);
    }
  }
  
  public setTabLoading(tabId: string, isLoading: boolean): void {
    try {
      const tabElement = document.getElementById(tabId);
      if (tabElement) {
        if (isLoading) {
          tabElement.classList.add('loading');
        } else {
          tabElement.classList.remove('loading');
        }
      }
    } catch (error) {
      console.error('[TabService] Error setting tab loading state:', error);
    }
  }
  
  public handleNavigationStart(webviewId: string): void {
    try {
      const tabId = this.getTabIdFromWebviewId(webviewId);
      if (!tabId) return;
      
      // Clear any existing timeout for this tab
      this.clearFaviconTimeout(tabId);
      
      const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`) as HTMLElement;
      if (!faviconContainer) return;
      
      // Mark as loading but keep existing favicon visible
      // faviconContainer.classList.add('favicon-loading');
      
      // Only show loading spinner if no favicon exists
      const hasFavicon = faviconContainer.classList.contains('has-favicon');
      const tabElement = document.getElementById(tabId);
      
      if (!hasFavicon && tabElement) {
        tabElement.classList.add('loading');
      }
      
      // Set a safety timeout to remove loading state after 10 seconds
      const timeoutId = setTimeout(() => {
        this.setDefaultFavicon(tabId);
        this.faviconTimeouts.delete(tabId);
      }, 10000);
      
      this.faviconTimeouts.set(tabId, timeoutId);
    } catch (error) {
      console.error('[TabService] Error handling navigation start:', error);
    }
  }
  
  public clearFaviconTimeout(tabId: string): void {
    if (this.faviconTimeouts.has(tabId)) {
      clearTimeout(this.faviconTimeouts.get(tabId)!);
      this.faviconTimeouts.delete(tabId);
    }
  }

  public clearStuckLoadingStates(): void {
    const loadingTabs = document.querySelectorAll('.tab.loading');
    
    if (loadingTabs.length > 0) {
      
      loadingTabs.forEach(tab => {
        tab.classList.remove('loading');
      });
    }
  }

  // ========================= PREVIEW FUNCTIONALITY =========================
  private async showTabPreview(tabId: string, tabElement: HTMLElement): Promise<void> {
    if (!this.tabPreview || !this.tabPreviewCanvas || !this.tabPreviewTitle || !this.tabPreviewUrl || !this.tabPreviewLoading) return;

    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    const webview = document.getElementById(tab.webviewId) as any;
    if (!webview) return;

    // Position the preview tooltip
    this.positionTabPreview(tabElement);

    // Update preview info
    this.tabPreviewTitle.textContent = tab.title || 'New Tab';
    this.tabPreviewUrl.textContent = tab.url || 'about:blank';

    // Show preview with loading state
    this.tabPreview.classList.remove('hidden');
    this.tabPreviewLoading.classList.remove('hidden');

    try {
      // Check cache first
      const cacheKey = tab.webviewId;
      const cached = this.previewCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp < this.PREVIEW_CACHE_DURATION)) {
        await this.drawImageToCanvas(cached.dataUrl);
        this.tabPreviewLoading.classList.add('hidden');
        return;
      }

      // Capture new screenshot
      if (webview && webview.capturePage) {
        const nativeImage = await webview.capturePage();
        const dataUrl = nativeImage.toDataURL();
        
        this.previewCache.set(cacheKey, { dataUrl, timestamp: now });
        
        await this.drawImageToCanvas(dataUrl);
        this.tabPreviewLoading.classList.add('hidden');
      } else {
        await this.captureWebviewScreenshot(webview, cacheKey);
        this.tabPreviewLoading.classList.add('hidden');
      }
    } catch (error) {
      this.drawFallbackPreview(tab);
      this.tabPreviewLoading.classList.add('hidden');
    }
  }

  private positionTabPreview(tabElement: HTMLElement): void {
    if (!this.tabPreview) return;

    const tabRect = tabElement.getBoundingClientRect();
    const previewRect = { width: 320, height: 240 };
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    let left = tabRect.left + (tabRect.width / 2) - (previewRect.width / 2);
    let top = tabRect.bottom + margin;

    // Reset position classes
    this.tabPreview.classList.remove('position-bottom', 'position-left', 'position-right');

    // Horizontal positioning
    if (left < margin) {
      left = margin;
    } else if (left + previewRect.width > viewportWidth - margin) {
      left = viewportWidth - previewRect.width - margin;
    }

    // Vertical positioning
    if (top + previewRect.height > viewportHeight - margin) {
      top = tabRect.top - previewRect.height - margin;
      this.tabPreview.classList.add('position-bottom');
    }

    this.tabPreview.style.left = `${left}px`;
    this.tabPreview.style.top = `${top}px`;
  }

  private drawImageToCanvas(dataUrl: string): Promise<void> {
    if (!this.tabPreviewCanvas) return Promise.resolve();

    const canvas = this.tabPreviewCanvas;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot get canvas context'));
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const aspectRatio = img.width / img.height;
        const canvasAspectRatio = canvas.width / canvas.height;

        let drawWidth, drawHeight, drawX, drawY;

        if (aspectRatio > canvasAspectRatio) {
          drawWidth = canvas.width;
          drawHeight = drawWidth / aspectRatio;
          drawX = 0;
          drawY = (canvas.height - drawHeight) / 2;
        } else {
          drawHeight = canvas.height;
          drawWidth = drawHeight * aspectRatio;
          drawX = (canvas.width - drawWidth) / 2;
          drawY = 0;
        }

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        resolve();
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = dataUrl;
    });
  }

  private async captureWebviewScreenshot(webview: any, cacheKey: string): Promise<void> {
    try {
      const script = `
        (function() {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          return canvas.toDataURL('image/png');
        })();
      `;

      const dataUrl = await webview.executeJavaScript(script);
      if (dataUrl) {
        this.previewCache.set(cacheKey, { dataUrl, timestamp: Date.now() });
        await this.drawImageToCanvas(dataUrl);
      } else {
        throw new Error('No data URL returned');
      }
    } catch (error) {
      throw error;
    }
  }

  private drawFallbackPreview(tab: TabInfo): void {
    if (!this.tabPreviewTitle || !this.tabPreviewUrl) return;
    this.tabPreviewTitle.textContent = tab.title || 'New Tab';
    this.tabPreviewUrl.textContent = tab.url || 'about:blank';
  }

  private hideTabPreview(): void {
    if (!this.tabPreview) return;

    this.tabPreview.classList.add('hidden');

    if (this.previewTimeout) {
      clearTimeout(this.previewTimeout);
      this.previewTimeout = null;
    }
    if (this.hidePreviewTimeout) {
      clearTimeout(this.hidePreviewTimeout);
      this.hidePreviewTimeout = null;
    }
  }

  // ========================= PERSISTENCE =========================
  public saveTabs(): void {
    try {
      if (!this.tabs || this.tabs.length === 0) {
        const existing = localStorage.getItem(CONSTANTS.SAVED_TABS_KEY);
        if (existing) {
          try {
            const parsed = JSON.parse(existing);
            if (parsed.tabs && parsed.tabs.length > 0) {
              return; // Keep existing saved tabs
            }
          } catch (e) {
            // Invalid saved data, continue with save
          }
        }
        return;
      }

      const tabsToSave = this.tabs.map((tab) => {
        try {
          const webview = document.getElementById(tab.webviewId) as any;
          const titleElem = document.querySelector(`#${tab.id} .tab-title`);

          return {
            url: webview && webview.src ? webview.src : tab.url,
            title: titleElem ? titleElem.textContent || 'New Tab' : tab.title,
            isActive: tab.isActive,
            webviewId: tab.webviewId
          };
        } catch (err) {
          return {
            url: tab.url || CONSTANTS.NEW_TAB_URL,
            title: tab.title || 'New Tab',
            isActive: tab.isActive,
            webviewId: tab.webviewId
          };
        }
      });

      const sessionData = {
        tabs: tabsToSave,
        timestamp: Date.now(),
        activeTabId: this.activeTabId
      };

      localStorage.setItem(CONSTANTS.SAVED_TABS_KEY, JSON.stringify(sessionData));
    } catch (err) {
      console.error('[TabService] Error saving tabs:', err);
    }
  }

  public loadTabs(): void {
    try {
      const saved = localStorage.getItem(CONSTANTS.SAVED_TABS_KEY);
      if (!saved) return;

      const sessionData = JSON.parse(saved);
      if (!sessionData.tabs || sessionData.tabs.length === 0) return;

    } catch (error) {
      console.error('[TabService] Error loading tabs:', error);
    }
  }

  public async enhancedRestoreTabs(): Promise<void> {
    if (!this.tabsContainer || !this.webviewsContainer) {
      console.log('[TabService] Containers not ready, creating default tab');
      setTimeout(() => {
        if (this.newTabCallback) {
          this.newTabCallback();
        }
      }, 100);
      return;
    }

    try {
      const savedSessionJSON = localStorage.getItem(CONSTANTS.SAVED_TABS_KEY);
      
      if (savedSessionJSON) {
        let savedSession = null;
        try {
          savedSession = JSON.parse(savedSessionJSON);
        } catch (parseErr) {
          console.error('[TabService] Invalid saved session data, removing');
          localStorage.removeItem(CONSTANTS.SAVED_TABS_KEY);
          this.createDefaultTab();
          return;
        }
        
        if (savedSession?.tabs?.length > 0) {
          console.log(`[TabService] Restoring ${savedSession.tabs.length} tabs`);
          
          // Clear current state
          this.tabs = [];
          this.tabsContainer.innerHTML = '';
          this.webviewsContainer.innerHTML = '';
          
          let activeTabToRestore: string | null = null;
          
          // Track the number of tabs we expect to restore
          const expectedTabCount = savedSession.tabs.length;
          let tabsProcessed = 0;
          
          // Restore each tab sequentially to avoid ERR_ABORTED errors
          for (let i = 0; i < savedSession.tabs.length; i++) {
            const tabData = savedSession.tabs[i];
            try {
              // Validate tab data
              if (!tabData || !tabData.url || tabData.url === 'about:blank') {
                tabsProcessed++;
                continue;
              }
              
              // Use the callback to create tab properly with webview
              if (this.newTabCallback) {
                this.newTabCallback(); // This will trigger createNewTab in the main app
                
                // Wait for tab to be created then update it
                setTimeout(() => {
                  // Helper function to check if all tabs are processed
                  const checkAllTabsProcessed = () => {
                    if (tabsProcessed === expectedTabCount) {
                      setTimeout(() => {
                        const tabToSelect = activeTabToRestore || this.tabs[0]?.id;
                        if (tabToSelect) {
                          this.selectTab(tabToSelect);
                          this.showToast(`Restored ${expectedTabCount} tabs from previous session`, 'success');
                        }
                      }, 200);
                    }
                  };
                  
                  const latestTab = this.tabs[this.tabs.length - 1];
                  if (latestTab) {
                    // Update title first (before loading URL)
                    if (tabData.title && tabData.title !== 'New Tab') {
                      const titleElement = document.querySelector(`#${latestTab.id} .tab-title`);
                      if (titleElement) {
                        titleElement.textContent = tabData.title;
                      }
                      latestTab.title = tabData.title;
                    }
                    
                    // Update URL if different from default
                    if (tabData.url && tabData.url !== CONSTANTS.NEW_TAB_URL) {
                      const webview = document.getElementById(latestTab.webviewId) as any;
                      if (webview) {
                        // Wait for webview to be fully ready
                        const waitForWebviewReady = (attempts = 0) => {
                          if (attempts > 20) {
                            console.warn('[TabService] Webview not ready after 20 attempts, skipping URL load');
                            tabsProcessed++;
                            checkAllTabsProcessed();
                            return;
                          }
                          
                          if (webview.getWebContentsId && webview.getWebContentsId() > 0) {
                            try {
                              webview.loadURL(tabData.url);
                              tabsProcessed++;
                              checkAllTabsProcessed();
                            } catch (loadErr) {
                              console.warn('[TabService] Failed to load URL for restored tab:', loadErr);
                              tabsProcessed++;
                              checkAllTabsProcessed();
                            }
                          } else {
                            setTimeout(() => waitForWebviewReady(attempts + 1), 100);
                          }
                        };
                        
                        waitForWebviewReady();
                      } else {
                        tabsProcessed++;
                        checkAllTabsProcessed();
                      }
                    } else {
                      tabsProcessed++;
                      checkAllTabsProcessed();
                    }
                    
                    if (tabData.isActive) {
                      activeTabToRestore = latestTab.id;
                    }
                  } else {
                    tabsProcessed++;
                    checkAllTabsProcessed();
                  }
                }, 250 * (i + 1)); // Increased stagger time to prevent ERR_ABORTED
              }
            } catch (tabErr) {
              console.warn('[TabService] Failed to restore individual tab:', tabErr);
              tabsProcessed++;
            }
          }
          
          return;
        }
      }
    } catch (err) {
      console.error('[TabService] Error in tab restoration:', err);
    }
    
    this.createDefaultTab();
  }

  private createDefaultTab(): void {
    if (this.newTabCallback) {
      this.newTabCallback();
    }
  }

  // ========================= GETTERS =========================
  public getActiveTabId(): string {
    return this.activeTabId;
  }

  public getActiveWebview(): any {
    if (!this.activeTabId) return null;
    const tab = this.tabs.find(tab => tab.id === this.activeTabId);
    if (!tab) return null;
    return document.getElementById(tab.webviewId);
  }

  public getAllTabs(): TabInfo[] {
    return [...this.tabs];
  }

  public getTabCount(): number {
    return this.tabs.length;
  }

  public getTabByWebviewId(webviewId: string): TabInfo | null {
    return this.tabs.find(tab => tab.webviewId === webviewId) || null;
  }
  
  public getTabById(tabId: string): TabInfo | null {
    return this.tabs.find(tab => tab.id === tabId) || null;
  }


  public getWebviewByTabId(tabId: string): any {
    const tab = this.getTabById(tabId);
    if (!tab) return null;
    return document.getElementById(tab.webviewId);
  }
  
  public getTabIdFromWebviewId(webviewId: string): string | null {
    const tab = this.getTabByWebviewId(webviewId);
    return tab ? tab.id : null;
  }

  public isWebviewReady(webview: any): boolean {
    try {
      return webview && 
             webview.nodeType === Node.ELEMENT_NODE && 
             webview.parentNode && 
             typeof webview.canGoBack === 'function' && 
             webview.getWebContentsId !== undefined;
    } catch (error) {
      return false;
    }
  }

  // ========================= CALLBACK REGISTRATION =========================
  public onNewTab(callback: () => void): void {
    this.newTabCallback = callback;
  }

  public onTabSelect(callback: (tabId: string) => void): void {
    this.tabSelectCallback = callback;
  }

  public onTabClose(callback: (tabId: string) => void): void {
    this.tabCloseCallback = callback;
  }

  // ========================= UTILITY METHODS =========================
  private showToast(message: string, type: string): void {
    const event = new CustomEvent('show-toast', {
      detail: { message, type }
    });
    window.dispatchEvent(event);
  }
  
  // ========================= CLEANUP =========================
  public destroy(): void {
    try {
      // Clear tabs array
      this.tabs = [];
      this.activeTabId = '';

      // Clear timeouts
      if (this.previewTimeout) {
        clearTimeout(this.previewTimeout);
        this.previewTimeout = null;
      }
      if (this.hidePreviewTimeout) {
        clearTimeout(this.hidePreviewTimeout);
        this.hidePreviewTimeout = null;
      }
      
      // Clear favicon timeouts
      for (const timeout of this.faviconTimeouts.values()) {
        clearTimeout(timeout);
      }
      this.faviconTimeouts.clear();

      // Clear cache
      this.previewCache.clear();

      // Remove event listeners by cloning elements
      if (this.newTabBtn) {
        const newNewTabBtn = this.newTabBtn.cloneNode(true) as HTMLElement;
        this.newTabBtn.parentNode?.replaceChild(newNewTabBtn, this.newTabBtn);
      }

      // Clear references
      this.tabsContainer = null;
      this.newTabBtn = null;
      this.webviewsContainer = null;
      this.tabPreview = null;
      this.tabPreviewCanvas = null;
      this.tabPreviewTitle = null;
      this.tabPreviewUrl = null;
      this.tabPreviewLoading = null;

      // Clear callbacks
      this.newTabCallback = undefined;
      this.tabSelectCallback = undefined;
      this.tabCloseCallback = undefined;
    } catch (error) {
      console.error('[TabService] Error during destruction:', error);
    }
  }
}