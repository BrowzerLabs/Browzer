// IMMEDIATE DEBUGGING - Alert at the very start
console.log("Renderer script loaded");

// Add a global error handler at the top of the file to help with debugging
window.addEventListener('error', function(event) {
  console.error('Global error caught:', event.error);
  
  // Log error details
  if (event.error && event.error.stack) {
    console.error('Error stack:', event.error.stack);
  }
  
  // Show a toast if errors happen in the renderer
  try {
    showToast('Error: ' + (event.error ? event.error.message : 'Unknown error'));
  } catch (e) {
    // If showToast isn't defined yet, create a simple alert
    console.error('Could not show toast, error occurred before UI initialized:', e);
  }
});

const { ipcRenderer, shell } = require('electron');
// Don't use the global webview reference
// const webview = document.getElementById('webview');
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
    
    // Set the preload script path
    const preloadScriptPath = `file://${__dirname}/preload.js`;
    
    // Add standard attributes
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('webpreferences', 'contextIsolation=false, nodeIntegration=true');
    webview.setAttribute('nodeintegration', 'true');
    webview.setAttribute('preload', preloadScriptPath);
    
    // Add special attributes for problematic sites
    if (needsSpecialSettings) {
      console.log('Adding special webview settings for problematic site:', url);
      webview.setAttribute('webpreferences', 'contextIsolation=false, javascript=true, webSecurity=true, allowRunningInsecureContent=false, nodeIntegration=true');
      webview.setAttribute('partition', 'persist:safemode');
      webview.setAttribute('disablewebsecurity', 'false');
      webview.setAttribute('preload', preloadScriptPath);
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
    
    // Auto-summarize the newly selected tab if enabled
    if (autoSummarizeEnabled) {
      const webview = document.getElementById(tabs[tabIndex].webviewId);
      if (webview && webview.src && webview.src.startsWith('http')) {
        console.log('Tab switched - auto-summarizing new active tab:', tabId);
        setTimeout(() => {
          autoSummarizePage(webview.src, webview);
        }, 500);
      }
    }
    
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
  console.log('Setting up webview events for webview:', webview.id);
  
  // Standard webview events
  webview.addEventListener('did-start-loading', () => {
    console.log('Webview started loading:', webview.id);
    const tabId = getTabIdFromWebview(webview.id);
    if (tabId) {
      const tab = document.getElementById(tabId);
      if (tab) {
        tab.classList.add('loading');
      }
    }
  });

  webview.addEventListener('did-finish-load', () => {
    console.log('Webview finished loading:', webview.id);
    const tabId = getTabIdFromWebview(webview.id);
    if (tabId) {
      const tab = document.getElementById(tabId);
      if (tab) {
        tab.classList.remove('loading');
      }
    }
    
    // Update URL bar
    urlBar.value = webview.src;
    
    // Update tab title
    updateTabTitle(webview, webview.getTitle());
    
    // Update navigation buttons
    updateNavigationButtons();
    
    // Auto-summarize if enabled (for any page, not just Google)
    const url = webview.src;
    if (autoSummarizeEnabled && url) {
      // Skip auto-summarizing about:blank and other non-http pages
      if (url.startsWith('http')) {
        // Only auto-summarize if this is the active tab
        const isActiveTab = tabId === activeTabId;
        if (isActiveTab) {
          console.log('Auto-summarize enabled for active tab, will summarize:', url);
          // Add a delay to make sure page has finished rendering
          setTimeout(() => {
            autoSummarizePage(url, webview);
          }, 1500);
        } else {
          console.log('Skipping auto-summarize for inactive tab:', tabId);
        }
      }
    }
  });

  // Handle page title changes
  webview.addEventListener('page-title-updated', (e) => {
    updateTabTitle(webview, e.title);
  });

  // Handle favicon changes
  webview.addEventListener('page-favicon-updated', (e) => {
    if (e.favicons && e.favicons.length > 0) {
      updateTabFavicon(webview, e.favicons[0]);
    }
  });

  // Handle new window/tab requests
  webview.addEventListener('new-window', (e) => {
    createNewTab(e.url);
  });
  
  // Listen for messages from the webview (for Add to chat)
  webview.addEventListener('ipc-message', (event) => {
    console.log('Received ipc-message from webview:', event.channel, event.args);
    if (event.channel === 'add-to-chat') {
      console.log('Processing add-to-chat via IPC with text:', event.args[0]);
      addSelectedTextToChat(event.args[0]);
    }
  });
  
  // Additional debug ipc listeners to help track messages
  webview.addEventListener('console-message', (event) => {
    console.log(`Webview ${webview.id} console:`, event.message);
  });
  
  // Inject our selection handler script
  injectSelectionHandler(webview);
  
  console.log('All webview event listeners set up for:', webview.id);
}

// Add this function at the top of the file
// Handler for messages from webviews
window.addEventListener('message', function(event) {
  // Make sure the message is from our webview
  console.log('Received window message event:', event.data);
  if (event.data && event.data.type === 'add-to-chat') {
    console.log('Received add-to-chat message via postMessage:', event.data.text);
    addSelectedTextToChat(event.data.text);
  }
});

// Modify the addSelectedTextToChat function
function addSelectedTextToChat(selectedText) {
  if (!selectedText || selectedText.trim().length === 0) {
    console.error('No text to add to chat');
    showToast('Error: No text selected');
    return;
  }
  
  console.log('Adding text to chat input:', selectedText);
  
  // Limit the text length for very long selections
  const maxLength = 1000;
  let truncated = false;
  if (selectedText.length > maxLength) {
    selectedText = selectedText.substring(0, maxLength);
    truncated = true;
  }
  
  try {
    // Find the chat input field
    const chatInput = document.getElementById('chatInput');
    
    // Make sure we have a chat area
    if (!chatInput) {
      console.log('Chat input not found, initializing chat UI');
      
      // Try to initialize the chat container
      const agentResults = document.getElementById('agentResults');
      if (agentResults) {
        // Clear existing content
        agentResults.innerHTML = '';
        
        // Create chat container
        const newChatContainer = document.createElement('div');
        newChatContainer.id = 'chatContainer';
        newChatContainer.className = 'chat-container';
        agentResults.appendChild(newChatContainer);
        
        // Add chat input
        const chatInputArea = document.createElement('div');
        chatInputArea.className = 'chat-input-area';
        chatInputArea.innerHTML = `
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        `;
        agentResults.appendChild(chatInputArea);
        
        // Set up event handlers for the new input
        setupChatInputHandlers();
        
        // Try again with the newly created input
        const newChatInput = document.getElementById('chatInput');
        if (newChatInput) {
          newChatInput.value = selectedText + (truncated ? ' (text truncated due to length)' : '');
          newChatInput.focus();
          showToast('Text added to input');
        } else {
          showToast('Error: Could not create chat input');
        }
      } else {
        showToast('Error: Chat area not found');
        console.error('Agent results container not found');
      }
    } else {
      // Add the selected text to the input field
      chatInput.value = selectedText + (truncated ? ' (text truncated due to length)' : '');
      chatInput.focus();
      showToast('Text added to input');
    }
  } catch (error) {
    console.error('Error adding text to chat input:', error);
    showToast('Error adding text to chat input');
  }
}

// Add a function to set up chat input event handlers
function setupChatInputHandlers() {
  const sendButton = document.getElementById('sendMessageBtn');
  const chatInput = document.getElementById('chatInput');
  
  if (!sendButton || !chatInput) {
    console.error('Chat input elements not found');
    return;
  }
  
  // Send message function
  const sendMessage = () => {
    const message = chatInput.value.trim();
    if (message) {
      // Add user message to chat
      addMessageToChat('user', message);
      
      // Process the follow-up question
      processFollowupQuestion(message);
      
      // Clear input
      chatInput.value = '';
    }
  };
  
  // Add click handler to send button
  sendButton.addEventListener('click', sendMessage);
  
  // Add keypress handler for Enter key
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  console.log('Chat input handlers set up');
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
    
    // If a specific webview wasn't provided, confirm this is still the active tab
    if (!specificWebview) {
      const tabId = getTabIdFromWebview(webview.id);
      if (tabId !== activeTabId) {
        console.log('Tab changed since agent execution was triggered. Using the new active tab instead.');
        const newWebview = getActiveWebview();
        if (newWebview) {
          return executeAgent(newWebview); // Restart with the correct active webview
        } else {
          console.error('No active webview available for agent execution');
          return;
        }
      }
    }
    
    // Get selected model and its API key with error handling
    const modelSelector = document.getElementById('modelSelector');
    if (!modelSelector) {
      console.error('Model selector not found');
      return;
    }
    
    const provider = modelSelector.value;
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    if (!apiKey) {
      alert(`Please configure your ${provider} API key in the Extensions panel first.`);
      return;
    }
    
    // Get URL and title with proper error handling
    const url = webview && webview.src ? webview.src : '';
    let title = '';
    try {
      title = webview && typeof webview.getTitle === 'function' ? webview.getTitle() : '';
    } catch (e) {
      console.error('Error getting title:', e);
      title = '';
    }
    
    // Use URL as fallback if title is empty
    if (!title) title = url;
    
    // Extract query from URL or title
    let query = url;
    if (url.includes('google.com/search')) {
      try {
        // Extract search query from Google URL
        const urlObj = new URL(url);
        const searchParams = urlObj.searchParams;
        if (searchParams.has('q')) {
          query = searchParams.get('q');
        }
      } catch (e) {
        console.error('Error extracting search query:', e);
      }
    } else {
      // Use page title for non-search URLs
      query = title;
    }
    
    // Get selected agent type with error handling
    const agentSelector = document.getElementById('agentSelector');
    let agentType = 'topic'; // Default to topic if selector not found
    
    if (agentSelector) {
      agentType = agentSelector.value;
    } else {
      console.error('Agent selector not found, using default agent: topic');
    }
    
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
      if (agentSelector) {
        agentSelector.value = 'flight';
      }
    }
    
    // Extract URLs from the page for Topic agent
    let urls = [];
    try {
      urls = await extractLinksFromWebview(webview);
    } catch (e) {
      console.error('Error extracting links:', e);
      // Continue with empty URLs array
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
    
    // Verify the agent type is valid (we know topic_agent.py, flight_agent.py, and crypto_agent.py exist)
    const validAgentTypes = ['topic', 'flight', 'crypto'];
    if (!validAgentTypes.includes(agentType)) {
      console.error(`Invalid agent type: ${agentType}. Using topic agent instead.`);
      agentType = 'topic';
    }
    
    // Update agent path with valid agent type
    const validAgentPath = `${__dirname}/agents/${agentType}_agent.py`;
    
    console.log(`Executing agent at: ${validAgentPath} with params:`, {
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
      // Set up chat container if it doesn't exist
      let chatContainer = document.getElementById('chatContainer');
      if (!chatContainer) {
        console.log('Chat container not found, creating one');
        // Clear existing content
        agentResults.innerHTML = '';
        
        // Create chat container
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
        
        // Add chat input
        const chatInputArea = document.createElement('div');
        chatInputArea.className = 'chat-input-area';
        chatInputArea.innerHTML = `
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        `;
        agentResults.appendChild(chatInputArea);
        
        // Set up chat input handlers
        setupChatInputHandlers();
      }
      
      // Add loading indicator as a message in the chat
      addMessageToChat('assistant', '<div class="loading">Loading agent results...</div>');
    } else {
      console.error("agentResults element not found!");
      logRendererEvent("agentResults element not found!");
      return;
    }
    
    // Call the main process to execute the agent
    const result = await ipcRenderer.invoke('execute-agent', {
      agentPath: validAgentPath,
      agentParams
    });
    
    console.log(`Agent result received:`, result);
    
    // Remove any loading indicators before showing results
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
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

// Improve extractLinksFromWebview function with better error handling
async function extractLinksFromWebview(specificWebview = null) {
  try {
    const webview = specificWebview || getActiveWebview();
    if (!webview) {
      console.error('No webview available for extracting links');
      return [];
    }
    
    // Get current URL safely
    let currentUrl = '';
    try {
      currentUrl = webview.src || '';
    } catch (e) {
      console.error('Error getting webview URL:', e);
      return [];
    }
    
    // Be more careful with problematic sites
    if (isProblematicSite(currentUrl)) {
      console.log('Skipping link extraction for problematic site:', currentUrl);
      return []; // Return empty array for problematic sites
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Check if webview is still loading
        if (webview.isLoading && webview.isLoading()) {
          console.log('Waiting for webview to finish loading before extracting links');
          webview.addEventListener('did-finish-load', () => {
            setTimeout(() => {
              extractLinksFromWebview(webview).then(resolve).catch(e => {
                console.error('Error in delayed link extraction:', e);
                resolve([]);
              });
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
  } catch (outerError) {
    console.error('Outer error in extractLinksFromWebview:', outerError);
    return []; // Return empty array for any outer error
  }
}

// Add this function to safely clear loading indicators and update chat
function clearLoadingAndUpdateChat(role, content, timing = null) {
  // First remove any loading indicators
  const agentResults = document.getElementById('agentResults');
  if (agentResults) {
    const loadingIndicators = agentResults.querySelectorAll('.loading');
    loadingIndicators.forEach(indicator => {
      indicator.remove();
    });
  }
  
  // Then add the message to chat
  addMessageToChat(role, content, timing);
}

// Update displayAgentResults to use the new function
function displayAgentResults(data) {
  if (!data) {
    clearLoadingAndUpdateChat('assistant', 'No data received from agent');
    return;
  }

  if (data.summaries) {
    // Format the processing time
    const generationTime = data.generation_time || 0;
    
    // If we have a consolidated summary, show it
    if (data.consolidated_summary) {
      // Check if there's a query to include
      let responseContent = '';
      if (data.query) {
        responseContent = `<div class="summary-header">
          <h4>Summary: ${data.query}</h4>
        </div>
        <div class="summary-content">${data.consolidated_summary}</div>`;
      } else {
        responseContent = `<div class="summary-content">${data.consolidated_summary}</div>`;
      }
      
      clearLoadingAndUpdateChat('assistant', responseContent, generationTime);
    } else {
      // Otherwise, compile a response from individual summaries
      let response = '';
      if (data.summaries.length > 0) {
        if (data.query) {
          response += `<div class="summary-header"><h4>Results for: "${data.query}"</h4></div>`;
        }
        
        response += '<div class="summary-container">';
        data.summaries.forEach(summary => {
          response += `
            <div class="summary-item">
              <h4>${summary.title || 'Summary'}</h4>
              ${summary.url ? `<div class="summary-url">${summary.url}</div>` : ''}
              <div class="summary-content">${summary.summary}</div>
            </div>
          `;
        });
        response += '</div>';
      } else {
        response = `<div class="info-message">No results found for: "${data.query}"</div>`;
      }
      clearLoadingAndUpdateChat('assistant', response, generationTime);
    }
  } else if (data.cryptocurrencies) {
    // Crypto agent results
    const response = document.createElement('div');
    
    // Add a header with the query or a default title
    const header = document.createElement('div');
    header.className = 'summary-header';
    header.innerHTML = `<h4>${data.query || 'Cryptocurrency Market Overview'}</h4>`;
    response.appendChild(header);
    
    // Add generation time if available
    if (data.generation_time) {
      const timeInfo = document.createElement('div');
      timeInfo.className = 'time-info';
      timeInfo.innerHTML = `Data as of ${new Date().toLocaleString()}`;
      response.appendChild(timeInfo);
    }
    
    // Create the table
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
            <td><strong>${crypto.name}</strong> <span class="crypto-symbol">${crypto.symbol}</span></td>
            <td>${crypto.price}</td>
            <td class="${parseFloat(crypto.change_24h) >= 0 ? 'positive' : 'negative'}">
              ${parseFloat(crypto.change_24h) >= 0 ? '▲' : '▼'} ${crypto.change_24h}
            </td>
            <td>${crypto.market_cap}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    response.appendChild(table);
    
    clearLoadingAndUpdateChat('assistant', response.outerHTML, data.generation_time);
  } else if (data.flights) {
    // Flight agent results
    const response = document.createElement('div');
    
    // Add header
    const queryHeader = document.createElement('div');
    queryHeader.className = 'summary-header';
    queryHeader.innerHTML = `<h4>Flight Results: "${data.query}"</h4>`;
    response.appendChild(queryHeader);
    
    // Add search details if available
    if (data.search_details) {
      const details = data.search_details;
      const detailsElement = document.createElement('div');
      detailsElement.className = 'search-details';
      detailsElement.innerHTML = `
        ${details.origin ? `<span><strong>From:</strong> ${details.origin}</span>` : ''}
        ${details.destination ? `<span><strong>To:</strong> ${details.destination}</span>` : ''}
        ${details.departure_date ? `<span><strong>Departure:</strong> ${details.departure_date}</span>` : ''}
        ${details.return_date ? `<span><strong>Return:</strong> ${details.return_date}</span>` : ''}
      `;
      response.appendChild(detailsElement);
    }
    
    // Add link to Google Flights if available
    if (data.flights_url) {
      const flightsLink = document.createElement('div');
      flightsLink.className = 'flights-link';
      flightsLink.innerHTML = `<p><a href="${data.flights_url}" target="_blank">View all options on Google Flights →</a></p>`;
      response.appendChild(flightsLink);
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
            <td><strong>${flight.airline}</strong></td>
            <td>${flight.departure}</td>
            <td>${flight.arrival}</td>
            <td>${flight.duration}</td>
            <td class="price">${flight.price}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    response.appendChild(table);
    
    clearLoadingAndUpdateChat('assistant', response.outerHTML, data.generation_time);
  } else {
    clearLoadingAndUpdateChat('assistant', '<div class="info-message"><p>Received data in unexpected format</p></div>');
    console.log('Unexpected data format:', data);
  }
}

function displayAgentError(error) {
  addMessageToChat('assistant', `Error: ${error}`);
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
    addMessageToChat('assistant', '<div class="info-message"><p>Auto-summarization disabled for this site to prevent rendering issues.</p><p>You can still manually run the agent if needed.</p></div>');
    return;
  }
  
  // Use provided webview or get active webview
  const webview = specificWebview || getActiveWebview();
  if (!webview) {
    console.error('No webview available for auto-summarize');
    return;
  }
  
  // Get the tab ID for this webview
  const tabId = getTabIdFromWebview(webview.id);
  
  // Only check if this is the active tab if we weren't passed a specific webview
  // When we're passed a specific webview, it's because we've already verified this is the right one
  if (!specificWebview && tabId !== activeTabId) {
    console.log('Skipping auto-summarize because tab is no longer active:', tabId);
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
    addMessageToChat('assistant', '<div class="error-message"><p>Please configure your API key in the Extensions panel first.</p></div>');
    return;
  }
  
  // Ensure chat container exists
  const agentResults = document.getElementById('agentResults');
  if (agentResults) {
    // Set up chat container if it doesn't exist
    let chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) {
      console.log('Chat container not found, creating one for auto-summarize');
      // Clear existing content
      agentResults.innerHTML = '';
      
      // Create chat container
      chatContainer = document.createElement('div');
      chatContainer.id = 'chatContainer';
      chatContainer.className = 'chat-container';
      agentResults.appendChild(chatContainer);
      
      // Add chat input
      const chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
        <button id="sendMessageBtn" class="chat-send-btn">Send</button>
      `;
      agentResults.appendChild(chatInputArea);
      
      // Set up chat input handlers
      setupChatInputHandlers();
    }
    
    // Add loading indicator as a message
    addMessageToChat('assistant', '<div class="loading">Auto-summarizing...</div>');
  }
  
  // Check if it's a Google search which needs special handling for link extraction
  const isGoogleSearch = url.includes('google.com/search');
  
  try {
    // Check if page is still loading - but be careful with recursive calls
    if (webview.isLoading && typeof webview.isLoading === 'function' && webview.isLoading()) {
      console.log('Page still loading, will wait until it completes');
      
      // Instead of recursive calls that might cause loops, just wait once
      try {
        await new Promise(resolve => {
          const loadListener = () => {
            console.log('Page finished loading, continuing with auto-summarize');
            webview.removeEventListener('did-finish-load', loadListener);
            resolve();
          };
          
          // Set a timeout to avoid waiting forever
          const timeout = setTimeout(() => {
            console.log('Timeout waiting for page to load');
            webview.removeEventListener('did-finish-load', loadListener);
            resolve();
          }, 5000);
          
          webview.addEventListener('did-finish-load', loadListener, { once: true });
        });
        
        // Add a short delay to ensure page is fully rendered
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (loadError) {
        console.error('Error waiting for page to load:', loadError);
        // Continue anyway - we'll do our best with what we have
      }
    }
    
    // For Google searches, we use URLs extracted from the search results
    if (isGoogleSearch) {
      // Extract URLs and process with topic agent
      try {
        const urls = await extractLinksFromWebview(webview);
        console.log(`Extracted ${urls.length} links from Google search results`);
        
        // Extract query from URL
        let query = '';
        try {
          const urlObj = new URL(url);
          const searchParams = urlObj.searchParams;
          if (searchParams.has('q')) {
            query = searchParams.get('q');
          }
        } catch (e) {
          console.error('Error extracting search query:', e);
          query = url;
        }
        
        // Setup agent parameters
        const agentParams = {
          query,
          urls: urls.slice(0, 5),
          modelInfo: {
            provider,
            apiKey
          }
        };
        
        const validAgentPath = `${__dirname}/agents/topic_agent.py`;
        
        console.log(`Executing topic agent for Google search with ${urls.length} URLs`);
        
        // Call the agent directly
        const result = await ipcRenderer.invoke('execute-agent', {
          agentPath: validAgentPath,
          agentParams
        });
        
        // Clear any loading indicators before showing results
        const loadingMessages = document.querySelectorAll('.loading');
        loadingMessages.forEach(message => {
          const parentMessage = message.closest('.chat-message');
          if (parentMessage) {
            parentMessage.remove();
          }
        });
        
        if (result.success === false) {
          displayAgentError(result.error);
        } else {
          displayAgentResults(result.data);
        }
      } catch (error) {
        console.error('Error in auto-summarize Google search:', error);
        
        // Clear loading indicators
        const loadingMessages = document.querySelectorAll('.loading');
        loadingMessages.forEach(message => {
          const parentMessage = message.closest('.chat-message');
          if (parentMessage) {
            parentMessage.remove();
          }
        });
        
        displayAgentError(error.message);
      }
    } else {
      // For regular webpages, extract content directly
      try {
        // Extract content from the page
        const pageContent = await extractPageContent(webview);
        
        // Get page title safely
        let title = '';
        try {
          title = webview.getTitle ? webview.getTitle() : '';
        } catch (e) {
          console.error('Error getting page title:', e);
        }
        
        // Build agent parameters
        const agentParams = {
          query: title || url, // Use page title as query if available
          pageContent: pageContent,
          isDirectPage: true,
          modelInfo: {
            provider,
            apiKey
          }
        };
        
        // Use topic agent for page content
        const validAgentPath = `${__dirname}/agents/topic_agent.py`;
        
        console.log('Executing agent for direct page content');
        const result = await ipcRenderer.invoke('execute-agent', {
          agentPath: validAgentPath,
          agentParams
        });
        
        // Clear any loading indicators before showing results
        const loadingMessages = document.querySelectorAll('.loading');
        loadingMessages.forEach(message => {
          const parentMessage = message.closest('.chat-message');
          if (parentMessage) {
            parentMessage.remove();
          }
        });
        
        if (result.success === false) {
          displayAgentError(result.error);
        } else {
          displayAgentResults(result.data);
        }
      } catch (error) {
        console.error('Error auto-summarizing page:', error);
        
        // Clear loading indicators
        const loadingMessages = document.querySelectorAll('.loading');
        loadingMessages.forEach(message => {
          const parentMessage = message.closest('.chat-message');
          if (parentMessage) {
            parentMessage.remove();
          }
        });
        
        displayAgentError(error.message);
      }
    }
  } catch (error) {
    console.error('Error in autoSummarizePage:', error);
    
    // Clear loading indicators
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    displayAgentError('Auto-summarization failed: ' + error.message);
  }
}

// Improve extractPageContent function with better error handling
async function extractPageContent(specificWebview = null) {
  try {
    const webview = specificWebview || getActiveWebview();
    if (!webview) {
      console.error('No webview available for extracting page content');
      return { title: '', description: '', content: '', url: '' };
    }
    
    // Get current URL safely
    let currentUrl = '';
    try {
      currentUrl = webview.src || '';
    } catch (e) {
      console.error('Error getting webview URL:', e);
      return { title: '', description: '', content: '', url: '' };
    }
    
    // Get title safely
    let title = '';
    try {
      title = webview.getTitle ? webview.getTitle() : '';
    } catch (e) {
      console.error('Error getting webview title:', e);
    }
    
    // Be more careful with problematic sites
    if (isProblematicSite(currentUrl)) {
      console.log('Using safer content extraction for problematic site:', currentUrl);
      // Return minimal content to avoid WebFrame errors
      return {
        title: title || '',
        description: '',
        content: 'Content extraction skipped for this site to prevent rendering issues.',
        url: currentUrl
      };
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Check if webview is still loading - safely
        if (webview.isLoading && typeof webview.isLoading === 'function' && webview.isLoading()) {
          console.log('Waiting for webview to finish loading before extracting content');
          
          const loadListener = () => {
            console.log('Page finished loading, extracting content after short delay');
            setTimeout(() => {
              try {
                extractPageContent(webview).then(resolve).catch(e => {
                  console.error('Error in delayed content extraction:', e);
                  // Even on error, resolve with empty content to avoid hanging
                  resolve({ 
                    title: webview.getTitle ? webview.getTitle() : '', 
                    description: '', 
                    content: 'Error extracting content', 
                    url: currentUrl 
                  });
                });
              } catch (extractError) {
                console.error('Error in content extraction:', extractError);
                resolve({ 
                  title: '', 
                  description: '', 
                  content: 'Error extracting content', 
                  url: currentUrl 
                });
              }
            }, 500);
          };
          
          // Set a timeout to avoid waiting forever
          setTimeout(() => {
            console.log('Timeout waiting for page to load during content extraction');
            webview.removeEventListener('did-finish-load', loadListener);
            resolve({ 
              title: webview.getTitle ? webview.getTitle() : '', 
              description: '', 
              content: 'Timeout while waiting for page to load', 
              url: currentUrl 
            });
          }, 5000);
          
          webview.addEventListener('did-finish-load', loadListener, { once: true });
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
  } catch (outerError) {
    console.error('Outer error in extractPageContent:', outerError);
    return { 
      title: '', 
      description: '', 
      content: 'Error extracting content: ' + outerError.message, 
      url: '' 
    };
  }
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
    // Clear existing controls
    agentControls.innerHTML = '';
    
    // Create a flex container for the controls row
    const controlsRow = document.createElement('div');
    controlsRow.className = 'controls-row';
    
    // Add model selector with icon and label
    const modelSelectorWrapper = document.createElement('div');
    modelSelectorWrapper.className = 'model-selector-wrapper';
    modelSelectorWrapper.innerHTML = `
      <label for="modelSelector" class="selector-label">Model</label>
    `;
    
    const modelSelector = document.createElement('select');
    modelSelector.id = 'modelSelector';
    modelSelector.innerHTML = `
      <option value="anthropic">Claude (Anthropic)</option>
      <option value="openai">GPT-4 (OpenAI)</option>
      <option value="perplexity">Perplexity</option>
      <option value="chutes">Chutes</option>
    `;
    modelSelectorWrapper.appendChild(modelSelector);
    controlsRow.appendChild(modelSelectorWrapper);
    
    // Add Analyze button with icon
    const analyzeButton = document.createElement('button');
    analyzeButton.id = 'runAgentBtn';
    analyzeButton.className = 'agent-btn compact';
    analyzeButton.innerHTML = `<span class="btn-icon">↻</span>Analyze Page`;
    analyzeButton.addEventListener('click', executeAgent);
    controlsRow.appendChild(analyzeButton);
    
    // Add the controls row to the agent controls
    agentControls.appendChild(controlsRow);
    
    // Add auto-summarize toggle if not already present
    let autoSummarizeContainer = document.querySelector('.auto-summarize-container');
    if (!autoSummarizeContainer) {
      autoSummarizeContainer = document.createElement('div');
      autoSummarizeContainer.className = 'auto-summarize-container';
      autoSummarizeContainer.innerHTML = `
        <label class="switch">
          <input type="checkbox" id="autoSummarizeToggle" ${localStorage.getItem('autoSummarize') === 'true' ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
        <span class="auto-summarize-label">Auto-summarize pages</span>
      `;
      agentControls.appendChild(autoSummarizeContainer);
      
      // Set up event listener for the toggle
      const autoSummarizeToggle = document.getElementById('autoSummarizeToggle');
      if (autoSummarizeToggle) {
        autoSummarizeToggle.addEventListener('change', (e) => {
          localStorage.setItem('autoSummarize', e.target.checked);
          console.log('Auto-summarize set to:', e.target.checked);
        });
      }
    }
  }
  
  // Create a chat container for messages
  const agentResults = document.getElementById('agentResults');
  if (agentResults) {
    // Clear existing content
    agentResults.innerHTML = '';
    
    // Add welcome message or instructions
    const welcomeContainer = document.createElement('div');
    welcomeContainer.className = 'welcome-container';
    welcomeContainer.innerHTML = `
      <div class="welcome-icon">🔍</div>
      <h3>AI Browser Assistant</h3>
      <p>Click "Analyze Page" to summarize the current page or get insights about its content.</p>
      <p>You can also select text on any webpage and add it to this chat.</p>
    `;
    agentResults.appendChild(welcomeContainer);
    
    // Add chat container
    const chatContainer = document.createElement('div');
    chatContainer.id = 'chatContainer';
    chatContainer.className = 'chat-container';
    agentResults.appendChild(chatContainer);
    
    // Add input area for follow-up questions
    const chatInputArea = document.createElement('div');
    chatInputArea.className = 'chat-input-area';
    chatInputArea.innerHTML = `
      <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
      <button id="sendMessageBtn" class="chat-send-btn"></button>
    `;
    agentResults.appendChild(chatInputArea);
    
    // Set up the chat input handlers
    setupChatInputHandlers();
  }
}

// Function to add a message to the chat
function addMessageToChat(role, content, timing = null) {
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;
  
  const messageDiv = document.createElement('div');
  
  if (role === 'context') {
    // Special handling for context messages
    messageDiv.className = 'chat-message context-message';
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
  } else if (role === 'user') {
    // User message is simple
    messageDiv.className = 'chat-message user-message';
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
  } else if (role === 'assistant') {
    // Assistant message can include timing info
    messageDiv.className = 'chat-message assistant-message';
    if (timing) {
      messageDiv.innerHTML = `
        <div class="timing-info">
          <span>Summary generated in</span>
          <span class="time-value">${timing.toFixed(2)}s</span>
          <span>using ${getModelName()}</span>
        </div>
        <div class="message-content">${content}</div>
      `;
    } else {
      messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    }
  }
  
  chatContainer.appendChild(messageDiv);
  
  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Process a follow-up question using the topic agent
async function processFollowupQuestion(question) {
  try {
    // Show loading indicator
    addMessageToChat('assistant', '<div class="loading">Processing your question...</div>');
    
    // Get selected model and API key with error handling
    const modelSelector = document.getElementById('modelSelector');
    if (!modelSelector) {
      addMessageToChat('assistant', 'Error: Model selector not found.');
      return;
    }
    
    const provider = modelSelector.value;
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    if (!apiKey) {
      addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
      return;
    }
    
    // Get the active webview to potentially extract content
    const webview = getActiveWebview();
    if (!webview) {
      addMessageToChat('assistant', 'Cannot access current page content.');
      return;
    }
    
    // Extract content from current page for context
    const pageContent = await extractPageContent(webview);
    
    // Prepare agent parameters
    const agentPath = `${__dirname}/agents/topic_agent.py`;

    // Verify the agent path exists (always use topic agent for follow-up questions)
    const validAgentPath = `${__dirname}/agents/topic_agent.py`;

    // Process with topic agent
    const agentParams = {
      query: question,
      pageContent: pageContent,
      isDirectPage: true,
      modelInfo: {
        provider,
        apiKey
      }
    };

    console.log('Processing follow-up question:', question);

    // Call the agent
    const result = await ipcRenderer.invoke('execute-agent', {
      agentPath: validAgentPath,
      agentParams
    });
    
    // Remove the loading message
    const chatContainer = document.getElementById('chatContainer');
    const loadingMessage = chatContainer.querySelector('.assistant-message:last-child');
    if (loadingMessage) {
      chatContainer.removeChild(loadingMessage);
    }
    
    // Display the result
    if (result.success === false) {
      addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
    } else {
      // If we have a consolidated summary, show it
      if (result.data.consolidated_summary) {
        addMessageToChat('assistant', result.data.consolidated_summary, result.data.generation_time);
      } else {
        // Otherwise show individual summaries
        let response = '';
        if (result.data.summaries && result.data.summaries.length > 0) {
          response = result.data.summaries.map(s => s.summary).join('\n\n');
        } else {
          response = 'No information found for your query.';
        }
        addMessageToChat('assistant', response);
      }
    }
  } catch (error) {
    console.error('Error processing follow-up question:', error);
    addMessageToChat('assistant', `Error: ${error.message}`);
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

// Add these new functions
function addSelectedTextToChat(selectedText) {
  if (!selectedText || selectedText.trim().length === 0) {
    console.error('No text to add to chat');
    showToast('Error: No text selected');
    return;
  }
  
  console.log('Adding text to chat input:', selectedText);
  
  // Limit the text length for very long selections
  const maxLength = 1000;
  let truncated = false;
  if (selectedText.length > maxLength) {
    selectedText = selectedText.substring(0, maxLength);
    truncated = true;
  }
  
  try {
    // Find the chat input field
    const chatInput = document.getElementById('chatInput');
    
    // Make sure we have a chat area
    if (!chatInput) {
      console.log('Chat input not found, initializing chat UI');
      
      // Try to initialize the chat container
      const agentResults = document.getElementById('agentResults');
      if (agentResults) {
        // Clear existing content
        agentResults.innerHTML = '';
        
        // Create chat container
        const newChatContainer = document.createElement('div');
        newChatContainer.id = 'chatContainer';
        newChatContainer.className = 'chat-container';
        agentResults.appendChild(newChatContainer);
        
        // Add chat input
        const chatInputArea = document.createElement('div');
        chatInputArea.className = 'chat-input-area';
        chatInputArea.innerHTML = `
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        `;
        agentResults.appendChild(chatInputArea);
        
        // Set up event handlers for the new input
        setupChatInputHandlers();
        
        // Try again with the newly created input
        const newChatInput = document.getElementById('chatInput');
        if (newChatInput) {
          newChatInput.value = selectedText + (truncated ? ' (text truncated due to length)' : '');
          newChatInput.focus();
          showToast('Text added to input');
        } else {
          showToast('Error: Could not create chat input');
        }
      } else {
        showToast('Error: Chat area not found');
        console.error('Agent results container not found');
      }
    } else {
      // Add the selected text to the input field
      chatInput.value = selectedText + (truncated ? ' (text truncated due to length)' : '');
      chatInput.focus();
      showToast('Text added to input');
    }
  } catch (error) {
    console.error('Error adding text to chat input:', error);
    showToast('Error adding text to chat input');
  }
}

function showToast(message) {
  // Create toast element if it doesn't exist
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  
  // Set message and show
  toast.textContent = message;
  toast.className = 'toast show';
  
  // Hide after 3 seconds
  setTimeout(() => {
    toast.className = 'toast';
  }, 3000);
}

// Add new helper function to check for text selection
function checkForTextSelection(webview, isKeyboardShortcut = false) {
  if (!webview || !webview.executeJavaScript) {
    console.error('Invalid webview or missing executeJavaScript method');
    return;
  }

  try {
    webview.executeJavaScript(`
      (function() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text.length > 0) {
          const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
          const rect = range ? range.getBoundingClientRect() : null;
          return {
            text: text,
            rect: rect ? {
              top: rect.top,
              left: rect.left,
              bottom: rect.bottom,
              right: rect.right,
              width: rect.width,
              height: rect.height
            } : null
          };
        }
        return null;
      })()
    `)
    .then(result => {
      console.log('Selection check result:', result);
      if (result && result.text) {
        if (isKeyboardShortcut) {
          // Direct add for keyboard shortcut
          addSelectedTextToChat(result.text);
        } else if (result.rect) {
          // Show button for mouse selection
          showAddToChatButton(webview, result.text, result.rect);
        }
      } else {
        hideAddToChatButton();
      }
    })
    .catch(err => {
      console.error('Error checking text selection:', err);
    });
  } catch (err) {
    console.error('Exception in checkForTextSelection:', err);
  }
}

// Add this function at the end of the file
// Diagnostic function to help debug webview issues
function debugActiveWebview() {
  const activeWebview = getActiveWebview();
  console.log('Debug Active Webview:');
  
  if (!activeWebview) {
    console.log('No active webview found');
    alert('No active webview found');
    return;
  }
  
  const info = {
    id: activeWebview.id,
    src: activeWebview.src,
    isLoading: typeof activeWebview.isLoading === 'function' ? activeWebview.isLoading() : 'not a function',
    hasEventListeners: {
      mouseup: hasEventListener(activeWebview, 'mouseup'),
      keydown: hasEventListener(activeWebview, 'keydown')
    },
    tabId: getTabIdFromWebview(activeWebview.id),
    rect: {
      top: activeWebview.getBoundingClientRect().top,
      left: activeWebview.getBoundingClientRect().left,
      width: activeWebview.getBoundingClientRect().width,
      height: activeWebview.getBoundingClientRect().height
    }
  };
  
  console.log('Active webview info:', info);
  alert(`Active webview: ${info.id}\nSrc: ${info.src}\nEvents attached: ${JSON.stringify(info.hasEventListeners)}`);
}

// Helper function to check if an element has an event listener
function hasEventListener(element, eventType) {
  // This is a best-effort check since there's no standard way to detect listeners
  // Look for our known attached events
  if (eventType === 'mouseup' || eventType === 'keydown') {
    // Check for our debug logging which signals our listener is attached
    const listeners = element.__attachedEventNames || [];
    return listeners.includes(eventType);
  }
  return 'unknown';
}

// Execute this after page load to add a debug button
setTimeout(() => {
  const debugButton = document.createElement('button');
  debugButton.textContent = 'Debug Webview';
  debugButton.style.position = 'fixed';
  debugButton.style.top = '10px';
  debugButton.style.right = '10px';
  debugButton.style.zIndex = '10000';
  debugButton.style.background = 'red';
  debugButton.style.color = 'white';
  debugButton.style.padding = '5px 10px';
  debugButton.style.display = 'none'; // Hidden by default, show with Alt+D
  debugButton.onclick = debugActiveWebview;
  document.body.appendChild(debugButton);
  
  // Add keyboard shortcut Alt+D to show/hide the debug button
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'd') {
      debugButton.style.display = debugButton.style.display === 'none' ? 'block' : 'none';
    }
  });
}, 2000);

// Enhance setupWebviewEvents to track attached event listeners
const originalSetupWebviewEvents = setupWebviewEvents;
setupWebviewEvents = function(webview) {
  // Initialize tracking
  webview.__attachedEventNames = webview.__attachedEventNames || [];
  
  // Track mouseup
  const originalAddEventListener = webview.addEventListener;
  webview.addEventListener = function(eventName, handler, options) {
    webview.__attachedEventNames.push(eventName);
    return originalAddEventListener.call(this, eventName, handler, options);
  };
  
  // Call original function
  originalSetupWebviewEvents(webview);
};

// Add this function to inject scripts into webviews
function injectSelectionHandler(webview) {
  try {
    console.log('Injecting selection handler into webview:', webview.id);
    
    // Wait for webview to finish loading before injecting
    const loadHandler = () => {
      webview.removeEventListener('did-finish-load', loadHandler);
      
      // Inject a script that captures text selection and adds a custom menu
      webview.executeJavaScript(`
        (function() {
          // Avoid double-initialization
          if (window.__hasAddToChatHandler) return;
          window.__hasAddToChatHandler = true;
          
          console.log('Selection handler script injected');
          
          // Add custom styles for the button
          const style = document.createElement('style');
          style.textContent = \`
            #add-to-chat-button {
              position: absolute;
              background-color: #4285f4;
              color: white;
              border: none;
              border-radius: 4px;
              padding: 8px 16px;
              font-size: 14px;
              cursor: pointer;
              box-shadow: 0 4px 8px rgba(0,0,0,0.3);
              z-index: 2147483647;
              display: none;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              transform: translateX(-50%);
              pointer-events: auto;
            }
            
            #add-to-chat-button:hover {
              background-color: #3367d6;
            }
          \`;
          document.head.appendChild(style);
          
          // Create the button
          let button = document.createElement('button');
          button.id = 'add-to-chat-button';
          button.textContent = 'Add to chat';
          button.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const selection = window.getSelection();
            if (selection && selection.toString().trim()) {
              // Use Electron IPC to communicate with the main process
              if (window.electron && window.electron.ipcRenderer) {
                window.electron.ipcRenderer.sendToHost('add-to-chat', selection.toString().trim());
              } else {
                // Fallback to postMessage for compatibility
                window.parent.postMessage({
                  type: 'add-to-chat',
                  text: selection.toString().trim()
                }, '*');
              }
              this.style.display = 'none';
            }
            return false;
          };
          document.body.appendChild(button);
          
          // Function to position the button near selection
          function positionButton(selection) {
            if (!selection || selection.rangeCount === 0) return false;
            
            try {
              const range = selection.getRangeAt(0);
              if (!range) return false;
              
              const rect = range.getBoundingClientRect();
              const buttonWidth = 150; // Approximate width of our button
              
              // Position directly under the selection
              // Add window.scrollX/Y to account for page scroll position
              const top = rect.bottom + window.scrollY + 10;
              
              // Center horizontally on the selection
              const left = rect.left + (rect.width / 2) + window.scrollX;
              
              console.log('Positioning button at:', { top, left, rect });
              
              // Set the button position
              button.style.top = top + 'px';
              button.style.left = left + 'px';
              button.style.display = 'block';
              
              return true;
            } catch (e) {
              console.error('Error positioning Add to Chat button:', e);
              return false;
            }
          }
          
          // Show button when text is selected via mouse
          document.addEventListener('mouseup', function(e) {
            // Short delay to ensure the selection is complete
            setTimeout(() => {
              const selection = window.getSelection();
              const selectedText = selection.toString().trim();
              
              if (selectedText) {
                if (!positionButton(selection)) {
                  console.log('Could not position button, falling back to event coordinates');
                  // Fallback positioning if getBoundingClientRect fails
                  button.style.top = (e.clientY + window.scrollY + 20) + 'px';
                  button.style.left = (e.clientX + window.scrollX) + 'px';
                  button.style.display = 'block';
                }
              } else {
                // Only hide if we didn't click on the button itself
                if (e.target !== button) {
                  button.style.display = 'none';
                }
              }
            }, 10);
          });
          
          // Also support keyboard shortcut (Cmd+Shift+C or Ctrl+Shift+C)
          document.addEventListener('keydown', function(e) {
            const isMac = navigator.platform.includes('Mac');
            const isCtrlShiftC = (isMac && e.metaKey && e.shiftKey && e.code === 'KeyC') || 
                                (!isMac && e.ctrlKey && e.shiftKey && e.code === 'KeyC');
            
            if (isCtrlShiftC) {
              const selection = window.getSelection();
              const selectedText = selection.toString().trim();
              
              if (selectedText) {
                // Use Electron IPC for keyboard shortcut too
                if (window.electron && window.electron.ipcRenderer) {
                  window.electron.ipcRenderer.sendToHost('add-to-chat', selectedText);
                } else {
                  // Fallback to postMessage
                  window.parent.postMessage({
                    type: 'add-to-chat',
                    text: selectedText
                  }, '*');
                }
                button.style.display = 'none';
              }
            }
          });
          
          // Hide button when clicking elsewhere
          document.addEventListener('mousedown', function(e) {
            if (e.target !== button) {
              button.style.display = 'none';
            }
          });
          
          // Handle scroll events to reposition the button if needed
          document.addEventListener('scroll', function() {
            if (button.style.display === 'block') {
              const selection = window.getSelection();
              if (selection && selection.toString().trim()) {
                positionButton(selection);
              } else {
                button.style.display = 'none';
              }
            }
          });
          
          // Pre-assign the electron object if available in this context
          if (!window.electron && window.require) {
            try {
              window.electron = { ipcRenderer: window.require('electron').ipcRenderer };
            } catch (e) {
              console.log('Electron IPC not available in this context');
            }
          }
        })();
      `)
      .catch(err => console.error('Error injecting selection handler:', err));
    };
    
    webview.addEventListener('did-finish-load', loadHandler);
  } catch (err) {
    console.error('Error setting up selection handler:', err);
  }
}

// Add helper functions for tab management
function updateTabTitle(webview, title) {
  try {
    const tabId = getTabIdFromWebview(webview.id);
    if (tabId) {
      const tabTitle = document.querySelector(`#${tabId} .tab-title`);
      if (tabTitle) {
        // Use provided title or get it from webview
        const pageTitle = title || webview.getTitle() || 'New Tab';
        tabTitle.textContent = pageTitle;
        saveTabs(); // Save tabs when title changes
      }
    }
  } catch (error) {
    console.error('Error updating tab title:', error);
  }
}

function updateTabFavicon(webview, faviconUrl) {
  try {
    const tabId = getTabIdFromWebview(webview.id);
    if (tabId) {
      const faviconContainer = document.querySelector(`#${tabId} .tab-favicon`);
      if (faviconContainer) {
        faviconContainer.style.backgroundImage = `url(${faviconUrl})`;
        faviconContainer.classList.add('has-favicon');
      }
    }
  } catch (error) {
    console.error('Error updating favicon:', error);
  }
}
  