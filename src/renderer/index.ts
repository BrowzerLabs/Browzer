import './styles.css';
import './components/ExtensionStore.css';
import { ExtensionStore } from './components/ExtensionStore';

// Import Electron APIs
const { ipcRenderer, shell } = require('electron');
const path = require('path');

// Global variables and state
let tabs: any[] = [];
let activeTabId: string | null = null;
let autoSummarizeEnabled = true;

// UI Elements
let urlBar: HTMLInputElement;
let backBtn: HTMLButtonElement;
let forwardBtn: HTMLButtonElement;
let reloadBtn: HTMLButtonElement;
let goBtn: HTMLButtonElement;
let historyBtn: HTMLButtonElement;
let extensionsBtn: HTMLButtonElement;
let modelSelector: HTMLSelectElement;
let runAgentBtn: HTMLButtonElement;
let agentResults: HTMLElement;
let tabsContainer: HTMLElement;
let newTabBtn: HTMLElement;
let webviewsContainer: HTMLElement;
let extensionsPanel: HTMLElement;
let closeExtensionsBtn: HTMLElement;

// Constants
const AUTO_SUMMARIZE_KEY = 'auto_summarize_enabled';
const SAVED_TABS_KEY = 'saved_tabs';
const HISTORY_STORAGE_KEY = 'browser_history';
const MEMORY_KEY = 'agent_memory';
const MAX_MEMORY_ITEMS = 100;
const NEW_TAB_URL = 'about:blank';
const HOMEPAGE_KEY = 'homepage_url';

let homepageUrl = localStorage.getItem(HOMEPAGE_KEY) || 'https://www.google.com';

// Problematic sites that should skip auto-summarization
const PROBLEMATIC_SITES = ['openrouter.ai', 'arcee-ai'];

function isProblematicSite(url: string): boolean {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return PROBLEMATIC_SITES.some(site => urlObj.hostname.includes(site));
  } catch (e) {
    console.error('Error parsing URL:', e);
    return false;
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, initializing browser...');
  
  console.log('[Init] Calling initializeUI...');
  initializeUI();
  console.log('[Init] Calling setupEventListeners...');
  setupEventListeners();
  console.log('[Init] Calling setupExtensionsPanel...');
  setupExtensionsPanel();
  console.log('[Init] Calling setupAgentControls...');
  setupAgentControls();
  console.log('[Init] Calling restoreTabs...');
  restoreTabs();
  console.log('[Init] Calling setupGlobalErrorHandler...');
  setupGlobalErrorHandler();
  
  console.log('Browser initialized successfully');
  console.log('[Init] Final autoSummarizeEnabled state:', autoSummarizeEnabled);
});

function initializeUI(): void {
  console.log('Initializing UI elements...');
  
  // Get UI elements
  urlBar = document.getElementById('urlBar') as HTMLInputElement;
  backBtn = document.getElementById('backBtn') as HTMLButtonElement;
  forwardBtn = document.getElementById('forwardBtn') as HTMLButtonElement;
  reloadBtn = document.getElementById('reloadBtn') as HTMLButtonElement;
  goBtn = document.getElementById('goBtn') as HTMLButtonElement;
  historyBtn = document.getElementById('historyBtn') as HTMLButtonElement;
  extensionsBtn = document.getElementById('extensionsBtn') as HTMLButtonElement;
  modelSelector = document.getElementById('modelSelector') as HTMLSelectElement;
  runAgentBtn = document.getElementById('runAgentBtn') as HTMLButtonElement;
  agentResults = document.getElementById('agentResults') as HTMLElement;
  tabsContainer = document.getElementById('tabsContainer') as HTMLElement;
  newTabBtn = document.getElementById('newTabBtn') as HTMLElement;
  webviewsContainer = document.querySelector('.webviews-container') as HTMLElement;
  extensionsPanel = document.getElementById('extensionsPanel') as HTMLElement;
  closeExtensionsBtn = document.getElementById('closeExtensionsBtn') as HTMLElement;

  // Load auto-summarize setting
  const savedAutoSummarize = localStorage.getItem(AUTO_SUMMARIZE_KEY);
  console.log('[Init] AUTO_SUMMARIZE_KEY:', AUTO_SUMMARIZE_KEY);
  console.log('[Init] savedAutoSummarize from localStorage:', savedAutoSummarize);
  console.log('[Init] autoSummarizeEnabled before:', autoSummarizeEnabled);
  
  if (savedAutoSummarize !== null) {
    autoSummarizeEnabled = JSON.parse(savedAutoSummarize);
  }
  
  console.log('[Init] autoSummarizeEnabled after:', autoSummarizeEnabled);
  
  // Update auto-summarize toggle
  const autoSummarizeToggle = document.getElementById('autoSummarizeToggle') as HTMLInputElement;
  console.log('[Init] autoSummarizeToggle found during init:', !!autoSummarizeToggle);
  if (autoSummarizeToggle) {
    autoSummarizeToggle.checked = autoSummarizeEnabled;
    console.log('[Init] Set toggle checked to:', autoSummarizeEnabled);
  }
}

function setupEventListeners(): void {
  console.log('Setting up event listeners...');

  // Navigation buttons
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const webview = getActiveWebview();
      if (webview && webview.canGoBack()) {
        webview.goBack();
      }
    });
  }

  if (forwardBtn) {
    forwardBtn.addEventListener('click', () => {
      const webview = getActiveWebview();
      if (webview && webview.canGoForward()) {
        webview.goForward();
      }
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      const webview = getActiveWebview();
      if (webview) {
        webview.reload();
      }
    });
  }

  if (goBtn) {
    goBtn.addEventListener('click', navigateToUrl);
  }

  // URL bar navigation
  if (urlBar) {
    urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        navigateToUrl();
      }
    });
  }

  // History button
  if (historyBtn) {
    historyBtn.addEventListener('click', showHistoryPage);
  }

  // Settings button (renamed from Extensions)
  if (extensionsBtn) {
    extensionsBtn.addEventListener('click', () => {
      if (extensionsPanel) {
        extensionsPanel.classList.toggle('hidden');
      }
    });
  }

  // New Extensions button
  const newExtensionsBtn = document.getElementById('newExtensionsBtn') as HTMLButtonElement;
  if (newExtensionsBtn) {
    newExtensionsBtn.addEventListener('click', () => {
      // For now, just open the extensions section of the panel
      if (extensionsPanel) {
        extensionsPanel.classList.remove('hidden');
        // Scroll to extensions section
        const extensionsSection = document.querySelector('.extensions-management');
        if (extensionsSection) {
          extensionsSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  }

  if (closeExtensionsBtn) {
    closeExtensionsBtn.addEventListener('click', () => {
      if (extensionsPanel) {
        extensionsPanel.classList.add('hidden');
      }
    });
  }

  // Agent controls
  if (runAgentBtn) {
    runAgentBtn.addEventListener('click', executeAgent);
  }

  // New tab button
  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => {
      createNewTab();
    });
  }

  // Auto-summarize toggle
  const autoSummarizeToggle = document.getElementById('autoSummarizeToggle') as HTMLInputElement;
  console.log('[Toggle Setup] autoSummarizeToggle found:', !!autoSummarizeToggle);
  if (autoSummarizeToggle) {
    console.log('[Toggle Setup] Initial toggle state:', autoSummarizeToggle.checked);
    console.log('[Toggle Setup] autoSummarizeEnabled variable:', autoSummarizeEnabled);
    autoSummarizeToggle.addEventListener('change', (e) => {
      autoSummarizeEnabled = (e.target as HTMLInputElement).checked;
      localStorage.setItem(AUTO_SUMMARIZE_KEY, JSON.stringify(autoSummarizeEnabled));
      console.log('Auto-summarize toggled to:', autoSummarizeEnabled);
    });
  } else {
    console.log('[Toggle Setup] autoSummarizeToggle element not found in DOM');
  }

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key) {
        case 't':
          e.preventDefault();
          createNewTab();
          break;
        case 'w':
          e.preventDefault();
          if (activeTabId) {
            closeTab(activeTabId);
          }
          break;
        case 'h':
          e.preventDefault();
          showHistoryPage();
          break;
        case 'l':
          e.preventDefault();
          if (urlBar) {
            urlBar.focus();
            urlBar.select();
          }
          break;
        case 'Tab':
          e.preventDefault();
          cycleTab(e.shiftKey ? -1 : 1);
          break;
      }
    }
  });

  // Menu action listeners
  ipcRenderer.on('menu-new-tab', () => {
    createNewTab();
  });
  
  ipcRenderer.on('menu-close-tab', () => {
    if (activeTabId) {
      closeTab(activeTabId);
    }
  });
  
  ipcRenderer.on('menu-show-history', () => {
    showHistoryPage();
  });
  
  ipcRenderer.on('menu-reload', () => {
    const webview = getActiveWebview();
    if (webview) {
      webview.reload();
    }
  });
  
  ipcRenderer.on('menu-go-back', () => {
    const webview = getActiveWebview();
    if (webview && webview.canGoBack()) {
      webview.goBack();
    }
  });
  
  ipcRenderer.on('menu-go-forward', () => {
    const webview = getActiveWebview();
    if (webview && webview.canGoForward()) {
      webview.goForward();
    }
  });


}

function setupGlobalErrorHandler(): void {
  window.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);
    
    if (event.error && event.error.stack) {
      console.error('Error stack:', event.error.stack);
    }
    
    try {
      showToast('Error: ' + (event.error ? event.error.message : 'Unknown error'));
    } catch (e) {
      console.error('Could not show toast, error occurred before UI initialized:', e);
    }
  });
}

function navigateToUrl(): void {
  if (!urlBar) return;

  let url = urlBar.value.trim();
  if (!url) return;

  // Handle special internal URLs
  if (url === 'file://browzer-store' || url === 'browzer-store') {
    showExtensionStore();
    return;
  }

  // If it looks like a search query rather than a URL, use Google search
  if (!url.includes('.') || url.includes(' ')) {
    url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
  } 
  // Add https:// if missing
  else if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const webview = getActiveWebview();
  if (webview) {
    webview.loadURL(url);
  }
}

function updateNavigationButtons(): void {
  const webview = getActiveWebview();
  if (webview) {
    if (backBtn) {
      backBtn.disabled = !webview.canGoBack();
    }
    if (forwardBtn) {
      forwardBtn.disabled = !webview.canGoForward();
    }
  } else {
    if (backBtn) {
      backBtn.disabled = true;
    }
    if (forwardBtn) {
      forwardBtn.disabled = true;
    }
  }
}

function getActiveWebview(): any {
  if (!activeTabId) return null;
  const tab = tabs.find(tab => tab.id === activeTabId);
  if (!tab) return null;
  return document.getElementById(tab.webviewId);
}

function cycleTab(direction: number): void {
  if (tabs.length <= 1) return;
  
  const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
  if (currentIndex === -1) return;
  
  let newIndex = currentIndex + direction;
  if (newIndex >= tabs.length) {
    newIndex = 0;
  } else if (newIndex < 0) {
    newIndex = tabs.length - 1;
  }
  
  selectTab(tabs[newIndex].id);
}

function showToast(message: string, type: string = 'info'): void {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast!.className = 'toast';
  }, 3000);
}

// ========================= TAB MANAGEMENT =========================

function restoreTabs(): void {
  console.log('Attempting to restore tabs');
  
  if (!tabsContainer || !webviewsContainer) {
    console.error('Cannot restore tabs: containers not found');
    setTimeout(() => {
      createNewTab();
    }, 100);
    return;
  }
  
  try {
    const savedTabsJSON = localStorage.getItem(SAVED_TABS_KEY);
    if (savedTabsJSON) {
      let savedTabs = [];
      try {
        savedTabs = JSON.parse(savedTabsJSON);
        console.log('Restored tabs from localStorage:', savedTabs);
      } catch (parseErr) {
        console.error('Error parsing saved tabs JSON:', parseErr);
        localStorage.removeItem(SAVED_TABS_KEY);
        createNewTab();
        return;
      }
      
      if (savedTabs && savedTabs.length > 0) {
        tabs = [];
        tabsContainer.innerHTML = '';
        webviewsContainer.innerHTML = '';
        
        console.log(`Attempting to restore ${savedTabs.length} tabs`);
        
        let restoredCount = 0;
        
        for (const tab of savedTabs) {
          try {
            if ((tab as any).url) {
              createNewTab((tab as any).url);
              restoredCount++;
            }
          } catch (tabErr) {
            console.error(`Failed to restore tab:`, tabErr);
          }
        }
        
        console.log(`Successfully restored ${restoredCount} out of ${savedTabs.length} tabs`);
        
        if (restoredCount > 0) {
          return;
        }
      }
    }
  } catch (err) {
    console.error('Error in restoreTabs:', err);
  }
  
  console.log('Creating default tab as fallback');
  createNewTab();
}

function saveTabs(): void {
  try {
    if (!tabs || tabs.length === 0) {
      console.log('No tabs to save');
      return;
    }
    
    const tabsToSave = tabs.map(tab => {
      try {
        const webview = document.getElementById(tab.webviewId);
        const titleElem = document.querySelector(`#${tab.id} .tab-title`);
        return {
          url: webview && (webview as any).src ? (webview as any).src : 'about:blank',
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
    
    localStorage.setItem(SAVED_TABS_KEY, JSON.stringify(tabsToSave));
    console.log(`Saved ${tabsToSave.length} tabs to localStorage`);
  } catch (err) {
    console.error('Error saving tabs:', err);
  }
}

function createNewTab(url: string = NEW_TAB_URL): string | null {
  console.log('createNewTab called with URL:', url);
  
  if (!tabsContainer || !webviewsContainer) {
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
    
    tabsContainer.appendChild(tab);
    console.log('Tab element created:', tabId);
    
    // Create webview
    const webview = document.createElement('webview') as any;
    webview.id = webviewId;
    webview.className = 'webview';

    // Configure webview
    configureWebview(webview, url);
    
    webviewsContainer.appendChild(webview);
    console.log('Webview element created:', webviewId);
    
    // Add to tabs array
    const newTab = {
      id: tabId,
      url: url,
      title: 'New Tab',
      isActive: false,
      webviewId: webviewId,
      history: [],
      currentHistoryIndex: -1,
      isProblematicSite: isProblematicSite(url)
    };
    
    tabs.push(newTab);
    
    // Setup event listeners
    setupTabEventListeners(tab, tabId);
    setupWebviewEvents(webview);
    
    // Select this tab
    selectTab(tabId);
    
    // Save tab state
    saveTabs();
    
    console.log('Tab created successfully:', tabId);
    return tabId;
  } catch (error) {
    console.error('Error creating tab:', error);
    return null;
  }
}

function configureWebview(webview: any, url: string): void {
  const needsSpecialSettings = url && isProblematicSite(url);
  const isLocalSettingsPage = url && url.startsWith('file://') && url.includes('settings-');
  
  // Enhanced user agent that's more likely to be accepted by OAuth providers
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0';

  // Enhanced web preferences for OAuth compatibility
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
    'backgroundThrottling=false',
    // OAuth-specific features
    'navigateOnDragDrop=false',
    'spellcheck=true',
    'enablePreferredSizeMode=false',
    'enableBlinkFeatures=',
    'disableBlinkFeatures=',
    // Security features - allow file access for settings pages
    `allowFileAccessFromFileUrls=${isLocalSettingsPage}`,
    `allowUniversalAccessFromFileUrls=${isLocalSettingsPage}`,
    'enableCrossDomainRequestsForMobileApps=false',
    // Essential for OAuth flows
    'nativeWindowOpen=true',
    'contextMenu=true',
    'devTools=true'
  ];

  // Set comprehensive attributes for OAuth compatibility
  webview.setAttribute('useragent', userAgent);
  webview.setAttribute('webpreferences', webPreferencesArray.join(', '));
  webview.setAttribute('allowpopups', 'true');
  webview.setAttribute('disablewebsecurity', isLocalSettingsPage ? 'true' : 'false');
  webview.setAttribute('nodeintegration', 'false');
  webview.setAttribute('nodeintegrationinsubframes', 'false');
  webview.setAttribute('plugins', 'true');
  webview.setAttribute('disableguestresize', 'false');
  webview.setAttribute('preload', '');
  
  // Enhanced partition strategy for better authentication support
  if (isLocalSettingsPage) {
    webview.setAttribute('partition', 'persist:settings-session');
  } else if (needsSpecialSettings) {
    webview.setAttribute('partition', 'persist:compat-session');
  } else {
    // Use a dedicated authentication session for OAuth flows
    const isAuthFlow = url && (
      url.includes('accounts.google.com') ||
      url.includes('login.microsoftonline.com') ||
      url.includes('oauth') ||
      url.includes('auth') ||
      url.includes('signin') ||
      url.includes('login')
    );
    
    if (isAuthFlow) {
      webview.setAttribute('partition', 'persist:auth-session');
    } else {
      webview.setAttribute('partition', 'persist:main-session');
    }
  }

  // Set the URL
  if (url === NEW_TAB_URL) {
    webview.setAttribute('src', homepageUrl);
  } else {
    webview.setAttribute('src', url);
  }
}

function setupTabEventListeners(tab: HTMLElement, tabId: string): void {
  tab.addEventListener('click', (e) => {
    if (!e.target || !(e.target as HTMLElement).classList.contains('tab-close')) {
      selectTab(tabId);
    }
  });
  
  const closeBtn = tab.querySelector('.tab-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Close button clicked for tab:', tabId);
      closeTab(tabId);
    });
  }
}

function setupWebviewEvents(webview: any): void {
  console.log('Setting up webview events for webview:', webview.id);
  
  webview.addEventListener('did-start-loading', () => {
    const webviewId = webview.id;
    if (webviewId) {
      const tabId = getTabIdFromWebview(webviewId);
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
      const tabId = getTabIdFromWebview(webviewId);
      if (tabId) {
        const tab = document.getElementById(tabId);
        if (tab) {
          tab.classList.remove('loading');
        }
      }
    }
    
    if (urlBar) {
      urlBar.value = webview.src;
    }
    
    updateTabTitle(webview, webview.getTitle());
    updateNavigationButtons();
    
    // Track page visit in history
    const url = webview.src;
    const title = webview.getTitle();
    if (url && url !== 'about:blank' && !url.startsWith('file://')) {
      trackPageVisit(url, title);
    }
    
    // Auto-summarize if enabled
    console.log('[Auto-summarize Check] autoSummarizeEnabled:', autoSummarizeEnabled);
    console.log('[Auto-summarize Check] url:', url);
    console.log('[Auto-summarize Check] url.startsWith("http"):', url && url.startsWith('http'));
    
    if (autoSummarizeEnabled && url && url.startsWith('http')) {
      const tabId = getTabIdFromWebview(webview.id);
      const isActiveTab = tabId === activeTabId;
      const isProblematic = isProblematicSite(url);
      
      console.log('[Auto-summarize Check] tabId:', tabId);
      console.log('[Auto-summarize Check] activeTabId:', activeTabId);
      console.log('[Auto-summarize Check] isActiveTab:', isActiveTab);
      console.log('[Auto-summarize Check] isProblematicSite:', isProblematic);
      
      if (isActiveTab && !isProblematic) {
        console.log('Auto-summarize enabled for active tab, will summarize:', url);
        setTimeout(() => {
          autoSummarizePage(url, webview);
        }, 1500);
      } else {
        console.log('[Auto-summarize] Conditions not met - isActiveTab:', isActiveTab, 'isProblematic:', isProblematic);
      }
    } else {
      console.log('[Auto-summarize] Not enabled or invalid URL - enabled:', autoSummarizeEnabled, 'valid URL:', !!(url && url.startsWith('http')));
    }
  });

  webview.addEventListener('page-title-updated', (e: any) => {
    updateTabTitle(webview, e.title);
  });

  webview.addEventListener('page-favicon-updated', (e: any) => {
    if (e.favicons && e.favicons.length > 0) {
      updateTabFavicon(webview, e.favicons[0]);
    }
  });

  webview.addEventListener('new-window', (e: any) => {
    console.log('New window requested:', e.url);
    
    // For OAuth flows, open in the same tab to maintain session
    const isAuthFlow = e.url && (
      e.url.includes('accounts.google.com') ||
      e.url.includes('login.microsoftonline.com') ||
      e.url.includes('oauth') ||
      e.url.includes('auth') ||
      e.url.includes('signin') ||
      e.url.includes('login') ||
      e.url.includes('authorize')
    );
    
    if (isAuthFlow) {
      console.log('OAuth flow detected, navigating in current tab');
      webview.src = e.url;
    } else {
      console.log('Opening in new tab');
      createNewTab(e.url);
    }
  });

  // Enhanced event handlers for OAuth and security
  webview.addEventListener('will-navigate', (e: any) => {
    console.log('Navigation will start to:', e.url);
    // Update URL bar during navigation
    if (urlBar && getTabIdFromWebview(webview.id) === activeTabId) {
      urlBar.value = e.url;
    }
  });

  webview.addEventListener('did-navigate', (e: any) => {
    console.log('Navigation completed to:', e.url);
    // Final URL update after navigation
    if (urlBar && getTabIdFromWebview(webview.id) === activeTabId) {
      urlBar.value = e.url;
    }
  });

  webview.addEventListener('did-navigate-in-page', (e: any) => {
    console.log('In-page navigation to:', e.url);
    // Handle hash/history changes (common in OAuth flows)
    if (urlBar && getTabIdFromWebview(webview.id) === activeTabId) {
      urlBar.value = e.url;
    }
  });

  webview.addEventListener('did-fail-load', (e: any) => {
    console.log('Load failed:', e.errorDescription, 'for URL:', e.validatedURL);
    // Don't auto-retry for authentication pages as it might interfere with OAuth
    const isAuthPage = e.validatedURL && (
      e.validatedURL.includes('accounts.google.com') ||
      e.validatedURL.includes('login.') ||
      e.validatedURL.includes('oauth') ||
      e.validatedURL.includes('auth')
    );
    
    if (!isAuthPage && e.errorCode === -105) { // NAME_NOT_RESOLVED
      console.log('DNS resolution failed, this is normal for some sites');
    }
  });

  // Handle certificate errors for OAuth sites
  webview.addEventListener('certificate-error', (e: any) => {
    console.log('Certificate error for:', e.url);
    // For OAuth flows, we might need to be more permissive
    // but still maintain security for the main browsing
  });

  // Handle permission requests (important for OAuth flows)
  webview.addEventListener('permission-request', (e: any) => {
    console.log('Permission requested:', e.permission, 'for:', webview.src);
    
    // Allow certain permissions for OAuth flows
    const allowedPermissions = ['geolocation', 'notifications', 'camera', 'microphone'];
    const isAuthSite = webview.src && (
      webview.src.includes('accounts.google.com') ||
      webview.src.includes('login.microsoftonline.com') ||
      webview.src.includes('github.com') ||
      webview.src.includes('oauth')
    );
    
    if (isAuthSite && allowedPermissions.includes(e.permission)) {
      e.request.allow();
    } else if (e.permission === 'notifications') {
      // Generally allow notifications
      e.request.allow();
    } else {
      e.request.deny();
    }
  });
  
  console.log('All webview event listeners set up for:', webview.id);
}

function selectTab(tabId: string): void {
  console.log('Selecting tab:', tabId);
  
  try {
    if (!tabs || tabs.length === 0) {
      console.log('No tabs available, creating a new one');
      createNewTab();
      return;
    }
    
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.error('Tab not found in tabs array:', tabId);
      if (tabs.length > 0) {
        selectTab(tabs[0].id);
      } else {
        createNewTab();
      }
      return;
    }
    
    // Update active tab
    activeTabId = tabId;
    tabs.forEach(tab => tab.isActive = tab.id === tabId);
    
    // Update UI
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
      tabElement.classList.add('active');
    }
    
    // Show corresponding webview or extension store
    document.querySelectorAll('.webview').forEach((view: any) => {
      view.style.display = 'none';
      view.classList.remove('active');
    });
    
    const tab = tabs[tabIndex];
    
    // Check if this tab is showing the extension store
    if (tab.url === 'file://browzer-store') {
      // Show extension store instead of webview
      const storeContainer = document.getElementById('extension-store-container');
      if (storeContainer) {
        storeContainer.style.display = 'block';
        storeContainer.classList.add('active');
      }
      
      if (urlBar) {
        urlBar.value = 'file://browzer-store';
      }
      
      // Disable navigation buttons for the store
      if (backBtn) backBtn.disabled = true;
      if (forwardBtn) forwardBtn.disabled = true;
    } else {
      // Hide extension store if it's visible
      const storeContainer = document.getElementById('extension-store-container');
      if (storeContainer) {
        storeContainer.style.display = 'none';
        storeContainer.classList.remove('active');
      }
      
      // Show regular webview
      const webview = document.getElementById(tab.webviewId) as any;
      
      if (webview) {
        webview.style.display = 'flex';
        webview.classList.add('active');
        
        if (urlBar) {
          urlBar.value = webview.src;
        }
      }
    }
    
    updateNavigationButtons();
    
    console.log('Tab selection complete:', tabId);
  } catch (error) {
    console.error('Error in selectTab:', error);
  }
}

function closeTab(tabId: string): void {
  console.log('closeTab called for tab:', tabId);
  
  if (tabs.length <= 1) {
    console.log('Preventing closing the last tab, creating a new one instead');
    createNewTab();
    return;
  }
  
  try {
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.error('Tab not found in tabs array:', tabId);
      return;
    }
    
    const webviewId = tabs[tabIndex].webviewId;
    const webview = document.getElementById(webviewId);
    const tabElement = document.getElementById(tabId);
    
    if (tabElement) tabElement.remove();
    if (webview) webview.remove();
    
    tabs.splice(tabIndex, 1);
    console.log('Tab removed from tabs array, remaining tabs:', tabs.length);
    
    if (activeTabId === tabId) {
      const newTabId = tabs[Math.max(0, tabIndex - 1)].id;
      selectTab(newTabId);
    }
    
    saveTabs();
    console.log('Tab closed successfully:', tabId);
  } catch (error) {
    console.error('Error closing tab:', error);
  }
}

function updateTabTitle(webview: any, title: string): void {
  try {
    const tabId = getTabIdFromWebview(webview.id);
    if (tabId) {
      const tabTitle = document.querySelector(`#${tabId} .tab-title`);
      if (tabTitle) {
        const pageTitle = title || webview.getTitle() || 'New Tab';
        tabTitle.textContent = pageTitle;
        saveTabs();
      }
    }
  } catch (error) {
    console.error('Error updating tab title:', error);
  }
}

function updateTabFavicon(webview: any, faviconUrl: string): void {
  try {
    const tabId = getTabIdFromWebview(webview.id);
    if (tabId) {
      const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`) as HTMLElement;
      if (faviconContainer) {
        faviconContainer.style.backgroundImage = `url(${faviconUrl})`;
        faviconContainer.classList.add('has-favicon');
      }
    }
  } catch (error) {
    console.error('Error updating favicon:', error);
  }
}

function getTabIdFromWebview(webviewId: string): string | null {
  const tab = tabs.find(tab => tab.webviewId === webviewId);
  return tab ? tab.id : null;
}

function trackPageVisit(url: string, title: string): void {
  if (!url || url === 'about:blank') return;
  
  try {
    let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    
    const visit = {
      id: Date.now(),
      url: url,
      title: title || url,
      visitDate: new Date(),
      timestamp: Date.now()
    };
    
    // Remove any existing entry for this URL to avoid duplicates
    history = history.filter((item: any) => item.url !== url);
    
    // Add new visit to the beginning
    history.unshift(visit);
    
    // Keep only the most recent 1000 visits
    if (history.length > 1000) {
      history = history.slice(0, 1000);
    }
    
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Error tracking page visit:', error);
  }
}

// ========================= EXTENSIONS PANEL =========================

function setupExtensionsPanel(): void {
  if (!extensionsPanel) return;

  // Load saved API keys
  const providers = ['openai', 'anthropic', 'perplexity', 'chutes'];
  providers.forEach(provider => {
    const savedKey = localStorage.getItem(`${provider}_api_key`);
    const input = document.getElementById(`${provider}ApiKey`) as HTMLInputElement;
    if (savedKey && input) {
      input.value = savedKey;
    }
  });

  // Add save event listeners for API keys
  document.querySelectorAll('.save-api-key').forEach(button => {
    button.addEventListener('click', () => {
      const provider = (button as HTMLElement).dataset.provider;
      if (provider) {
        const input = document.getElementById(`${provider}ApiKey`) as HTMLInputElement;
        const apiKey = input?.value.trim();
        if (apiKey) {
          localStorage.setItem(`${provider}_api_key`, apiKey);
          showToast(`${provider} API key saved!`, 'success');
        }
      }
    });
  });

  // Memory management
  updateMemoryCount();
  
  const clearMemoryBtn = document.getElementById('clearMemoryBtn');
  if (clearMemoryBtn) {
    clearMemoryBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all AI memory? This cannot be undone.')) {
        localStorage.removeItem(MEMORY_KEY);
        updateMemoryCount();
        showToast('Memory cleared successfully.', 'success');
      }
    });
  }

  // Homepage setting
  const homepageInput = document.getElementById('homepageInput') as HTMLInputElement;
  const saveHomepageBtn = document.getElementById('saveHomepageBtn');
  
  if (homepageInput) {
    homepageInput.value = homepageUrl;
  }
  
  if (saveHomepageBtn && homepageInput) {
    saveHomepageBtn.addEventListener('click', () => {
      let url = homepageInput.value.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      homepageUrl = url;
      localStorage.setItem(HOMEPAGE_KEY, url);
      showToast('Homepage saved!', 'success');
    });
  }
}

function updateMemoryCount(): void {
  try {
    const memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
    const memoryCountSpan = document.getElementById('memoryCount');
    if (memoryCountSpan) {
      memoryCountSpan.textContent = memory.length.toString();
    }
  } catch (e) {
    console.error('Error updating memory count:', e);
    const memoryCountSpan = document.getElementById('memoryCount');
    if (memoryCountSpan) {
      memoryCountSpan.textContent = '0';
    }
  }
}

function setupAgentControls(): void {
  console.log('[setupAgentControls] Starting setup...');
  // Initialize chat UI
  if (agentResults) {
    console.log('[setupAgentControls] agentResults element found');
    // Add chat input area if it doesn't exist
    let chatInputArea = document.querySelector('.chat-input-area');
    if (!chatInputArea) {
      console.log('[setupAgentControls] Creating chat input area');
      chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
        <button id="sendMessageBtn" class="chat-send-btn">Send</button>
      `;
      // Check if there's a chat container to position after
      const existingChatContainer = document.getElementById('chatContainer');
      if (existingChatContainer && existingChatContainer.parentNode === agentResults) {
        existingChatContainer.insertAdjacentElement('afterend', chatInputArea);
      } else {
        agentResults.appendChild(chatInputArea);
      }
      
      // Set up chat input handlers
      setupChatInputHandlers();
    } else {
      console.log('[setupAgentControls] Chat input area already exists, ensuring handlers are set up');
      // Ensure handlers are set up even if area already exists
      setupChatInputHandlers();
    }
  }
}

// Dedicated function to set up chat input event handlers
function setupChatInputHandlers(): void {
  console.log('[setupChatInputHandlers] Setting up chat input handlers...');
  
  // Wait a bit for DOM to be ready
  setTimeout(() => {
    const sendButton = document.getElementById('sendMessageBtn');
    const chatInput = document.getElementById('chatInput') as HTMLInputElement;
    
    if (!sendButton || !chatInput) {
      console.error('[setupChatInputHandlers] Chat input elements not found');
      console.log('[setupChatInputHandlers] Available elements:', {
        sendButton: !!sendButton,
        chatInput: !!chatInput,
        allButtons: document.querySelectorAll('button').length,
        allInputs: document.querySelectorAll('input').length
      });
      return;
    }
    
    console.log('[setupChatInputHandlers] Found chat elements, attaching handlers...');
    
    // Check if handlers are already set up
    if ((sendButton as any).hasHandlers) {
      console.log('[setupChatInputHandlers] Handlers already set up, skipping');
      return;
    }
    
    const sendMessage = () => {
      const message = chatInput.value.trim();
      if (message) {
        console.log('[sendMessage] Sending message:', message);
        addMessageToChat('user', message);
        processFollowupQuestion(message);
        chatInput.value = '';
      }
    };
    
    // Add click handler to send button
    sendButton.addEventListener('click', (e) => {
      console.log('[setupChatInputHandlers] Send button clicked');
      e.preventDefault();
      sendMessage();
    });
    
    // Add keypress handler for Enter key
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        console.log('[setupChatInputHandlers] Enter key pressed');
        e.preventDefault();
        sendMessage();
      }
    });
    
    // Mark as having handlers
    (sendButton as any).hasHandlers = true;
    
    console.log('[setupChatInputHandlers] Chat input handlers set up successfully');
  }, 100); // Small delay to ensure DOM is ready
}

// ========================= HISTORY PAGE =========================

function showHistoryPage(): void {
  console.log('=== SHOW HISTORY PAGE CALLED ===');
  
  try {
    const webview = getActiveWebview();
    console.log('Active webview found:', !!webview);
    
    if (webview) {
      const historyURL = `file://${path.join(process.cwd(), 'history.html')}`;
      console.log('Loading history URL:', historyURL);
      
      const historyLoadHandler = () => {
        console.log('History page loaded, injecting data...');
        
        try {
          const historyData = localStorage.getItem(HISTORY_STORAGE_KEY) || '[]';
          const parsedHistory = JSON.parse(historyData);
          console.log('Injecting history data:', parsedHistory.length, 'items');
          
          webview.executeJavaScript(`
            if (window.receiveHistoryData) {
              window.receiveHistoryData(${historyData});
            } else {
              window.__pendingHistoryData = ${historyData};
              setTimeout(() => {
                if (window.receiveHistoryData && window.__pendingHistoryData) {
                  window.receiveHistoryData(window.__pendingHistoryData);
                  delete window.__pendingHistoryData;
                }
              }, 500);
            }
          `).then(() => {
            console.log('History data injected successfully');
          }).catch((err: any) => {
            console.error('Error injecting history data:', err);
          });
          
        } catch (error) {
          console.error('Error preparing history data:', error);
        }
        
        webview.removeEventListener('did-finish-load', historyLoadHandler);
      };
      
      webview.addEventListener('did-finish-load', historyLoadHandler);
      webview.loadURL(historyURL);
      console.log('History URL loaded successfully');
      
    } else {
      console.log('No active webview, creating new tab...');
      const historyURL = `file://${path.join(process.cwd(), 'history.html')}`;
      const newTabId = createNewTab(historyURL);
      console.log('New history tab created:', newTabId);
    }
  } catch (error) {
    console.error('Error in showHistoryPage:', error);
    showToast('Error opening history page: ' + (error as Error).message, 'error');
  }
}

// ========================= AGENT EXECUTION =========================

// Helper function to gather all browser API keys
function getBrowserApiKeys(): Record<string, string> {
  const providers = ['openai', 'anthropic', 'perplexity', 'chutes'];
  const apiKeys: Record<string, string> = {};
  
  providers.forEach(provider => {
    const key = localStorage.getItem(`${provider}_api_key`);
    if (key) {
      apiKeys[provider] = key;
    }
  });
  
  return apiKeys;
}

async function executeAgent(): Promise<void> {
  try {
    console.log("executeAgent function called - running agent");
    
    const webview = getActiveWebview();
    if (!webview) {
      console.error('No webview available for agent execution');
      showToast('No active tab found', 'error');
      return;
    }
    
    if (!modelSelector) {
      console.error('Model selector not found');
      showToast('Model selector not found', 'error');
      return;
    }
    
    const provider = modelSelector.value;
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    if (!apiKey) {
      showToast(`Please configure your ${provider} API key in the Extensions panel first.`, 'error');
      return;
    }
    
    const url = webview.src || '';
    let title = '';
    try {
      title = webview.getTitle ? webview.getTitle() : '';
    } catch (e) {
      console.error('Error getting title:', e);
      title = '';
    }
    
    if (!title) title = url;
    
    let query = url;
    if (url.includes('google.com/search')) {
      try {
        const urlObj = new URL(url);
        const searchParams = urlObj.searchParams;
        if (searchParams.has('q')) {
          query = searchParams.get('q') || '';
        }
      } catch (e) {
        console.error('Error extracting search query:', e);
      }
    } else {
      query = title;
    }
    
    // Set up chat container if it doesn't exist
    if (agentResults) {
      let chatContainer = document.getElementById('chatContainer');
      let chatInputArea = document.querySelector('.chat-input-area');
      
      if (!chatContainer) {
        console.log('[executeAgent] Chat container not found, creating one');
        
        // Remove any existing welcome containers when starting chat
        const existingWelcome = agentResults.querySelector('.welcome-container');
        if (existingWelcome) {
          existingWelcome.remove();
        }
        
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
      }
      
      if (!chatInputArea) {
        console.log('[executeAgent] Chat input area not found, creating one');
        
        chatInputArea = document.createElement('div');
        chatInputArea.className = 'chat-input-area';
        chatInputArea.innerHTML = `
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        `;
        // Ensure it's positioned after the chat container for proper sticky positioning
        if (chatContainer && chatContainer.parentNode === agentResults) {
          chatContainer.insertAdjacentElement('afterend', chatInputArea);
        } else {
          agentResults.appendChild(chatInputArea);
        }
        
        setupChatInputHandlers();
      }
    }
    
    // Show loading
    addMessageToChat('assistant', '<div class="loading">Analyzing page...</div>');
    
    // Extract page content
    const pageContent = await extractPageContent(webview);
    
    // Get available Python extensions
    // Route request to appropriate extension using intelligent routing
    const routingResult = await ipcRenderer.invoke('route-extension-request', query);
    console.log('Extension routing result:', routingResult);
    
    const extensionId = routingResult.extensionId;
    const action = 'process_page';
    const data = {
      query,
      pageContent,
      isQuestion: false
    };
    
    console.log(`Executing extension: ${extensionId} (confidence: ${routingResult.confidence}) with action: ${action}`);
    console.log(`Routing reason: ${routingResult.reason}`);
    
    const result = await ipcRenderer.invoke('execute-python-extension', {
      extensionId,
      action,
      data,
      browserApiKeys: getBrowserApiKeys(),
      selectedProvider: provider
    });
    
    console.log(`Agent result received:`, result);
    console.log(`Agent result structure:`, JSON.stringify(result, null, 2));
    console.log(`Result data:`, result.data);
    console.log(`Result success:`, result.success);
    
    // Remove loading indicators
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    if (result.success === false) {
      addMessageToChat('assistant', `Error: ${result.error}`);
    } else {
      console.log('Calling displayAgentResults with:', result.data);
      displayAgentResults(result.data);
    }
  } catch (error) {
    console.error("Agent execution error:", error);
    addMessageToChat('assistant', `Error: ${(error as Error).message}`);
  }
}

async function autoSummarizePage(url: string, webview: any): Promise<void> {
  console.log('Auto-summarizing page:', url);
  
  if (isProblematicSite(url)) {
    console.log('Skipping auto-summarization for problematic site:', url);
    addMessageToChat('assistant', '<div class="info-message"><p>Auto-summarization disabled for this site to prevent rendering issues.</p></div>');
    return;
  }
  
  if (!modelSelector) {
    console.error('Model selector not found');
    return;
  }
  
  const provider = modelSelector.value;
  const apiKey = localStorage.getItem(`${provider}_api_key`);
  
  if (!apiKey) {
    addMessageToChat('assistant', '<div class="error-message"><p>Please configure your API key in the Extensions panel first.</p></div>');
    return;
  }
  
  // Ensure chat container exists
  if (agentResults) {
    let chatContainer = document.getElementById('chatContainer');
    let chatInputArea = document.querySelector('.chat-input-area');
    
    if (!chatContainer) {
      console.log('[autoSummarizePage] Chat container not found, creating one');
      
      // Remove any existing welcome containers when starting chat
      const existingWelcome = agentResults.querySelector('.welcome-container');
      if (existingWelcome) {
        existingWelcome.remove();
      }
      
      chatContainer = document.createElement('div');
      chatContainer.id = 'chatContainer';
      chatContainer.className = 'chat-container';
      agentResults.appendChild(chatContainer);
    }
    
    if (!chatInputArea) {
      console.log('[autoSummarizePage] Chat input area not found, creating one');
      
      chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
        <button id="sendMessageBtn" class="chat-send-btn">Send</button>
      `;
      // Ensure it's positioned after the chat container for proper sticky positioning
      if (chatContainer && chatContainer.parentNode === agentResults) {
        chatContainer.insertAdjacentElement('afterend', chatInputArea);
      } else {
        agentResults.appendChild(chatInputArea);
      }
      
      setupChatInputHandlers();
    }
    
    addMessageToChat('assistant', '<div class="loading">Auto-summarizing...</div>');
  }
  
  try {
    const pageContent = await extractPageContent(webview);
    
    // Route request to appropriate extension for auto-summarization
    const pageTitle = webview.getTitle() || url;
    const autoSummarizeRequest = `Analyze and summarize this page: ${pageTitle}`;
    
    const routingResult = await ipcRenderer.invoke('route-extension-request', autoSummarizeRequest);
    console.log('Auto-summarize routing result:', routingResult);
    
    const extensionId = routingResult.extensionId;
    const action = 'process_page';
    const data = {
      query: pageTitle,
      pageContent,
      isQuestion: false
    };
    
    console.log(`Executing extension for auto-summarize: ${extensionId} (confidence: ${routingResult.confidence})`);
    console.log(`Auto-summarize routing reason: ${routingResult.reason}`);
    const result = await ipcRenderer.invoke('execute-python-extension', {
      extensionId,
      action,
      data,
      browserApiKeys: getBrowserApiKeys(),
      selectedProvider: provider
    });
    
    console.log('Auto-summarize result received:', result);
    console.log('Auto-summarize result structure:', JSON.stringify(result, null, 2));
    console.log('Auto-summarize result data:', result.data);
    console.log('Auto-summarize result success:', result.success);
    
    // Clear loading indicators
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    if (result.success === false) {
      addMessageToChat('assistant', `Error: ${result.error}`);
    } else {
      console.log('Auto-summarize calling displayAgentResults with:', result.data);
      displayAgentResults(result.data);
    }
  } catch (error) {
    console.error('Error in autoSummarizePage:', error);
    
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    addMessageToChat('assistant', 'Auto-summarization failed: ' + (error as Error).message);
  }
}

// ========================= UTILITY FUNCTIONS =========================

async function extractPageContent(webview: any): Promise<any> {
  try {
    const extractScript = `
      (function() {
        try {
          const title = document.title || '';
          
          let description = "";
          try {
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) description = metaDesc.getAttribute('content') || '';
          } catch(e) {
            console.error('Error getting meta description:', e);
          }
          
          const mainContent = document.querySelector('article') || 
                            document.querySelector('main') || 
                            document.querySelector('.content') ||
                            document.querySelector('#content') ||
                            document.body;
          
          const bodyText = mainContent ? mainContent.innerText.replace(/\\s+/g, ' ').trim() : '';
          
          return {
            title: title,
            description: description,
            content: bodyText,
            url: window.location.href
          };
        } catch(finalError) {
          console.error('Fatal error in content extraction:', finalError);
          return {
            title: document.title || '',
            description: '',
            content: 'Error extracting content: ' + finalError.message,
            url: window.location.href
          };
        }
      })();
    `;
    
    const result = await webview.executeJavaScript(extractScript);
    return result || { title: '', description: '', content: '', url: '' };
  } catch (error) {
    console.error('Error in extractPageContent:', error);
    return { title: '', description: '', content: '', url: '' };
  }
}

function addMessageToChat(role: string, content: string, timing?: number): void {
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) {
    console.error('[addMessageToChat] Chat container not found');
    return;
  }
  
  if (!content || content.trim() === '') {
    console.log('[addMessageToChat] Empty content, skipping');
    return;
  }
  
  console.log(`[addMessageToChat] Adding ${role} message:`, content.substring(0, 100) + '...');
  
  const messageDiv = document.createElement('div');
  
  if (role === 'context') {
    // Special handling for context messages
    messageDiv.className = 'chat-message context-message';
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    messageDiv.dataset.role = 'context';
  } else if (role === 'user') {
    messageDiv.className = 'chat-message user-message';
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    messageDiv.dataset.role = 'user';
    messageDiv.dataset.timestamp = new Date().toISOString();
  } else if (role === 'assistant') {
    messageDiv.className = 'chat-message assistant-message';
    messageDiv.dataset.role = 'assistant';
    messageDiv.dataset.timestamp = new Date().toISOString();
    
    // Check if content contains only a loading indicator
    const isLoading = content.includes('class="loading"') && !content.replace(/<div class="loading">.*?<\/div>/g, '').trim();
    
    if (timing && !isLoading) {
      messageDiv.innerHTML = `
        <div class="timing-info">
          <span>Response generated in</span>
          <span class="time-value">${timing.toFixed(2)}s</span>
        </div>
        <div class="message-content">${content}</div>
      `;
      messageDiv.dataset.genTime = timing.toFixed(2);
    } else {
      messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    }
  }
  
  chatContainer.appendChild(messageDiv);
  
  // Scroll to bottom with smooth behavior
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  console.log(`[addMessageToChat] Message added successfully. Total messages: ${chatContainer.children.length}`);
}

function displayAgentResults(data: any): void {
  console.log('[displayAgentResults] Called with data:', data);
  console.log('[displayAgentResults] Data type:', typeof data);
  console.log('[displayAgentResults] Data keys:', data ? Object.keys(data) : 'null');
  
  if (!data) {
    console.log('[displayAgentResults] No data - showing fallback message');
    addMessageToChat('assistant', 'No data received from agent');
    return;
  }

  console.log("[displayAgentResults] Agent result data:", data);
  console.log('[displayAgentResults] Has consolidated_summary:', !!data.consolidated_summary);
  console.log('[displayAgentResults] Has summaries:', !!data.summaries);
  console.log('[displayAgentResults] Summaries length:', data.summaries ? data.summaries.length : 'none');
  
  if (data.consolidated_summary) {
    console.log('[displayAgentResults] Displaying consolidated summary:', data.consolidated_summary.substring(0, 100) + '...');
    addMessageToChat('assistant', data.consolidated_summary, data.generation_time);
  } else if (data.summaries && data.summaries.length > 0) {
    console.log('[displayAgentResults] Displaying individual summaries');
    const summariesText = data.summaries.map((s: any) => `<b>${s.title}</b>\n${s.summary}`).join('\n\n');
    addMessageToChat('assistant', summariesText, data.generation_time);
  } else {
    console.log('[displayAgentResults] No summaries found - showing fallback message');
    addMessageToChat('assistant', 'No relevant information found.', data.generation_time);
  }
}

async function processFollowupQuestion(question: string): Promise<void> {
  console.log('[processFollowupQuestion] Processing question:', question);
  
  // Helper function to clear loading indicators
  const clearLoadingIndicators = () => {
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
  };
  
  try {
    addMessageToChat('assistant', '<div class="loading">Processing your question...</div>');
    
    if (!modelSelector) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'Error: Model selector not found.');
      return;
    }
    
    const provider = modelSelector.value;
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    if (!apiKey) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
      return;
    }
    
    const activeWebview = getActiveWebview();
    if (!activeWebview) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'No active webview found.');
      return;
    }
    
    const currentUrl = activeWebview.src || '';
    console.log('[processFollowupQuestion] Extracting page content from:', currentUrl);
    const pageContent = await extractPageContent(activeWebview);
    
    // Route request to appropriate extension for question answering
    const questionRequest = `Answer this question about the page: ${question}`;
    
    console.log('[processFollowupQuestion] Routing extension request...');
    const routingResult = await ipcRenderer.invoke('route-extension-request', questionRequest);
    console.log('Follow-up question routing result:', routingResult);
    
    const extensionId = routingResult.extensionId;
    const action = 'process_page';
    const data = {
      query: `DIRECT QUESTION: ${question}`,
      pageContent,
      isQuestion: true
    };
    
    console.log(`[processFollowupQuestion] Executing extension with question: ${extensionId} (confidence: ${routingResult.confidence}) - ${question}`);
    console.log(`Follow-up routing reason: ${routingResult.reason}`);
    
    const result = await ipcRenderer.invoke('execute-python-extension', {
      extensionId,
      action,
      data,
      browserApiKeys: getBrowserApiKeys(),
      selectedProvider: provider
    });
    
    console.log('[processFollowupQuestion] Extension result received:', result);
    
    // Always clear loading indicators
    clearLoadingIndicators();
    
    if (result.success === false) {
      addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
      return;
    }
    
    console.log('[processFollowupQuestion] Displaying results...');
    displayAgentResults(result.data);
    
  } catch (error) {
    console.error('Error in processFollowupQuestion:', error);
    
    // Ensure loading indicators are cleared even on error
    clearLoadingIndicators();
    
    addMessageToChat('assistant', `Error: ${(error as Error).message}`);
  }
}

// ========================= EXTENSION STORE =========================

function showExtensionStore(): void {
  console.log('Showing extension store');
  
  // Hide the current webview
  const currentWebview = getActiveWebview();
  if (currentWebview) {
    currentWebview.style.display = 'none';
  }
  
  // Get or create the extension store container
  let storeContainer = document.getElementById('extension-store-container');
  if (!storeContainer) {
    storeContainer = document.createElement('div');
    storeContainer.id = 'extension-store-container';
    storeContainer.className = 'webview'; // Use same styles as webview
    storeContainer.style.display = 'none';
    webviewsContainer.appendChild(storeContainer);
  }
  
  // Show the store container
  storeContainer.style.display = 'block';
  
  // Initialize and render the extension store
  const extensionStore = new ExtensionStore(storeContainer);
  extensionStore.render();
  
  // Make it globally available for onclick handlers
  (window as any).extensionStore = extensionStore;
  
  // Update URL bar
  if (urlBar) {
    urlBar.value = 'file://browzer-store';
  }
  
  // Update tab title
  if (activeTabId) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      tab.title = 'Browzer Extension Store';
      tab.url = 'file://browzer-store';
      const titleElement = document.querySelector(`#${activeTabId} .tab-title`);
      if (titleElement) {
        titleElement.textContent = 'Extension Store';
      }
    }
  }
  
  // Update navigation buttons (disable them for the store)
  if (backBtn) backBtn.disabled = true;
  if (forwardBtn) forwardBtn.disabled = true;
}

// ========================= EXPORTS FOR DEBUGGING =========================

// Export for debugging - placed at end after all functions are defined
(window as any).browzerApp = {
  tabs,
  activeTabId,
  getActiveWebview,
  createNewTab,
  selectTab,
  closeTab,
  navigateToUrl,
  showHistoryPage,
  executeAgent,
  showExtensionStore
}; 