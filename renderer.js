// IMMEDIATE DEBUGGING - Alert at the very start
console.log("Renderer script loaded");

const { ipcRenderer, shell } = require('electron');
const webview = document.getElementById('webview');
const urlBar = document.getElementById('urlBar');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const reloadBtn = document.getElementById('reloadBtn');
const goBtn = document.getElementById('goBtn');
const extensionsBtn = document.getElementById('extensionsBtn');
const extensionsPanel = document.getElementById('extensionsPanel');
const closeExtensionsBtn = document.getElementById('closeExtensionsBtn');
const installExtensionBtn = document.getElementById('installExtensionBtn');
const loadExtensionBtn = document.getElementById('loadExtensionBtn');
const extensionFile = document.getElementById('extensionFile');
const extensionsList = document.getElementById('extensionsList');
const openChromeStoreBtn = document.getElementById('openChromeStoreBtn');
const extensionIdInput = document.getElementById('extensionIdInput');
const installFromStoreBtn = document.getElementById('installFromStoreBtn');
const developerModeToggle = document.getElementById('developerModeToggle');
const dragbar = document.getElementById('dragbar');
const webviewContainer = document.querySelector('.webview-container');
const agentContainer = document.querySelector('.agent-container');
let isDragging = false;

// Tab management
let tabs = [];
let activeTabId = null;

// Add an auto-summarize setting and toggle state
let autoSummarizeEnabled = true;
const AUTO_SUMMARIZE_KEY = 'auto_summarize_enabled';
const SAVED_TABS_KEY = 'saved_tabs';

// New tab defaults
const NEW_TAB_URL = 'about:blank'; // Default URL for new tabs
const HOMEPAGE_KEY = 'homepage_url';
let homepageUrl = localStorage.getItem(HOMEPAGE_KEY) || 'https://www.google.com';

// Set these as null initially so they can be properly initialized later
let tabsContainer = null;
let newTabBtn = null;
let webviewsContainer = null;

// Add a list of problematic sites that should skip auto-summarization
const PROBLEMATIC_SITES = [
  'openrouter.ai',
  'arcee-ai'
];

// Add a function to check if a URL is from a problematic site
function isProblematicSite(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return PROBLEMATIC_SITES.some(site => urlObj.hostname.includes(site));
  } catch (e) {
    console.error('Error parsing URL:', e);
    return false;
  }
}

// Load saved preferences on startup
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded');
  
  // Initialize DOM element references
  tabsContainer = document.getElementById('tabsContainer');
  newTabBtn = document.getElementById('newTabBtn');
  webviewsContainer = document.querySelector('.webviews-container');

  // Output diagnostic info
  console.log('Tab elements found:', { 
    tabsContainer: !!tabsContainer,
    newTabBtn: !!newTabBtn,
    webviewsContainer: !!webviewsContainer
  });
  
  if (!tabsContainer || !newTabBtn || !webviewsContainer) {
    console.error('Critical tab elements missing!');
    alert('Error: Tab elements not found in DOM. Browser may not work properly.');
  }
  
  // Load auto-summarize preference
  const savedAutoSummarize = localStorage.getItem(AUTO_SUMMARIZE_KEY);
  if (savedAutoSummarize !== null) {
    autoSummarizeEnabled = savedAutoSummarize === 'true';
  }
  
  // Set up UI controls for auto-summarize
  setupAutoSummarizeUI();
  
  // Restore saved tabs or create initial tab
  restoreTabs();
  
  // Set up tab events
  if (newTabBtn) {
    console.log('Attaching event listener to new tab button');
    newTabBtn.addEventListener('click', () => {
      console.log('New tab button clicked');
      createNewTab();
    });
  }

  // Set up other event listeners
  const runAgentBtn = document.getElementById('runAgentBtn');
  if (runAgentBtn) {
    console.log('Run Agent button found, attaching event listener');
    runAgentBtn.addEventListener('click', executeAgent);
  } else {
    console.error('Run Agent button not found on DOMContentLoaded');
  }

  // Call setup functions when DOM is loaded
  setupExtensionsPanel();
  setupAgentControls();
});

// Set up UI for auto-summarize control
function setupAutoSummarizeUI() {
  // Create a toggle element next to the agent selector
  const agentControls = document.querySelector('.agent-controls');
  
  // Create container for toggle
  const autoSummarizeContainer = document.createElement('div');
  autoSummarizeContainer.className = 'auto-summarize-container';
  
  // Create toggle switch
  const toggle = document.createElement('label');
  toggle.className = 'switch';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'autoSummarizeToggle';
  checkbox.checked = autoSummarizeEnabled;
  
  const slider = document.createElement('span');
  slider.className = 'slider';
  
  toggle.appendChild(checkbox);
  toggle.appendChild(slider);
  
  // Create label
  const label = document.createElement('span');
  label.textContent = 'Auto';
  label.className = 'auto-summarize-label';
  
  // Add event listener for toggle
  checkbox.addEventListener('change', function() {
    autoSummarizeEnabled = this.checked;
    localStorage.setItem(AUTO_SUMMARIZE_KEY, autoSummarizeEnabled);
    console.log(`Auto-summarize ${autoSummarizeEnabled ? 'enabled' : 'disabled'}`);
  });
  
  // Add elements to container
  autoSummarizeContainer.appendChild(toggle);
  autoSummarizeContainer.appendChild(label);
  
  // Add homepage setting to extensions panel
  const extensionsContent = document.querySelector('.extensions-content');
  if (extensionsContent) {
    const homepageSection = document.createElement('div');
    homepageSection.className = 'homepage-section';
    homepageSection.innerHTML = `
      <h4>New Tab Homepage</h4>
      <div class="homepage-input">
        <input type="text" id="homepageInput" placeholder="Enter homepage URL" value="${homepageUrl}">
        <button id="saveHomepageBtn">Save</button>
      </div>
    `;
    extensionsContent.appendChild(homepageSection);
    
    // Add event listener to save homepage
    const saveBtn = homepageSection.querySelector('#saveHomepageBtn');
    const input = homepageSection.querySelector('#homepageInput');
    
    saveBtn.addEventListener('click', () => {
      let url = input.value.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      homepageUrl = url;
      localStorage.setItem(HOMEPAGE_KEY, url);
      alert('Homepage saved!');
    });
  }
  
  // Add container to agent controls
  agentControls.insertBefore(autoSummarizeContainer, agentControls.firstChild);
}

// Enhance the restoreTabs function with better error handling
function restoreTabs() {
  console.log('Attempting to restore tabs');
  
  // Check if DOM elements are available
  if (!tabsContainer || !webviewsContainer) {
    console.error('Cannot restore tabs: containers not found');
    setTimeout(() => {
      createNewTab(); // Create a default tab as fallback
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
        localStorage.removeItem(SAVED_TABS_KEY); // Clear corrupted data
        createNewTab();
        return;
      }
      
      if (savedTabs && savedTabs.length > 0) {
        // Clear any existing tabs
        tabs = [];
        tabsContainer.innerHTML = '';
        webviewsContainer.innerHTML = '';
        
        console.log(`Attempting to restore ${savedTabs.length} tabs`);
        
        // Track successful restorations
        let restoredCount = 0;
        
        // Create tabs from saved state
        savedTabs.forEach((tab, index) => {
          try {
            if (tab.url) {
              createNewTab(tab.url);
              restoredCount++;
            }
          } catch (tabErr) {
            console.error(`Failed to restore tab ${index}:`, tabErr);
          }
        });
        
        console.log(`Successfully restored ${restoredCount} out of ${savedTabs.length} tabs`);
        
        if (restoredCount > 0) {
          return; // Successfully restored at least one tab
        }
      }
    }
  } catch (err) {
    console.error('Error in restoreTabs:', err);
  }
  
  // If no tabs were restored or there was an error, create a default tab
  console.log('Creating default tab as fallback');
  createNewTab();
}

// Enhance tab saving to handle errors
function saveTabs() {
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
    
    localStorage.setItem(SAVED_TABS_KEY, JSON.stringify(tabsToSave));
    console.log(`Saved ${tabsToSave.length} tabs to localStorage`);
  } catch (err) {
    console.error('Error saving tabs:', err);
  }
}

// Tab management functions
function createNewTab(url = NEW_TAB_URL) {
  console.log('createNewTab called with URL:', url);
  
  // Verify DOM elements are available
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
    
    // Set initial tab title with favicon placeholder
    tab.innerHTML = `
      <div class="tab-favicon"></div>
      <span class="tab-title">New Tab</span>
      <button class="tab-close">×</button>
    `;
    
    // Append tab to tabs container
    tabsContainer.appendChild(tab);
    console.log('Tab element created:', tabId);
    
    // Create webview for this tab
    const webview = document.createElement('webview');
    webview.id = webviewId;
    webview.className = 'webview';
    
    // Determine if we need special settings for this URL
    const needsSpecialSettings = url && isProblematicSite(url);
    
    // Add standard attributes
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('webpreferences', 'contextIsolation=false');
    
    // Add special attributes for problematic sites
    if (needsSpecialSettings) {
      console.log('Adding special webview settings for problematic site:', url);
      webview.setAttribute('webpreferences', 'contextIsolation=false, javascript=true, webSecurity=true, allowRunningInsecureContent=false');
      webview.setAttribute('partition', 'persist:safemode');
      webview.setAttribute('disablewebsecurity', 'false');
    }
    
    // Add webview to container (initially hidden)
    webviewsContainer.appendChild(webview);
    console.log('Webview element created:', webviewId);
    
    // Add the tab to our tabs array with history tracking
    tabs.push({
      id: tabId,
      webviewId: webviewId,
      url: url,
      history: [],
      currentHistoryIndex: -1,
      isProblematicSite: needsSpecialSettings
    });
    
    // Load the appropriate URL
    if (url === NEW_TAB_URL) {
      // For blank pages, show the homepage
      webview.setAttribute('src', homepageUrl);
    } else {
      webview.setAttribute('src', url);
    }
    
    // Setup event listeners for this webview
    setupWebviewEvents(webview);
    
    // Select this tab
    selectTab(tabId);
    
    // Add event listeners to the tab
    tab.addEventListener('click', (e) => {
      // Don't switch tabs when clicking the close button
      if (!e.target.classList.contains('tab-close')) {
        selectTab(tabId);
      }
    });
    
    const closeBtn = tab.querySelector('.tab-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent tab selection when clicking close
        console.log('Close button clicked for tab:', tabId);
        closeTab(tabId);
      });
    } else {
      console.error('Close button not found in tab:', tabId);
    }
    
    // Save tab state
    saveTabs();
    
    console.log('Tab created successfully:', tabId);
    return tabId;
  } catch (error) {
    console.error('Error creating tab:', error);
    alert('Failed to create tab: ' + error.message);
    return null;
  }
}

function selectTab(tabId) {
  console.log('Selecting tab:', tabId);
  
  try {
    // If no tabs, create a new one
    if (!tabs || tabs.length === 0) {
      console.log('No tabs available, creating a new one');
      createNewTab();
      return;
    }
    
    // Check if the tab exists
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.error('Tab not found in tabs array:', tabId);
      // Select the first available tab instead
      if (tabs.length > 0) {
        selectTab(tabs[0].id);
      } else {
        createNewTab();
      }
      return;
    }
    
    // Update active tab
    activeTabId = tabId;
    
    // Update UI classes
    try {
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      
      const tabElement = document.getElementById(tabId);
      if (tabElement) {
        tabElement.classList.add('active');
      } else {
        console.error('Tab element not found in DOM:', tabId);
      }
    } catch (uiErr) {
      console.error('Error updating tab UI:', uiErr);
    }
    
    // Show the corresponding webview, hide others
    try {
      document.querySelectorAll('.webview').forEach(view => {
        view.style.display = 'none';
        view.classList.remove('active');
      });
      
      const tab = tabs[tabIndex];
      const webviewId = tab.webviewId;
      const webview = document.getElementById(webviewId);
      
      if (webview) {
        webview.style.display = 'flex';
        webview.classList.add('active');
        
        // Update URL bar with the selected tab's URL
        if (webview.src) {
          urlBar.value = webview.src;
        }
      } else {
        console.error('Webview element not found:', webviewId);
      }
    } catch (viewErr) {
      console.error('Error updating webview visibility:', viewErr);
    }
    
    // Update navigation buttons
    updateNavigationButtons();
    
    console.log('Tab selection complete:', tabId);
  } catch (error) {
    console.error('Error in selectTab:', error);
  }
}

function closeTab(tabId) {
  console.log('closeTab called for tab:', tabId);
  
  // Don't close the last tab
  if (tabs.length <= 1) {
    console.log('Preventing closing the last tab, creating a new one instead');
    createNewTab();
    return;
  }
  
  try {
    // Find the tab index
    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.error('Tab not found in tabs array:', tabId);
      return;
    }
    
    // Get the webview
    const webviewId = tabs[tabIndex].webviewId;
    const webview = document.getElementById(webviewId);
    const tabElement = document.getElementById(tabId);
    
    if (!webview) {
      console.error('Webview element not found:', webviewId);
    }
    
    if (!tabElement) {
      console.error('Tab element not found:', tabId);
    }
    
    // Remove tab and webview from DOM
    if (tabElement) tabElement.remove();
    if (webview) webview.remove();
    
    // Remove from tabs array
    tabs.splice(tabIndex, 1);
    console.log('Tab removed from tabs array, remaining tabs:', tabs.length);
    
    // If we closed the active tab, select another tab
    if (activeTabId === tabId) {
      // Select the tab to the left, or the first tab if we closed the leftmost
      const newTabId = tabs[Math.max(0, tabIndex - 1)].id;
      selectTab(newTabId);
    }
    
    // Save tab state
    saveTabs();
    console.log('Tab closed successfully:', tabId);
  } catch (error) {
    console.error('Error closing tab:', error);
  }
}

// Update setupWebviewEvents to handle problematic sites specially
function setupWebviewEvents(webview) {
  let navigationInProgress = false;
  
  // Reset navigation state when load starts
  webview.addEventListener('did-start-loading', () => {
    navigationInProgress = true;
  });
  
  // Mark navigation as complete when load finishes
  webview.addEventListener('did-finish-load', () => {
    navigationInProgress = false;
    
    // Check if this is a problematic site
    const url = webview.getURL();
    if (isProblematicSite(url)) {
      console.log('Loaded a problematic site. Adding extra protections:', url);
      
      // Inject CSS to prevent certain problematic behaviors
      const safeModeCss = `
        * {
          transition: none !important;
          animation: none !important;
        }
      `;
      
      try {
        webview.insertCSS(safeModeCss);
      } catch (err) {
        console.error('Error injecting safe mode CSS:', err);
      }
      
      // Update Agent panel with info
      const tabId = getTabIdFromWebview(webview.id);
      if (tabId === activeTabId) {
        const agentResults = document.getElementById('agentResults');
        if (agentResults) {
          agentResults.innerHTML = `
            <div class="info-message">
              <p>Auto-summarization disabled for this site to prevent rendering issues.</p>
              <p>You can still manually run the agent if needed, but it might cause errors.</p>
              <p>Site: ${url}</p>
            </div>
          `;
        }
      }
    }
  });
  
  // Update tab title when page title changes
  webview.addEventListener('page-title-updated', (e) => {
    try {
      const tabId = getTabIdFromWebview(webview.id);
      if (tabId) {
        const tabTitle = document.querySelector(`#${tabId} .tab-title`);
        if (tabTitle) {
          tabTitle.textContent = e.title || 'New Tab';
          saveTabs(); // Save tabs when title changes
        }
      }
    } catch (error) {
      console.error('Error updating tab title:', error);
    }
  });
  
  // Update favicon when available
  webview.addEventListener('page-favicon-updated', (e) => {
    try {
      const tabId = getTabIdFromWebview(webview.id);
      if (tabId && e.favicons && e.favicons.length > 0) {
        const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`);
        if (faviconContainer) {
          faviconContainer.style.backgroundImage = `url(${e.favicons[0]})`;
          faviconContainer.classList.add('has-favicon');
        }
      }
    } catch (error) {
      console.error('Error updating favicon:', error);
    }
  });
  
  // Track navigation history
  webview.addEventListener('did-navigate', (event) => {
    try {
      const tabId = getTabIdFromWebview(webview.id);
      const tabIndex = tabs.findIndex(tab => tab.id === tabId);
      
      if (tabIndex >= 0) {
        const tab = tabs[tabIndex];
        
        // If we navigated from a position other than the end of history,
        // truncate the forward history
        if (tab.currentHistoryIndex < tab.history.length - 1) {
          tab.history = tab.history.slice(0, tab.currentHistoryIndex + 1);
        }
        
        // Add the new URL to history
        tab.history.push(event.url);
        tab.currentHistoryIndex = tab.history.length - 1;
        
        // Reset favicon when navigating to a new page
        const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`);
        if (faviconContainer) {
          faviconContainer.style.backgroundImage = '';
          faviconContainer.classList.remove('has-favicon');
        }
        
        // Update URL bar if this is the active tab
        if (tabId === activeTabId) {
          urlBar.value = event.url;
          
          // Auto-summarize after page loads, if enabled
          if (autoSummarizeEnabled) {
            // Wait for page to completely load before summarizing
            // We'll handle this in the did-finish-load event
          }
        }
        
        saveTabs(); // Save tabs when navigation occurs
      }
      
      // Update navigation buttons if active tab
      if (tabId === activeTabId) {
        updateNavigationButtons();
      }
    } catch (error) {
      console.error('Error handling navigation:', error);
    }
  });
  
  // Handle auto-summarization with proper timing
  webview.addEventListener('did-finish-load', () => {
    try {
      // Only auto-summarize for active tab
      const tabId = getTabIdFromWebview(webview.id);
      if (tabId === activeTabId && autoSummarizeEnabled) {
        // Add a delay to make sure page has finished rendering
        setTimeout(() => {
          autoSummarizePage(webview.getURL(), webview);
        }, 1000);
      }
    } catch (error) {
      console.error('Error handling page load completion:', error);
    }
  });
  
  // Update for in-page navigation (like anchors/hash changes)
  webview.addEventListener('did-navigate-in-page', (event) => {
    try {
      const tabId = getTabIdFromWebview(webview.id);
      
      // Update URL bar if this is the active tab
      if (tabId === activeTabId) {
        urlBar.value = event.url;
        updateNavigationButtons();
      }
    } catch (error) {
      console.error('Error handling in-page navigation:', error);
    }
  });
  
  // Handle page errors
  webview.addEventListener('did-fail-load', (event) => {
    try {
      // Only if it's a real failure, not a cancelled navigation
      if (event.errorCode !== -3) {
        console.error('Page failed to load:', event.errorDescription);
        const tabId = getTabIdFromWebview(webview.id);
        
        // Display error in agent results if this is active tab
        if (tabId === activeTabId && autoSummarizeEnabled) {
          const agentResults = document.getElementById('agentResults');
          if (agentResults) {
            agentResults.innerHTML = `
              <div class="error-message">
                <p>Page failed to load: ${event.errorDescription}</p>
              </div>
            `;
          }
        }
      }
    } catch (error) {
      console.error('Error handling page load failure:', error);
    }
  });
}

function getTabIdFromWebview(webviewId) {
  const tab = tabs.find(tab => tab.webviewId === webviewId);
  return tab ? tab.id : null;
}

function getActiveWebview() {
  if (!activeTabId) return null;
  const tab = tabs.find(tab => tab.id === activeTabId);
  if (!tab) return null;
  return document.getElementById(tab.webviewId);
}

// Navigation functions
backBtn.addEventListener('click', () => {
  const webview = getActiveWebview();
  const tab = getActiveTab();
  
  if (webview && tab && webview.canGoBack()) {
    webview.goBack();
  }
});

forwardBtn.addEventListener('click', () => {
  const webview = getActiveWebview();
  const tab = getActiveTab();
  
  if (webview && tab && webview.canGoForward()) {
    webview.goForward();
  }
});

reloadBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (webview) {
        webview.reload();
    }
});

// URL handling
function navigateToUrl() {
    let url = urlBar.value;
    
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

goBtn.addEventListener('click', navigateToUrl);
urlBar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        navigateToUrl();
    }
});

// Update navigation buttons
function updateNavigationButtons() {
    const webview = getActiveWebview();
    if (webview) {
        backBtn.disabled = !webview.canGoBack();
        forwardBtn.disabled = !webview.canGoForward();
    } else {
        backBtn.disabled = true;
        forwardBtn.disabled = true; 
    }
}

// Extensions Panel Management
extensionsBtn.addEventListener('click', () => {
    extensionsPanel.classList.toggle('hidden');
});

closeExtensionsBtn.addEventListener('click', () => {
    extensionsPanel.classList.add('hidden');
});

// Developer Mode
developerModeToggle.addEventListener('change', async (event) => {
    try {
        const result = await ipcRenderer.invoke('enable-developer-mode');
        if (!result.success) {
            alert('Failed to enable developer mode: ' + result.error);
            developerModeToggle.checked = false;
        }
    } catch (err) {
        alert('Error enabling developer mode: ' + err.message);
        developerModeToggle.checked = false;
    }
});

// Extension Installation
installExtensionBtn.addEventListener('click', () => {
    extensionFile.setAttribute('webkitdirectory', '');
    extensionFile.removeAttribute('accept');
    extensionFile.click();
});

loadExtensionBtn.addEventListener('click', () => {
    extensionFile.removeAttribute('webkitdirectory');
    extensionFile.setAttribute('accept', '.crx');
    extensionFile.click();
});

extensionFile.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (files.length > 0) {
        try {
            const result = await ipcRenderer.invoke('install-extension', files[0].path);
            if (result.success) {
                updateExtensionsList();
            } else {
                alert('Failed to install extension: ' + result.error);
            }
        } catch (err) {
            alert('Error installing extension: ' + err.message);
        }
    }
});

// Chrome Web Store Integration
openChromeStoreBtn.addEventListener('click', () => {
    shell.openExternal('https://chrome.google.com/webstore');
});

installFromStoreBtn.addEventListener('click', async () => {
    const extensionId = extensionIdInput.value.trim();
    if (!extensionId) {
        alert('Please enter an extension ID');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('install-from-store', extensionId);
        if (result.success) {
            updateExtensionsList();
            extensionIdInput.value = '';
        } else {
            alert('Failed to install extension: ' + result.error);
        }
    } catch (err) {
        alert('Error installing extension: ' + err.message);
    }
});

// Update Extensions List
async function updateExtensionsList() {
    try {
        const extensions = await ipcRenderer.invoke('get-extensions');
        extensionsList.innerHTML = '';
        
        extensions.forEach(ext => {
            const extElement = document.createElement('div');
            extElement.className = 'extension-item';
            extElement.innerHTML = `
                <span>${ext.name}</span>
                <button class="remove-extension" data-id="${ext.id}">Remove</button>
            `;
            extensionsList.appendChild(extElement);
        });

        // Add remove event listeners
        document.querySelectorAll('.remove-extension').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const extensionId = e.target.dataset.id;
                const result = await ipcRenderer.invoke('remove-extension', extensionId);
                if (result.success) {
                    updateExtensionsList();
                } else {
                    alert('Failed to remove extension: ' + result.error);
                }
            });
        });
    } catch (err) {
        console.error('Error updating extensions list:', err);
    }
}

// Initial extensions list update
updateExtensionsList();

// Create a debugging function that both logs to console and shows an alert
function debugLog(message) {
  console.log(message);
  alert("DEBUG: " + message);
}

// Check elements immediately after declaration
setTimeout(() => {
  debugLog("Checking button after 1 second");
  const btn = document.getElementById('runAgentBtn');
  if (btn) {
    debugLog("Found button: " + btn.outerHTML);
    // Add multiple event listeners using different methods
    btn.onclick = function() { 
      debugLog("Button clicked via onclick");
      executeAgent();
    };
    btn.addEventListener('mousedown', function() {
      debugLog("Button mousedown event fired");
    });
  } else {
    debugLog("Button NOT found! Creating a fallback button");
    // Create a fallback button
    const fallbackBtn = document.createElement('button');
    fallbackBtn.textContent = "FALLBACK RUN AGENT BUTTON";
    fallbackBtn.style.position = "fixed";
    fallbackBtn.style.top = "10px";
    fallbackBtn.style.right = "10px";
    fallbackBtn.style.zIndex = "9999";
    fallbackBtn.style.backgroundColor = "red";
    fallbackBtn.style.color = "white";
    fallbackBtn.style.padding = "10px";
    fallbackBtn.onclick = executeAgent;
    document.body.appendChild(fallbackBtn);
  }
}, 1000);

// Handle agent execution
async function executeAgent(specificWebview = null) {
  try {
    console.log("executeAgent function called - running agent");
    
    // Get webview to use (provided or active)
    const webview = specificWebview || getActiveWebview();
    if (!webview) {
      console.error('No webview available for agent execution');
      return;
    }
    
    // Get selected model and its API key
    const modelSelector = document.getElementById('modelSelector');
    const provider = modelSelector.value;
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    if (!apiKey) {
      alert(`Please configure your ${provider} API key in the Extensions panel first.`);
      return;
    }
    
    // Get URL and title
    const url = webview.getURL();
    let title = webview.getTitle();
    
    // Use URL as fallback if title is empty
    if (!title) title = url;
    
    // Extract query from URL or title
    let query = url;
    if (url.includes('google.com/search')) {
      // Extract search query from Google URL
      const urlObj = new URL(url);
      const searchParams = urlObj.searchParams;
      if (searchParams.has('q')) {
        query = searchParams.get('q');
      }
    } else {
      // Use page title for non-search URLs
      query = title;
    }
    
    // Extract URLs from the page for Topic agent
    const urls = await extractLinksFromWebview(webview);
    
    // Get selected agent type
    const agentSelector = document.getElementById('agentSelector');
    let agentType = agentSelector.value;

    // Auto-detect flight queries
    const flightKeywords = [
      'flights', 'cheap flights', 'airline', 'book a flight', 'travel from', 
      'travel to', 'fly to', 'fly from', 'flight from', 'flight to', 'airfare'
    ];
    
    // Check if query contains flight-related keywords
    const isFlightQuery = flightKeywords.some(keyword => 
      query.toLowerCase().includes(keyword.toLowerCase()));
    
    // Switch to flight agent if query is flight-related
    if (isFlightQuery && agentType !== 'flight') {
      console.log(`Flight-related query detected: "${query}". Switching to flight agent.`);
      agentType = 'flight';
      agentSelector.value = 'flight';
    }
    
    // If we want to use the topic agent and have extracted urls, pass them
    // For other agents like crypto, just use the query
    let agentParams = { 
      query,
      modelInfo: {
        provider,
        apiKey
      }
    };
    
    if (agentType === 'topic' && urls.length > 0) {
      agentParams = {
        query,
        urls: urls.slice(0, 5), // Pass up to 5 URLs to the agent
        modelInfo: {
          provider,
          apiKey
        }
      };
    }
    
    // Set path to agent based on selection
    const agentPath = `${__dirname}/agents/${agentType}_agent.py`;
    console.log(`Executing agent at: ${agentPath} with params:`, {
      query: agentParams.query,
      urls: agentParams.urls ? agentParams.urls.length : 0,
      pageContent: agentParams.pageContent ? "Present" : "None",
      modelInfo: agentParams.modelInfo ? {
        provider: agentParams.modelInfo.provider,
        hasApiKey: !!agentParams.modelInfo.apiKey
      } : "None"
    });
    logRendererEvent(`Executing agent: ${agentType} with query: ${query}`);
    
    // Update UI to show loading
    const agentResults = document.getElementById('agentResults');
    if (agentResults) {
      agentResults.innerHTML = '<div class="loading">Loading agent results...</div>';
    } else {
      console.error("agentResults element not found!");
      logRendererEvent("agentResults element not found!");
    }
    
    // Call the main process to execute the agent
    const result = await ipcRenderer.invoke('execute-agent', {
      agentPath,
      agentParams
    });
    
    console.log(`Agent result received:`, result);
    
    if (result.success === false) {
      displayAgentError(result.error);
    } else {
      displayAgentResults(result.data);
    }
  } catch (error) {
    console.error("Agent execution error:", error);
    logRendererEvent(`Agent execution error: ${error.message}`);
    displayAgentError(error.message);
  }
}

// Extract links from the webview (Google search results)
async function extractLinksFromWebview(specificWebview = null) {
  const webview = specificWebview || getActiveWebview();
  if (!webview) {
    console.error('No webview available for extracting links');
    return [];
  }
  
  // Get current URL
  const currentUrl = webview.getURL();
  
  // Be more careful with problematic sites
  if (isProblematicSite(currentUrl)) {
    console.log('Skipping link extraction for problematic site:', currentUrl);
    return []; // Return empty array for problematic sites
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Check if webview is still loading
      if (webview.isLoading()) {
        console.log('Waiting for webview to finish loading before extracting links');
        webview.addEventListener('did-finish-load', () => {
          setTimeout(() => {
            extractLinksFromWebview(webview).then(resolve).catch(reject);
          }, 500); // Add small delay to ensure content is fully loaded
        }, { once: true });
        return;
      }
      
      // The code to execute in the webview context
      const extractLinksScript = `
        (function() {
          // Get all search result links with various selectors that Google uses
          let links = [];
          
          // Method 1: Standard Google result links
          document.querySelectorAll('div.g a').forEach(el => {
            if (el.href.startsWith('http') && 
                !el.href.includes('google.com') && 
                !links.includes(el.href)) {
              links.push(el.href);
            }
          });
          
          // Method 2: Alternative selectors
          document.querySelectorAll('div[jscontroller] a[href^="http"]').forEach(el => {
            if (!el.href.includes('google.com') && !links.includes(el.href)) {
              links.push(el.href);
            }
          });
          
          // Method 3: Direct search for h3 parents (modern Google)
          document.querySelectorAll('h3').forEach(h3 => {
            const parent = h3.closest('a');
            if (parent && parent.href && 
                parent.href.startsWith('http') && 
                !parent.href.includes('google.com') && 
                !links.includes(parent.href)) {
              links.push(parent.href);
            }
            
            // Sometimes h3 is near the link but not a direct parent
            const container = h3.closest('div');
            if (container) {
              const nearbyLink = container.querySelector('a[href^="http"]');
              if (nearbyLink && 
                  !nearbyLink.href.includes('google.com') && 
                  !links.includes(nearbyLink.href)) {
                links.push(nearbyLink.href);
              }
            }
          });
          
          // Method 4: Basic fallback - get all external links
          if (links.length === 0) {
            document.querySelectorAll('a[href^="http"]').forEach(el => {
              if (!el.href.includes('google.com') && 
                  !el.href.includes('accounts.google') &&
                  !links.includes(el.href)) {
                links.push(el.href);
              }
            });
          }
          
          // Filter out common non-result links
          return links.filter(url => 
            !url.includes('accounts.google') && 
            !url.includes('support.google') &&
            !url.includes('/preferences') &&
            !url.includes('/webhp') &&
            !url.includes('/complete/search')
          ).slice(0, 10); // Return up to 10 unique links
        })();
      `;
      
      // Execute the script in the webview with a timeout
      const timeoutPromise = new Promise((_, timeoutReject) => {
        setTimeout(() => timeoutReject(new Error('Script execution timed out')), 5000);
      });
      
      Promise.race([
        webview.executeJavaScript(extractLinksScript),
        timeoutPromise
      ])
      .then(links => {
        console.log('Extracted links:', links);
        resolve(links || []);
      })
      .catch(err => {
        console.error('Error executing script in webview:', err);
        // Return empty links array on error instead of failing
        resolve([]);
      });
    } catch (error) {
      console.error('Error in extractLinksFromWebview:', error);
      resolve([]); // Return empty array rather than rejecting
    }
  });
}

function displayAgentResults(data) {
  const agentResults = document.getElementById('agentResults');
  agentResults.innerHTML = '';

  if (!data) {
    agentResults.innerHTML = '<div class="error-message"><p>No data received from agent</p></div>';
    return;
  }

  if (data.summaries) {
    // Create container for generation time and consolidated summary
    const timingHeader = document.createElement('div');
    timingHeader.className = 'timing-header';
    
    // Format the processing time
    const generationTime = data.generation_time || 0;
    const formattedTime = generationTime.toFixed(2);
    
    // Add the consolidated summary if available
    if (data.consolidated_summary) {
      const consolidatedDiv = document.createElement('div');
      consolidatedDiv.className = 'consolidated-summary';
      consolidatedDiv.innerHTML = `
        <div class="timing-info">
          <span>Summary generated in</span>
          <span class="time-value">${formattedTime}s</span>
          <span>using ${getModelName()}</span>
        </div>
        <div class="summary-content">${data.consolidated_summary}</div>
      `;
      agentResults.appendChild(consolidatedDiv);
    } else {
      // If no consolidated summary, still add the query
      const queryHeader = document.createElement('div');
      queryHeader.className = 'query-header';
      queryHeader.innerHTML = `<h3>Results for: "${data.query}"</h3>`;
      agentResults.appendChild(queryHeader);
    }
    
    // Create container for individual summaries
    const resultsDiv = document.createElement('div');
    resultsDiv.className = 'summary-container';
    
    // Add each summary
    data.summaries.forEach(summary => {
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'summary-item';
      
      // Use title if available, otherwise just show URL
      const title = summary.title || new URL(summary.url).hostname;
      
      summaryDiv.innerHTML = `
        <h4><a href="${summary.url}" target="_blank">${title}</a></h4>
        <div class="summary-url"><a href="${summary.url}" target="_blank">${summary.url}</a></div>
        <div class="summary-content">${summary.summary}</div>
      `;
      resultsDiv.appendChild(summaryDiv);
    });
    agentResults.appendChild(resultsDiv);
  } else if (data.cryptocurrencies) {
    // Crypto agent results
    const table = document.createElement('table');
    table.className = 'crypto-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Name</th>
          <th>Price</th>
          <th>24h Change</th>
          <th>Market Cap</th>
        </tr>
      </thead>
      <tbody>
        ${data.cryptocurrencies.map(crypto => `
          <tr>
            <td>${crypto.name} (${crypto.symbol})</td>
            <td>${crypto.price}</td>
            <td class="${parseFloat(crypto.change_24h) >= 0 ? 'positive' : 'negative'}">
              ${crypto.change_24h}
            </td>
            <td>${crypto.market_cap}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    agentResults.appendChild(table);
  } else if (data.flights) {
    // Flight agent results
    const queryHeader = document.createElement('div');
    queryHeader.className = 'query-header';
    queryHeader.innerHTML = `<h3>Flight Results: "${data.query}"</h3>`;
    
    if (data.search_details) {
      const details = data.search_details;
      queryHeader.innerHTML += `
        <div class="search-details">
          ${details.origin ? `<span>From: ${details.origin}</span>` : ''}
          ${details.destination ? `<span>To: ${details.destination}</span>` : ''}
          ${details.departure_date ? `<span>Departure: ${details.departure_date}</span>` : ''}
          ${details.return_date ? `<span>Return: ${details.return_date}</span>` : ''}
        </div>
      `;
    }
    
    agentResults.appendChild(queryHeader);
    
    // Link to Google Flights
    if (data.flights_url) {
      const flightsLink = document.createElement('div');
      flightsLink.className = 'flights-link';
      flightsLink.innerHTML = `<p><a href="${data.flights_url}" target="_blank">View on Google Flights →</a></p>`;
      agentResults.appendChild(flightsLink);
    }
    
    // Flight results table
    const table = document.createElement('table');
    table.className = 'flights-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Airline</th>
          <th>Departure</th>
          <th>Arrival</th>
          <th>Duration</th>
          <th>Price</th>
        </tr>
      </thead>
      <tbody>
        ${data.flights.map(flight => `
          <tr>
            <td>${flight.airline}</td>
            <td>${flight.departure}</td>
            <td>${flight.arrival}</td>
            <td>${flight.duration}</td>
            <td class="price">${flight.price}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    agentResults.appendChild(table);
  } else {
    agentResults.innerHTML = '<div class="info-message"><p>Received data in unexpected format</p></div>';
    console.log('Unexpected data format:', data);
  }
}

function displayAgentError(error) {
  const agentResults = document.getElementById('agentResults');
  agentResults.innerHTML = `
    <div class="error-message">
      <p>Error: ${error}</p>
    </div>
  `;
}

dragbar.addEventListener('mousedown', function(e) {
    isDragging = true;
    document.body.style.cursor = 'ew-resize';
});

document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    const containerRect = document.querySelector('.content-container').getBoundingClientRect();
    let newWidth = e.clientX - containerRect.left;
    // Set min/max widths
    if (newWidth < 100) newWidth = 100;
    if (newWidth > containerRect.width - 320) newWidth = containerRect.width - 320;
    webviewsContainer.style.flex = '0 0 auto';
    webviewsContainer.style.width = newWidth + 'px';
    agentContainer.style.flex = '1 1 0%';
});

document.addEventListener('mouseup', function(e) {
    if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
    }
});

// Use IPC to log from renderer to main
function logRendererEvent(message) {
    ipcRenderer.send('renderer-log', message);
}

// Auto-summarize the current page/search
async function autoSummarizePage(url, specificWebview = null) {
  console.log('Auto-summarizing page:', url);
  
  // Skip summarization for problematic sites
  if (isProblematicSite(url)) {
    console.log('Skipping auto-summarization for problematic site:', url);
    const agentResults = document.getElementById('agentResults');
    if (agentResults) {
      agentResults.innerHTML = `
        <div class="info-message">
          <p>Auto-summarization disabled for this site to prevent rendering issues.</p>
          <p>You can still manually run the agent if needed.</p>
        </div>
      `;
    }
    return;
  }
  
  // Use provided webview or get active webview
  const webview = specificWebview || getActiveWebview();
  if (!webview) {
    console.error('No webview available for auto-summarize');
    return;
  }
  
  // Set agent selector to topic agent
  const agentSelector = document.getElementById('agentSelector');
  if (agentSelector) {
    agentSelector.value = 'topic';
  }
  
  // Get selected model and its API key (similar to executeAgent)
  const modelSelector = document.getElementById('modelSelector');
  const provider = modelSelector ? modelSelector.value : 'anthropic'; // Default to anthropic if selector not found
  const apiKey = localStorage.getItem(`${provider}_api_key`);
  
  if (!apiKey) {
    const agentResults = document.getElementById('agentResults');
    if (agentResults) {
      agentResults.innerHTML = `
        <div class="error-message">
          <p>Please configure your ${provider} API key in the Extensions panel first.</p>
        </div>
      `;
    }
    return;
  }
  
  // Show loading indicator in agent results
  const agentResults = document.getElementById('agentResults');
  if (agentResults) {
    agentResults.innerHTML = '<div class="loading">Auto-summarizing...</div>';
  }
  
  // Check if it's a Google search
  const isGoogleSearch = url.includes('google.com/search');
  
  try {
    if (isGoogleSearch) {
      // Check if page is still loading
      if (webview.isLoading()) {
        console.log('Page still loading, will retry after load completes');
        webview.addEventListener('did-finish-load', () => {
          setTimeout(() => autoSummarizePage(url, webview), 1000);
        }, { once: true });
        return;
      }
      
      // Allow a bit more time for Google results to render
      setTimeout(() => {
        console.log(`Auto-summarizing Google search with model: ${provider}`);
        // We need to manually set the modelSelector value before calling executeAgent
        if (modelSelector) {
          modelSelector.value = provider;
        }
        // Now call executeAgent with the webview
        executeAgent(webview);
      }, 1000);
    } else {
      // For regular pages, summarize the current page content
      try {
        // Check if page is still loading
        if (webview.isLoading()) {
          console.log('Page still loading, will retry after load completes');
          webview.addEventListener('did-finish-load', () => {
            setTimeout(() => autoSummarizePage(url, webview), 1000);
          }, { once: true });
          return;
        }
        
        // Extract content directly from the page
        const pageContent = await extractPageContent(webview);
        
        // Process with topic agent
        const agentPath = `${__dirname}/agents/topic_agent.py`;
        const agentParams = {
          query: url,
          pageContent: pageContent,
          isDirectPage: true,
          modelInfo: {
            provider,
            apiKey
          }
        };
        
        console.log('Executing agent for direct page content');
        const result = await ipcRenderer.invoke('execute-agent', {
          agentPath,
          agentParams
        });
        
        if (result.success === false) {
          displayAgentError(result.error);
        } else {
          displayAgentResults(result.data);
        }
      } catch (error) {
        console.error('Error auto-summarizing page:', error);
        displayAgentError(error.message);
      }
    }
  } catch (error) {
    console.error('Error in autoSummarizePage:', error);
    displayAgentError('Auto-summarization failed: ' + error.message);
  }
}

// Extract content from the current page with improved error handling
async function extractPageContent(specificWebview = null) {
  const webview = specificWebview || getActiveWebview();
  if (!webview) {
    console.error('No webview available for extracting page content');
    return { title: '', description: '', content: '', url: '' };
  }
  
  // Get current URL
  const currentUrl = webview.getURL();
  
  // Be more careful with problematic sites
  if (isProblematicSite(currentUrl)) {
    console.log('Using safer content extraction for problematic site:', currentUrl);
    // Return minimal content to avoid WebFrame errors
    return {
      title: webview.getTitle() || '',
      description: '',
      content: 'Content extraction skipped for this site to prevent rendering issues.',
      url: currentUrl
    };
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Check if webview is still loading
      if (webview.isLoading()) {
        console.log('Waiting for webview to finish loading before extracting content');
        webview.addEventListener('did-finish-load', () => {
          setTimeout(() => {
            extractPageContent(webview).then(resolve).catch(reject);
          }, 500); // Add small delay to ensure content is fully loaded
        }, { once: true });
        return;
      }
      
      const extractScript = `
        (function() {
          try {
            // Get page title
            const title = document.title || '';
            
            // Get metadata
            let description = "";
            try {
              const metaDesc = document.querySelector('meta[name="description"]');
              if (metaDesc) description = metaDesc.getAttribute('content') || '';
            } catch(e) {
              console.error('Error getting meta description:', e);
            }
            
            // Get main content by trying various selectors
            let content = "";
            
            try {
              // Try article or main content first
              const mainContent = document.querySelector('article') || 
                                document.querySelector('main') || 
                                document.querySelector('.content') ||
                                document.querySelector('#content');
              
              if (mainContent) {
                content = mainContent.innerText || '';
              } else {
                // Fallback to body text, skipping headers, footers, navs
                const body = document.body;
                if (body) {
                  const elementsToSkip = ['header', 'footer', 'nav', 'aside', 'script', 'style'];
                  
                  // Function to extract text from the DOM while skipping unwanted elements
                  function extractText(element, depth = 0) {
                    if (!element || depth > 100) return "";
                    
                    // Skip unwanted elements
                    if (element.tagName && elementsToSkip.includes(element.tagName.toLowerCase())) {
                      return "";
                    }
                    
                    // If it's a text node, return its text
                    if (element.nodeType === Node.TEXT_NODE) {
                      return element.textContent ? (element.textContent.trim() + " ") : "";
                    }
                    
                    // If it has the 'hidden' class or inline style display:none, skip it
                    if ((element.classList && element.classList.contains('hidden')) ||
                        (element.style && element.style.display === 'none')) {
                      return "";
                    }
                    
                    // Process children recursively
                    let result = "";
                    if (element.childNodes) {
                      for (const child of element.childNodes) {
                        result += extractText(child, depth + 1);
                      }
                    }
                    
                    return result;
                  }
                  
                  content = extractText(body);
                }
              }
            } catch(e) {
              console.error('Error extracting content:', e);
              // Attempt a very simple fallback
              try {
                content = document.body ? document.body.innerText || '' : '';
              } catch(e2) {
                console.error('Fallback content extraction failed:', e2);
              }
            }
            
            return {
              title: title,
              description: description,
              content: content,
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
      
      // Execute the script in the webview with a timeout
      const timeoutPromise = new Promise((_, timeoutReject) => {
        setTimeout(() => timeoutReject(new Error('Script execution timed out')), 5000);
      });
      
      Promise.race([
        webview.executeJavaScript(extractScript),
        timeoutPromise
      ])
      .then(pageInfo => {
        console.log('Extracted page content, length:', pageInfo?.content?.length || 0);
        resolve(pageInfo || { title: '', description: '', content: '', url: '' });
      })
      .catch(err => {
        console.error('Error executing script in webview:', err);
        // Return empty object on error instead of failing
        resolve({ 
          title: webview.getTitle() || '', 
          description: '', 
          content: `Error: ${err.message}`, 
          url: currentUrl 
        });
      });
    } catch (error) {
      console.error('Error in extractPageContent:', error);
      resolve({ title: '', description: '', content: '', url: currentUrl });
    }
  });
}

// Also hook into form submissions to catch Google searches
webview.addEventListener('did-start-navigation', (event) => {
  if (event.url.includes('google.com/search')) {
    // This is likely a Google search - we'll auto-summarize after it loads
    console.log('Google search detected');
  }
});

// Set up keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Ctrl+T: New tab
  if (e.ctrlKey && e.key === 't') {
    e.preventDefault();
    createNewTab();
  }
  
  // Ctrl+W: Close current tab
  if (e.ctrlKey && e.key === 'w') {
    e.preventDefault();
    if (activeTabId) {
      closeTab(activeTabId);
    }
  }
  
  // Ctrl+Tab: Next tab
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    cycleTab(1);
  }
  
  // Ctrl+Shift+Tab: Previous tab
  if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
    e.preventDefault();
    cycleTab(-1);
  }
});

// Function to cycle through tabs
function cycleTab(direction) {
  if (tabs.length <= 1) return;
  
  const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
  if (currentIndex === -1) return;
  
  // Calculate new index with wrapping
  let newIndex = (currentIndex + direction) % tabs.length;
  if (newIndex < 0) newIndex = tabs.length - 1;
  
  // Select the tab
  selectTab(tabs[newIndex].id);
}

// Helper to get active tab object
function getActiveTab() {
  if (!activeTabId) return null;
  return tabs.find(tab => tab.id === activeTabId);
}

// Add API key configuration section to extensions panel
function setupExtensionsPanel() {
  const extensionsContent = document.querySelector('.extensions-content');
  if (extensionsContent) {
    // Add API Keys section
    const apiKeysSection = document.createElement('div');
    apiKeysSection.className = 'api-keys-section';
    apiKeysSection.innerHTML = `
      <h4>API Keys</h4>
      <div class="api-key-inputs">
        <div class="api-key-input">
          <label>OpenAI API Key</label>
          <input type="password" id="openaiApiKey" placeholder="sk-...">
          <button class="save-api-key" data-provider="openai">Save</button>
        </div>
        <div class="api-key-input">
          <label>Anthropic API Key</label>
          <input type="password" id="anthropicApiKey" placeholder="sk-ant-...">
          <button class="save-api-key" data-provider="anthropic">Save</button>
        </div>
        <div class="api-key-input">
          <label>Perplexity API Key</label>
          <input type="password" id="perplexityApiKey" placeholder="pplx-...">
          <button class="save-api-key" data-provider="perplexity">Save</button>
        </div>
        <div class="api-key-input">
          <label>Chutes API Key</label>
          <input type="password" id="chutesApiKey" placeholder="ch-...">
          <button class="save-api-key" data-provider="chutes">Save</button>
        </div>
      </div>
    `;
    extensionsContent.appendChild(apiKeysSection);

    // Load saved API keys
    const providers = ['openai', 'anthropic', 'perplexity', 'chutes'];
    providers.forEach(provider => {
      const savedKey = localStorage.getItem(`${provider}_api_key`);
      if (savedKey) {
        document.getElementById(`${provider}ApiKey`).value = savedKey;
      }
    });

    // Add save event listeners
    document.querySelectorAll('.save-api-key').forEach(button => {
      button.addEventListener('click', () => {
        const provider = button.dataset.provider;
        const input = document.getElementById(`${provider}ApiKey`);
        const apiKey = input.value.trim();
        if (apiKey) {
          localStorage.setItem(`${provider}_api_key`, apiKey);
          alert(`${provider} API key saved!`);
        }
      });
    });
  }
}

// Update agent controls to include model selection
function setupAgentControls() {
  const agentControls = document.querySelector('.agent-controls');
  if (agentControls) {
    // Add model selector
    const modelSelector = document.createElement('select');
    modelSelector.id = 'modelSelector';
    modelSelector.innerHTML = `
      <option value="anthropic">Claude (Anthropic)</option>
      <option value="openai">GPT-4 (OpenAI)</option>
      <option value="perplexity">Perplexity</option>
      <option value="chutes">Chutes</option>
    `;
    
    // Insert model selector before the Run Agent button
    const runAgentBtn = document.getElementById('runAgentBtn');
    if (runAgentBtn) {
      agentControls.insertBefore(modelSelector, runAgentBtn);
    }
  }
}

// Helper function to get the current model name
function getModelName() {
  const modelSelector = document.getElementById('modelSelector');
  if (!modelSelector) return "AI model";
  
  // Get text content of the selected option
  const selectedOption = modelSelector.options[modelSelector.selectedIndex];
  return selectedOption ? selectedOption.textContent : "AI model";
} 