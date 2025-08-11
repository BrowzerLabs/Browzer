import { Tab } from '../../shared/types';
import { URLUtils } from '../utils/urlUtils';

export interface TabData extends Tab {
  history: string[];
  currentHistoryIndex: number;
  isProblematicSite?: boolean;
}

export class TabService {
  private tabs: TabData[] = [];
  private activeTabId: string | null = null;
  private tabsContainer: HTMLElement | null = null;
  private webviewsContainer: HTMLElement | null = null;
  private urlBar: HTMLInputElement | null = null;

  private readonly SAVED_TABS_KEY = 'saved_tabs';
  private readonly NEW_TAB_URL = 'about:blank';

  constructor() {
    this.initializeDOM();
  }

  private initializeDOM(): void {
    this.tabsContainer = document.getElementById('tabsContainer');
    this.webviewsContainer = document.querySelector('.webviews-container') as HTMLElement;
    this.urlBar = document.getElementById('urlBar') as HTMLInputElement;
  }

  async initialize(): Promise<void> {
    await this.restoreTabs();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    const newTabBtn = document.getElementById('newTabBtn');
    if (newTabBtn) {
      newTabBtn.addEventListener('click', () => {
        this.createNewTab();
      });
    }

    // Handle keyboard shortcuts for tab management
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 't':
            e.preventDefault();
            this.createNewTab();
            break;
          case 'w':
            e.preventDefault();
            if (this.activeTabId) {
              this.closeTab(this.activeTabId);
            }
            break;
          case 'Tab':
            if (e.shiftKey) {
              e.preventDefault();
              this.cycleTab(-1);
            } else {
              e.preventDefault();
              this.cycleTab(1);
            }
            break;
        }
      }
    });
  }

  private async restoreTabs(): Promise<void> {
    // console.log('Attempting to restore tabs');
    
    if (!this.tabsContainer || !this.webviewsContainer) {
      console.error('Cannot restore tabs: containers not found');
      setTimeout(() => {
        this.createNewTab();
      }, 100);
      return;
    }
    
    try {
      const savedTabsJSON = localStorage.getItem(this.SAVED_TABS_KEY);
      if (savedTabsJSON) {
        let savedTabs = [];
        try {
          savedTabs = JSON.parse(savedTabsJSON);
          // console.log('Restored tabs from localStorage:', savedTabs);
        } catch (parseErr) {
          console.error('Error parsing saved tabs JSON:', parseErr);
          localStorage.removeItem(this.SAVED_TABS_KEY);
          this.createNewTab();
          return;
        }
        
        if (savedTabs && savedTabs.length > 0) {
          this.tabs = [];
          this.tabsContainer.innerHTML = '';
          this.webviewsContainer.innerHTML = '';
          
          // console.log(`Attempting to restore ${savedTabs.length} tabs`);
          
          let restoredCount = 0;
          
          for (const tab of savedTabs) {
            try {
              if ((tab as any).url) {
                this.createNewTab((tab as any).url);
                restoredCount++;
              }
            } catch (tabErr) {
              console.error(`Failed to restore tab:`, tabErr);
            }
          }
          
          // console.log(`Successfully restored ${restoredCount} out of ${savedTabs.length} tabs`);
          
          if (restoredCount > 0) {
            return;
          }
        }
      }
    } catch (err) {
      console.error('Error in restoreTabs:', err);
    }
    
    // console.log('Creating default tab as fallback');
    this.createNewTab();
  }

  saveTabs(): void {
    try {
      if (!this.tabs || this.tabs.length === 0) {
        // console.log('No tabs to save');
        return;
      }
      
      const tabsToSave = this.tabs.map(tab => {
        try {
          const webview = tab.webviewId ? document.getElementById(tab.webviewId) as any : null;
          const titleElem = document.querySelector(`#${tab.id} .tab-title`);
          return {
            url: webview && webview.src ? webview.src : 'about:blank',
            title: titleElem ? titleElem.textContent : 'New Tab'
          };
        } catch (err) {
          console.error('Error saving individual tab:', err);
          return {
            url: 'about:blank',
            title: 'New Tab'
          };
        }
      });
      
      localStorage.setItem(this.SAVED_TABS_KEY, JSON.stringify(tabsToSave));
      // console.log(`Saved ${tabsToSave.length} tabs to localStorage`);
    } catch (err) {
      console.error('Error saving tabs:', err);
    }
  }

  createNewTab(url: string = this.NEW_TAB_URL): string | null {
    // console.log('createNewTab called with URL:', url);
    
    if (!this.tabsContainer || !this.webviewsContainer) {
      console.error('Cannot create tab: containers not found');
      return null;
    }
    
    const tabId = 'tab-' + Date.now();
    const webviewId = 'webview-' + tabId;
    
    try {
      // Create tab element
      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.id = tabId;
      tab.dataset.webviewId = webviewId;
      
      tab.innerHTML = `
        <div class="tab-favicon"></div>
        <span class="tab-title">New Tab</span>
        <button class="tab-close">×</button>
      `;
      
      this.tabsContainer.appendChild(tab);
      // console.log('Tab element created:', tabId);
      
      // Create webview
      const webview = document.createElement('webview') as any;
      webview.id = webviewId;
      webview.className = 'webview';

      // Configure webview
      this.configureWebview(webview, url);
      
      this.webviewsContainer.appendChild(webview);
      // console.log('Webview element created:', webviewId);
      
      // Add to tabs array
      const newTab: TabData = {
        id: tabId,
        url: url,
        title: 'New Tab',
        isActive: false,
        webviewId: webviewId,
        history: [],
        currentHistoryIndex: -1,
        isProblematicSite: URLUtils.isProblematicSite(url)
      };
      
      this.tabs.push(newTab);
      
      // Setup event listeners
      this.setupTabEventListeners(tab, tabId);
      this.setupWebviewEventListeners(webview);
      
      // Select this tab
      this.selectTab(tabId);
      
      // Save tab state
      this.saveTabs();
      
      // console.log('Tab created successfully:', tabId);
      return tabId;
    } catch (error) {
      console.error('Error creating tab:', error);
      return null;
    }
  }

  private configureWebview(webview: any, url: string): void {
    const needsSpecialSettings = url && URLUtils.isProblematicSite(url);
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const webPreferencesArray = [
      'contextIsolation=true',
      'nodeIntegration=false',
      'webSecurity=true',
      'allowRunningInsecureContent=false',
      'experimentalFeatures=true',
      'sandbox=false',
      'webgl=true',
      'plugins=true',
      'javascript=true',
      'images=true',
      'textAreasAreResizable=true',
      'backgroundThrottling=false'
    ];

    webview.setAttribute('useragent', userAgent);
    webview.setAttribute('webpreferences', webPreferencesArray.join(', '));
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('partition', needsSpecialSettings ? 'persist:compat-session' : 'persist:main-session');
    webview.setAttribute('enableremotemodule', 'false');
    webview.setAttribute('nodeintegrationinsubframes', 'false');

    if (url === this.NEW_TAB_URL) {
      webview.setAttribute('src', 'about:blank');
    } else {
      webview.setAttribute('src', url);
    }
  }

  private setupTabEventListeners(tab: HTMLElement, tabId: string): void {
    tab.addEventListener('click', (e) => {
      if (!e.target || !(e.target as HTMLElement).classList.contains('tab-close')) {
        this.selectTab(tabId);
      }
    });
    
    const closeBtn = tab.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // console.log('Close button clicked for tab:', tabId);
        this.closeTab(tabId);
      });
    }
  }

  private setupWebviewEventListeners(webview: any): void {
    webview.addEventListener('did-start-loading', () => {
      const webviewId = webview.id;
      if (webviewId) {
        const tabId = this.getTabIdFromWebview(webviewId);
        if (tabId) {
          const tab = document.getElementById(tabId);
          if (tab) {
            tab.classList.add('loading');
          }
        }
      }
    });

    webview.addEventListener('did-finish-load', () => {
      const webviewId = webview.id;
      if (webviewId) {
        const tabId = this.getTabIdFromWebview(webviewId);
        if (tabId) {
          const tab = document.getElementById(tabId);
          if (tab) {
            tab.classList.remove('loading');
          }
        }
      }
      
      if (this.urlBar) {
        this.urlBar.value = webview.src;
      }
      
      this.updateTabTitle(webview, webview.getTitle());
    });

    webview.addEventListener('page-title-updated', (e: any) => {
      this.updateTabTitle(webview, e.title);
    });

    webview.addEventListener('page-favicon-updated', (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        this.updateTabFavicon(webview, e.favicons[0]);
      }
    });
  }

  selectTab(tabId: string): void {
    // console.log('Selecting tab:', tabId);
    
    try {
      if (!this.tabs || this.tabs.length === 0) {
        // console.log('No tabs available, creating a new one');
        this.createNewTab();
        return;
      }
      
      const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) {
        console.error('Tab not found in tabs array:', tabId);
        if (this.tabs.length > 0) {
          this.selectTab(this.tabs[0].id);
        } else {
          this.createNewTab();
        }
        return;
      }
      
      // Update active tab
      this.activeTabId = tabId;
      this.tabs.forEach(tab => tab.isActive = tab.id === tabId);
      
      // Update UI
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      
      const tabElement = document.getElementById(tabId);
      if (tabElement) {
        tabElement.classList.add('active');
      }
      
      // Show corresponding webview
      document.querySelectorAll('.webview').forEach((view: any) => {
        view.style.display = 'none';
        view.classList.remove('active');
      });
      
      const tab = this.tabs[tabIndex];
      const webview = tab.webviewId ? document.getElementById(tab.webviewId) as any : null;
      
      if (webview) {
        webview.style.display = 'flex';
        webview.classList.add('active');
        
        if (this.urlBar) {
          this.urlBar.value = webview.src;
        }
      }
      
      // console.log('Tab selection complete:', tabId);
    } catch (error) {
      console.error('Error in selectTab:', error);
    }
  }

  closeTab(tabId: string): void {
    // console.log('closeTab called for tab:', tabId);
    
    if (this.tabs.length <= 1) {
      // console.log('Preventing closing the last tab, creating a new one instead');
      this.createNewTab();
      return;
    }
    
    try {
      const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) {
        console.error('Tab not found in tabs array:', tabId);
        return;
      }
      
      const webviewId = this.tabs[tabIndex].webviewId;
      const webview = webviewId ? document.getElementById(webviewId) : null;
      const tabElement = document.getElementById(tabId);
      
      if (tabElement) tabElement.remove();
      if (webview) webview.remove();
      
      this.tabs.splice(tabIndex, 1);
      // console.log('Tab removed from tabs array, remaining tabs:', this.tabs.length);
      
      if (this.activeTabId === tabId) {
        const newTabId = this.tabs[Math.max(0, tabIndex - 1)].id;
        this.selectTab(newTabId);
      }
      
      this.saveTabs();
      // console.log('Tab closed successfully:', tabId);
    } catch (error) {
      console.error('Error closing tab:', error);
    }
  }

  cycleTab(direction: number): void {
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

  private updateTabTitle(webview: any, title: string): void {
    const webviewId = webview.id;
    if (!webviewId) return;
    
    const tabId = this.getTabIdFromWebview(webviewId);
    if (!tabId) return;
    
    const tabTitleElement = document.querySelector(`#${tabId} .tab-title`);
    if (tabTitleElement) {
      tabTitleElement.textContent = title || 'New Tab';
    }
    
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.title = title || 'New Tab';
    }
  }

  private updateTabFavicon(webview: any, faviconUrl: string): void {
    const webviewId = webview.id;
    if (!webviewId) return;
    
    const tabId = this.getTabIdFromWebview(webviewId);
    if (!tabId) return;
    
    const faviconElement = document.querySelector(`#${tabId} .tab-favicon`) as HTMLElement;
    if (faviconElement && faviconUrl) {
      faviconElement.style.backgroundImage = `url("${faviconUrl}")`;
      faviconElement.style.backgroundSize = 'contain';
      faviconElement.style.backgroundRepeat = 'no-repeat';
      faviconElement.style.backgroundPosition = 'center';
    }
  }

  private getTabIdFromWebview(webviewId: string): string | null {
    const tab = this.tabs.find(t => t.webviewId === webviewId);
    return tab ? tab.id : null;
  }



  // Getters
  getTabs(): TabData[] {
    return this.tabs;
  }

  getActiveTab(): TabData | null {
    return this.tabs.find(tab => tab.id === this.activeTabId) || null;
  }

  getActiveWebview(): HTMLElement | null {
    const activeTab = this.getActiveTab();
    return activeTab && activeTab.webviewId ? document.getElementById(activeTab.webviewId) : null;
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  navigateActiveTab(url: string): void {
    const activeWebview = this.getActiveWebview() as any;
    if (activeWebview) {
      activeWebview.loadURL(url);
    }
  }

  reloadActiveTab(): void {
    const activeWebview = this.getActiveWebview() as any;
    if (activeWebview) {
      activeWebview.reload();
    }
  }

  goBackActiveTab(): void {
    const activeWebview = this.getActiveWebview() as any;
    if (activeWebview && activeWebview.canGoBack()) {
      activeWebview.goBack();
    }
  }

  goForwardActiveTab(): void {
    const activeWebview = this.getActiveWebview() as any;
    if (activeWebview && activeWebview.canGoForward()) {
      activeWebview.goForward();
    }
  }

  canGoBack(): boolean {
    const activeWebview = this.getActiveWebview() as any;
    return activeWebview ? activeWebview.canGoBack() : false;
  }

  canGoForward(): boolean {
    const activeWebview = this.getActiveWebview() as any;
    return activeWebview ? activeWebview.canGoForward() : false;
  }
} 