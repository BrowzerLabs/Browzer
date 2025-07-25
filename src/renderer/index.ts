import './styles.css';
import './components/ExtensionStore.css';
import './components/WorkflowProgress.css';
import { ExtensionStore } from './components/ExtensionStore';
import WorkflowProgressIndicator from './components/WorkflowProgress';
import { devToolsManager } from './components/DevToolsManager';
import { MemoryService } from './services/MemoryService';
import { TextProcessing } from './utils/textProcessing';

// Import Electron APIs
const { ipcRenderer, shell } = require('electron');
const path = require('path');
// Development feature flag - set to false to disable DoAgent entirely
const DOAGENT_ENABLED = true;

// Type definitions
interface TabInfo {
  id: string;
  url: string;
  title: string;
  isActive: boolean;
  webviewId: string;
  history: any[];
  currentHistoryIndex: number;
  isProblematicSite: boolean;
}

// Global variables and state
let tabs: TabInfo[] = [];
let activeTabId: string = '';
let nextTabId = 1;
let webviewsContainer: HTMLElement | null = null;
let urlBar: HTMLInputElement | null = null;
let backBtn: HTMLButtonElement | null = null;
let forwardBtn: HTMLButtonElement | null = null;
let reloadBtn: HTMLButtonElement | null = null;
let addTabBtn: HTMLButtonElement | null = null;
let modelSelector: HTMLSelectElement | null = null;
let agentResults: HTMLElement | null = null;
let isWorkflowExecuting = false;
let lastProcessedQuery = '';
let lastProcessedTimestamp = 0;
let workflowProgressIndicator: WorkflowProgressIndicator | null = null;
let workflowProgressSetup = false; // Prevent duplicate event listener setup

// Initialize services
let memoryService: MemoryService | null = null;

// Text selection state
let currentSelection: { text: string; rect: any; webview: any } | null = null;
let addToChatButton: HTMLElement | null = null;

// Global query execution tracker to prevent duplicates across all paths
const globalQueryTracker = new Map<string, number>();

function isQueryRecentlyProcessed(query: string, windowMs: number = 3000): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  const currentTime = Date.now();
  const lastProcessedTime = globalQueryTracker.get(normalizedQuery) || 0;
  
  if (currentTime - lastProcessedTime < windowMs) {
    console.log('🚨 [GLOBAL DUPLICATE FIX] Query recently processed, skipping:', normalizedQuery.substring(0, 50));
    return true;
  }
  
  globalQueryTracker.set(normalizedQuery, currentTime);
  
  // Clean up old entries to prevent memory leaks
  if (globalQueryTracker.size > 100) {
    const cutoffTime = currentTime - (windowMs * 10);
    for (const [key, time] of globalQueryTracker.entries()) {
      if (time < cutoffTime) {
        globalQueryTracker.delete(key);
      }
    }
  }
  
  return false;
}

// Add global call tracking for debugging duplicates
let displayAgentResultsCallCount = 0;
const displayAgentResultsCalls: Array<{callNumber: number, timestamp: number, stackTrace: string, data: any}> = [];

// Add global execution flow tracking
const executionFlow: Array<{timestamp: number, function: string, details: any}> = [];

// Webpage context management for @ mentions
interface WebpageContext {
  id: string;
  title: string;
  url: string;
  timestamp: number;
  content?: {
    title: string;
    description: string;
    content: string;
    html: string;
    url: string;
  };
}

let selectedWebpageContexts: WebpageContext[] = [];
let isShowingMentionDropdown = false;

function logExecutionFlow(functionName: string, details: any = {}): void {
  const entry = {
    timestamp: Date.now(),
    function: functionName,
    details
  };
  executionFlow.push(entry);
  
  console.log(`🔄 [FLOW] ${functionName}:`, details);
  
  // Keep only last 50 entries to avoid memory issues
  if (executionFlow.length > 50) {
    executionFlow.splice(0, executionFlow.length - 50);
  }
}

// Export flow for debugging
(window as any).getExecutionFlow = () => executionFlow;
(window as any).getDisplayAgentResultsCalls = () => displayAgentResultsCalls;

function trackDisplayAgentResultsCall(data: any): void {
  displayAgentResultsCallCount++;
  const callInfo = {
    callNumber: displayAgentResultsCallCount,
    timestamp: Date.now(),
    stackTrace: new Error().stack || 'No stack trace available',
    data: data
  };
  displayAgentResultsCalls.push(callInfo);
  
  console.log(`🔍 [DUPLICATE DEBUG] displayAgentResults called #${displayAgentResultsCallCount}`);
  console.log(`🔍 [DUPLICATE DEBUG] Call timestamp: ${new Date(callInfo.timestamp).toISOString()}`);
  console.log(`🔍 [DUPLICATE DEBUG] Data summary:`, {
    hasData: !!data,
    hasConsolidatedSummary: !!(data && data.consolidated_summary),
    hasSummaries: !!(data && data.summaries),
    dataKeys: data ? Object.keys(data) : 'null',
    dataType: typeof data,
    dataStringified: data ? JSON.stringify(data).substring(0, 200) + '...' : 'null'
  });
  console.log(`🔍 [DUPLICATE DEBUG] Stack trace:`);
  console.log(callInfo.stackTrace);
  
  // Check for recent duplicate calls
  const recentCalls = displayAgentResultsCalls.filter(call => 
    callInfo.timestamp - call.timestamp < 5000 && call.callNumber !== callInfo.callNumber
  );
  
  if (recentCalls.length > 0) {
    console.warn(`🚨 [DUPLICATE DEBUG] POTENTIAL DUPLICATE DETECTED! Recent calls within 5 seconds:`);
    recentCalls.forEach(call => {
      console.warn(`🚨 [DUPLICATE DEBUG] Call #${call.callNumber} at ${new Date(call.timestamp).toISOString()}`);
      console.warn(`🚨 [DUPLICATE DEBUG] Previous data:`, {
        hasConsolidatedSummary: !!(call.data && call.data.consolidated_summary),
        hasSummaries: !!(call.data && call.data.summaries),
        dataKeys: call.data ? Object.keys(call.data) : 'null'
      });
    });
  }
}

// UI Elements
let goBtn: HTMLButtonElement;
let historyBtn: HTMLButtonElement;
let extensionsBtn: HTMLButtonElement;
let runAgentBtn: HTMLButtonElement;
let tabsContainer: HTMLElement;
let newTabBtn: HTMLElement;
let extensionsPanel: HTMLElement;
let closeExtensionsBtn: HTMLElement;
let workflowProgressContainer: HTMLElement;

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

// Function to apply or remove sidebar layout
function applySidebarLayout(enabled: boolean): void {
  const browserContainer = document.querySelector('.browser-container');
  if (browserContainer) {
    if (enabled) {
      browserContainer.classList.add('sidebar-enabled');
      console.log('[Sidebar] Sidebar layout enabled');
    } else {
      browserContainer.classList.remove('sidebar-enabled');
      console.log('[Sidebar] Sidebar layout disabled');
    }
  }
}

// Function to clear any stuck loading states - AGGRESSIVE CLEANUP
function clearStuckLoadingStates(): void {
  const loadingTabs = document.querySelectorAll('.tab.loading');
  
  if (loadingTabs.length > 0) {
    console.log(`[Loading Cleanup] Found ${loadingTabs.length} tabs in loading state - clearing ALL`);
    
    // FORCE CLEAR all loading states - be aggressive to fix the stuck issue
    loadingTabs.forEach(tab => {
      tab.classList.remove('loading');
      console.log(`[Loading Cleanup] Force cleared loading state for tab: ${tab.id}`);
    });
  }
}

// Function to setup collapse/expand buttons
function setupCollapseExpandButtons(): void {
  const browserContainer = document.querySelector('.browser-container');
  
  // Sidebar collapse/expand - single button handles both
  const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
  
  if (sidebarCollapseBtn && browserContainer) {
    // Load saved sidebar collapsed state
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed) {
      browserContainer.classList.add('sidebar-collapsed');
    }
    
    sidebarCollapseBtn.addEventListener('click', () => {
      const isCurrentlyCollapsed = browserContainer.classList.contains('sidebar-collapsed');
      
      if (isCurrentlyCollapsed) {
        // Currently collapsed, so expand
        browserContainer.classList.remove('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', 'false');
        console.log('[Sidebar] Expanded');
      } else {
        // Currently expanded, so collapse
        browserContainer.classList.add('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', 'true');
        console.log('[Sidebar] Collapsed');
      }
    });
  }
  
    // Assistant collapse/expand functionality removed per user request
  // Clear any persisting assistant collapsed state
  localStorage.removeItem('assistantCollapsed');
  if (browserContainer) {
    browserContainer.classList.remove('assistant-collapsed');
  }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded, initializing browser...');
  
  console.log('[Init] Calling initializeUI...');
  initializeUI();
  console.log('[Init] Calling setupEventListeners...');
  setupEventListeners();
  console.log('[Init] Calling setupWorkflowEventListeners...');
  setupWorkflowEventListeners();
  console.log('[Init] Calling setupExtensionsPanel...');
  setupExtensionsPanel();
  console.log('[Init] Calling setupAgentControls...');
  setupAgentControls();
  console.log('[Init] Calling restoreTabs...');
  restoreTabs();
  console.log('[Init] Calling setupGlobalErrorHandler...');
  setupGlobalErrorHandler();
  console.log('[Init] Initializing DevTools...');
  devToolsManager.addDevToolsButton();
  devToolsManager.enableDevToolsForAllWebviews();
  
  console.log('[Init] Initializing MemoryService...');
  memoryService = new MemoryService();
  
  // Expose memory service to window for debugging
  (window as any).memoryService = memoryService;
  console.log('[Init] MemoryService exposed to window.memoryService for debugging');

  console.log('[Init] Setting up text selection message listener...');
  setupTextSelectionListener();
  
  console.log('[Init] Setting up ad blocker...');
  setupAdBlocker();
  
  console.log('Browser initialized successfully');
  // DISABLED: Auto-summarize feature commented out
  // console.log('[Init] Final autoSummarizeEnabled state:', autoSummarizeEnabled);
});

function initializeUI(): void {
  console.log('Initializing UI...');
  
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
  workflowProgressContainer = document.getElementById('workflowProgress') as HTMLElement;
  
  // Create workflow progress container if it doesn't exist
  if (!workflowProgressContainer) {
    workflowProgressContainer = document.createElement('div');
    workflowProgressContainer.id = 'workflowProgress';
    workflowProgressContainer.className = 'workflow-progress-container';
    
    // Insert after agent results
    if (agentResults && agentResults.parentNode) {
      agentResults.parentNode.insertBefore(workflowProgressContainer, agentResults);
    } else {
      document.body.appendChild(workflowProgressContainer);
    }
  }
  
  // If no tabs were restored, create a new one
  if (tabs.length === 0) {
    createNewTab();
  }
  
  // Sync API keys with backend
  syncApiKeysWithBackend().catch(error => {
    console.error('Failed to sync API keys during initialization:', error);
  });
  
  console.log('UI initialization complete');
}

function setupWorkflowEventListeners(): void {
  console.log('Setting up workflow event listeners...');
  
  // IMPORTANT: Remove any existing listeners first to prevent duplicates
  ipcRenderer.removeAllListeners('workflow-start');
  ipcRenderer.removeAllListeners('workflow-step-start');
  ipcRenderer.removeAllListeners('workflow-step-complete');
  ipcRenderer.removeAllListeners('workflow-complete');
  ipcRenderer.removeAllListeners('workflow-error');
  ipcRenderer.removeAllListeners('workflow-progress');
  
  console.log('🚨 [DUPLICATE FIX] Cleared all existing workflow event listeners');

  // Set up IPC event listeners for workflow progress
  ipcRenderer.on('workflow-start', (event: any, data: any) => {
    console.log('[WorkflowProgress] workflow-start event received:', data);
    
    // Convert snake_case to camelCase for compatibility, including step fields
    const workflowData = {
      workflowId: data.workflow_id || `workflow-${Date.now()}`,
      type: data.type || 'workflow',
      steps: (data.steps || []).map((step: any) => ({
        extensionId: step.extension_id,
        extensionName: step.extension_name
      }))
    };
    
    console.log('[WorkflowProgress] Creating new workflow progress in chat:', workflowData);
    
    // Create workflow progress as a chat message instead of using fixed container
    addWorkflowProgressToChat(workflowData);
  });

  ipcRenderer.on('workflow-step-start', (event: any, data: any) => {
    console.log('📡 [IPC DEBUG] workflow-step-start event received:', data);
    
    // Find the workflow progress message in chat
    const workflowMessage = findWorkflowProgressInChat(data.workflow_id);
    if (workflowMessage && (workflowMessage as any).progressIndicator) {
      console.log('[WorkflowProgress] Updating progress for step start:', {
        workflowId: data.workflow_id,
        currentStep: data.current_step,
        stepStatus: 'running'
      });
      
      // Convert snake_case to camelCase
      (workflowMessage as any).progressIndicator.updateProgress({
        workflowId: data.workflow_id,
        currentStep: data.current_step,
        stepStatus: 'running'
      });
    } else {
      console.warn('[WorkflowProgress] Workflow progress message not found for step-start:', data.workflow_id);
    }
  });

  ipcRenderer.on('workflow-step-complete', (event: any, data: any) => {
    console.log('📡 [IPC DEBUG] workflow-step-complete event received:', data);
    
    // Find the workflow progress message in chat
    const workflowMessage = findWorkflowProgressInChat(data.workflow_id);
    if (workflowMessage && (workflowMessage as any).progressIndicator) {
      console.log('[WorkflowProgress] Calling updateProgress with:', {
        workflowId: data.workflow_id,
        currentStep: data.current_step,
        stepStatus: data.step_status,
        stepResult: data.step_result,
        stepError: data.step_error
      });
      
      // Convert snake_case to camelCase  
      (workflowMessage as any).progressIndicator.updateProgress({
        workflowId: data.workflow_id,
        currentStep: data.current_step,
        stepStatus: data.step_status,
        stepResult: data.step_result,
        stepError: data.step_error
      });
    } else {
      console.warn('[WorkflowProgress] Workflow progress message not found for step-complete:', data.workflow_id);
    }
  });

  ipcRenderer.on('workflow-complete', (event: any, data: any) => {
    console.log('📡 [IPC DEBUG] workflow-complete event received:', data);
    console.log('📡 [IPC DEBUG] workflow-complete data keys:', Object.keys(data));
    console.log('📡 [IPC DEBUG] workflow-complete data.result keys:', data.result ? Object.keys(data.result) : 'no result');
    console.log('📡 [IPC DEBUG] workflow-complete has consolidated_summary:', !!(data.result && data.result.consolidated_summary));
    
    // Add workflow-level deduplication to prevent duplicate processing
    const workflowId = data.workflow_id;
    const currentTime = Date.now();
    const workflowCompleteKey = `workflowComplete_${workflowId}`;
    const lastCompleteTime = parseInt(localStorage.getItem(workflowCompleteKey) || '0');
    
    if (currentTime - lastCompleteTime < 2000) {
      console.log('🚨 [DUPLICATE FIX] Same workflow completed recently, skipping duplicate processing:', workflowId);
      return;
    }
    
    // Store current completion time
    localStorage.setItem(workflowCompleteKey, currentTime.toString());
    
    logExecutionFlow('workflow-complete-event', { workflowId: data.workflow_id, hasResult: !!data.result });
    
    // Clear execution flag
    isWorkflowExecuting = false;
    console.log('[WorkflowProgress] Clearing execution flag on workflow completion');
    
    // Find the workflow progress message in chat
    const workflowMessage = findWorkflowProgressInChat(data.workflow_id);
    if (workflowMessage && (workflowMessage as any).progressIndicator) {
      // Convert snake_case to camelCase
      (workflowMessage as any).progressIndicator.completeWorkflow({
        workflowId: data.workflow_id,
        result: data.result
      });
    } else {
      console.warn('[WorkflowProgress] Workflow progress message not found for completion:', data.workflow_id);
    }
    
    // Display results if available
    if (data.result) {
      console.log('🎯 [WORKFLOW-COMPLETE] About to call displayAgentResults from workflow-complete event');
      
      // For workflow results, extract the inner data to normalize the structure
      let resultData = data.result;
      if (data.result.type === 'workflow' && data.result.data) {
        console.log('🎯 [WORKFLOW-COMPLETE] Extracting inner data from workflow result');
        resultData = data.result.data;
      }
      
      displayAgentResults(resultData);
      console.log('🎯 [WORKFLOW-COMPLETE] displayAgentResults called successfully');
      
      // Store memory if available - try multiple content sources
      if (memoryService && resultData) {
        let summary = '';
        let memoryQuery = data.workflow_id || 'Agent Query';
        
        // Try different content sources in order of preference
        if (resultData.consolidated_summary) {
          summary = resultData.consolidated_summary;
        } else if (resultData.summaries && resultData.summaries.length > 0) {
          summary = resultData.summaries.map((s: any) => `${s.title}: ${s.summary}`).join('\n\n');
        } else if (typeof resultData === 'string') {
          // Handle simple string responses
          summary = resultData;
        } else if (resultData.content) {
          // Handle responses with content field
          summary = resultData.content;
        } else if (resultData.response) {
          // Handle responses with response field
          summary = resultData.response;
        }
        
        if (summary && summary.trim()) {
          console.log('[Memory] Storing agent result in memory from workflow-complete');
          
          // Get current page info for memory context
          const webview = getActiveWebview();
          const url = webview?.src || '';
          const title = webview?.getTitle ? webview.getTitle() : '';
          
          storeInMemory(url, memoryQuery, summary, title);
        } else {
          console.log('[Memory] No suitable content found for memory storage in workflow-complete');
        }
      }
    } else {
      console.warn('[WorkflowProgress] No result data found in workflow-complete event');
    }
  });

  ipcRenderer.on('workflow-error', (event: any, data: any) => {
    console.log('📡 [IPC DEBUG] workflow-error event received:', data);
    
    // Clear execution flag
    isWorkflowExecuting = false;
    console.log('[WorkflowProgress] Clearing execution flag on workflow error');
    
    // Find the workflow progress message in chat
    const workflowMessage = findWorkflowProgressInChat(data.workflow_id || 'unknown');
    if (workflowMessage && (workflowMessage as any).progressIndicator) {
      // Convert snake_case to camelCase
      (workflowMessage as any).progressIndicator.handleWorkflowError({
        workflowId: data.workflow_id || 'unknown',
        error: data.error
      });
    } else {
      console.warn('[WorkflowProgress] Workflow progress message not found for error:', data.workflow_id);
      // Show error message directly in chat if we can't find the progress indicator
      addMessageToChat('assistant', `Workflow error: ${data.error}`);
    }
  });

  ipcRenderer.on('workflow-progress', (event: any, data: any) => {
    console.log('📡 [IPC DEBUG] workflow-progress event received:', data);
    // Handle any other progress events
  });

  console.log('Workflow progress system initialized');
  workflowProgressSetup = true; // Mark as set up to prevent duplicates
}

function setupEventListeners(): void {
  console.log('Setting up event listeners...');

  // IMPORTANT: Remove any existing listeners first to prevent duplicates
  if (newTabBtn) {
    // Clone the button to remove all event listeners
    const newNewTabBtn = newTabBtn.cloneNode(true) as HTMLElement;
    newTabBtn.parentNode?.replaceChild(newNewTabBtn, newTabBtn);
    newTabBtn = newNewTabBtn;
    console.log('🚨 [DUPLICATE FIX] Cleared existing new tab button listeners');
  }

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

  // New tab button - with debugging
  if (newTabBtn) {
    console.log('🚨 [NEW TAB DEBUG] Adding event listener to new tab button');
    newTabBtn.addEventListener('click', (e) => {
      console.log('🚨 [NEW TAB DEBUG] New tab button clicked!', { timestamp: Date.now(), target: e.target });
      createNewTab();
    });
    console.log('🚨 [NEW TAB DEBUG] Event listener added successfully');
  } else {
    console.error('🚨 [NEW TAB DEBUG] newTabBtn element not found!');
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
  console.log('🚨 [NEW TAB DEBUG] createNewTab called with URL:', url);
  console.log('🚨 [NEW TAB DEBUG] Call stack:', new Error().stack);
  
  if (!tabsContainer || !webviewsContainer) {
    console.error('Cannot create tab: containers not found');
    return null;
  }
  
  const tabId = 'tab-' + Date.now();
  const webviewId = 'webview-' + tabId;
  
  console.log('🚨 [NEW TAB DEBUG] Creating tab with ID:', tabId);
  
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
    
    console.log('🚨 [NEW TAB DEBUG] Tab created successfully:', tabId);
    return tabId;
  } catch (error) {
    console.error('Error creating tab:', error);
    return null;
  }
}

// Get ad blocker CSS rules and inject them into webviews
function injectAdBlockCSS(webview: any): void {
  if (!webview) return;
  
  // Check if webview is valid and ready
  if (!webview.id || !webview.src || webview.src === 'about:blank') {
    console.log('[AdBlock] Skipping CSS injection - webview not ready');
    return;
  }
  
  try {
    // Request CSS rules from main process
    ipcRenderer.invoke('get-adblock-css').then((cssRules: string) => {
      if (!cssRules || !cssRules.trim()) {
        console.log('[AdBlock] No CSS rules to inject');
        return;
      }
      
      // Check if webview is still valid before injection
      if (!webview || !webview.executeJavaScript) {
        console.log('[AdBlock] Webview no longer valid, skipping injection');
        return;
      }
      
      const script = `
        (function() {
          try {
            // Check if document is ready
            if (!document || !document.head) {
              console.log('[AdBlock] Document not ready, skipping CSS injection');
              return;
            }
            
            // Remove existing ad block styles
            const existingStyle = document.getElementById('browzer-adblock-css');
            if (existingStyle) {
              existingStyle.remove();
            }
            
            // Inject new ad block styles
            const style = document.createElement('style');
            style.id = 'browzer-adblock-css';
            style.type = 'text/css';
            style.innerHTML = \`${cssRules.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
            document.head.appendChild(style);
            
            console.log('[AdBlock] CSS rules injected successfully');
          } catch (injectionError) {
            console.warn('[AdBlock] CSS injection failed:', injectionError.message);
          }
        })();
      `;
      
      // Execute with error handling
      webview.executeJavaScript(script).catch((error: any) => {
        // Don't log errors for destroyed webviews or navigation
        if (!error.message.includes('Object has been destroyed') && 
            !error.message.includes('navigation') &&
            !error.message.includes('Script failed to execute')) {
          console.warn('[AdBlock] Script execution failed:', error.message);
        }
      });
      
    }).catch((error: any) => {
      console.error('[AdBlock] Error getting CSS rules:', error);
    });
  } catch (error) {
    console.error('[AdBlock] Error in CSS injection setup:', error);
  }
}

function configureWebview(webview: any, url: string): void {
  const needsSpecialSettings = url && isProblematicSite(url);
  const isLocalSettingsPage = url && url.startsWith('file://') && url.includes('settings-');
  
  // Enhanced user agent that's more likely to be accepted by OAuth providers
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0';

  // Enhanced web preferences for OAuth compatibility and script execution
  const webPreferencesArray = [
    'contextIsolation=false', // Allow better script execution
    'nodeIntegration=true', // Enable for IPC communication
    'webSecurity=true', // Keep web security enabled
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
    // Essential for OAuth flows and script execution
    'nativeWindowOpen=true',
    'contextMenu=true',
    'devTools=true'
  ];

  // Set comprehensive attributes for OAuth compatibility
  webview.setAttribute('useragent', userAgent);
  webview.setAttribute('webpreferences', webPreferencesArray.join(', '));
  webview.setAttribute('allowpopups', 'true');
  webview.setAttribute('nodeintegration', 'true');
  webview.setAttribute('nodeintegrationinsubframes', 'true');
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
          console.log(`[Tab Loading] Started loading for tab: ${tabId}`);
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
          console.log(`[Tab Loading] Finished loading for tab: ${tabId}`);
        }
      }
    }
    
    // Update favicon after loading completes
    setTimeout(() => {
      if (webview && webview.src) {
        updateTabFavicon(webview.id, webview.src);
      }
    }, 500);
  });

  // Also handle loading failures
  webview.addEventListener('did-fail-load', () => {
    const webviewId = webview.id;
    if (webviewId) {
      const tabId = getTabIdFromWebview(webviewId);
      if (tabId) {
        const tab = document.getElementById(tabId);
        if (tab) {
          tab.classList.remove('loading');
          console.log(`[Tab Loading] Failed loading for tab: ${tabId}`);
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
    
    // DISABLED: Auto-summarize feature commented out
    /*
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
          console.log('🕒 [TIMEOUT DEBUG] Auto-summarize timeout triggered for URL:', url);
          console.log('🕒 [TIMEOUT DEBUG] isWorkflowExecuting at timeout:', isWorkflowExecuting);
          logExecutionFlow('timeoutCallback', { url, isWorkflowExecuting });
          // Check execution flag before calling autoSummarizePage to prevent race conditions
          if (!isWorkflowExecuting) {
            console.log('🕒 [TIMEOUT DEBUG] Calling autoSummarizePage from timeout');
            autoSummarizePage(url, webview);
          } else {
            console.log('🕒 [TIMEOUT DEBUG] Workflow already executing, skipping auto-summarize from timeout');
          }
        }, 1500);
      } else {
        console.log('[Auto-summarize] Conditions not met - isActiveTab:', isActiveTab, 'isProblematic:', isProblematic);
      }
    } else {
      console.log('[Auto-summarize] Not enabled or invalid URL - enabled:', autoSummarizeEnabled, 'valid URL:', !!(url && url.startsWith('http')));
    }
    */
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
  
  // Listen for IPC messages from webview (for Add to Chat)
  webview.addEventListener('ipc-message', (event: any) => {
    console.log('🔍 [IPC DEBUG] Received ipc-message from webview:', webview.id, 'channel:', event.channel, 'args:', event.args);
    if (event.channel === 'add-to-chat') {
      console.log('✅ [Add to Chat] Processing IPC message with text:', event.args[0]?.substring(0, 50) + '...');
      if (event.args[0]) {
        // Add selected text to @ context system instead of just chat
        addSelectedTextToContextSystem(event.args[0], webview);
        showToast('✅ Text added to context!', 'success');
        console.log('✅ [Add to Chat] Text successfully added to context system via IPC');
      } else {
        console.warn('⚠️ [Add to Chat] IPC message received but no text found in args');
      }
    }
  });

  // Inject text selection handler and ad block CSS
  webview.addEventListener('did-finish-load', () => {
    console.log('[Text Selection] Injecting enhanced selection handler for webview:', webview.id);
    try {
      injectEnhancedSelectionHandler(webview);
      // Inject ad block CSS after page loads with validation
      setTimeout(() => {
        // Double-check webview is still valid before injection
        if (webview && !webview.isDestroyed && webview.executeJavaScript) {
          injectAdBlockCSS(webview);
        }
      }, 500);
    } catch (error) {
      console.error('[Text Selection] Failed to inject handler:', error);
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
  
  // Skip internal pages and invalid URLs
  if (url.startsWith('file://') || 
      url.includes('localhost') ||
      url.startsWith('chrome://') ||
      url.startsWith('edge://') ||
      !title ||
      title.length === 0 ||
      title === 'New Tab') {
    console.log('🔍 [HISTORY DEBUG] Skipping page visit:', { url, title });
    return;
  }
  
  try {
    let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    
    const visit = {
      id: Date.now(),
      url: url,
      title: title || url,
      visitDate: new Date(),
      timestamp: Date.now()
    };
    
    console.log('🔍 [HISTORY DEBUG] Tracking page visit:', { 
      title: visit.title, 
      url: visit.url.substring(0, 50) + (visit.url.length > 50 ? '...' : '') 
    });
    
    // Remove any existing entry for this URL to avoid duplicates
    const beforeLength = history.length;
    history = history.filter((item: any) => item.url !== url);
    const afterLength = history.length;
    
    if (beforeLength !== afterLength) {
      console.log('🔍 [HISTORY DEBUG] Removed duplicate entry for URL');
    }
    
    // Add new visit to the beginning
    history.unshift(visit);
    
    // Keep only the most recent 1000 visits
    if (history.length > 1000) {
      history = history.slice(0, 1000);
    }
    
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    console.log('🔍 [HISTORY DEBUG] Total history items after update:', history.length);
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

  // Export memory
  const exportMemoryBtn = document.getElementById('exportMemoryBtn');
  if (exportMemoryBtn) {
    exportMemoryBtn.addEventListener('click', () => {
      try {
        const memory = localStorage.getItem(MEMORY_KEY) || '[]';
        const blob = new Blob([memory], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ai_memory_export.json';
        a.click();
        
        URL.revokeObjectURL(url);
        showToast('Memory exported successfully.', 'success');
      } catch (e) {
        console.error('Error exporting memory:', e);
        showToast('Error exporting memory: ' + (e as Error).message, 'error');
      }
    });
  }

  // Import memory
  const importMemoryBtn = document.getElementById('importMemoryBtn');
  if (importMemoryBtn) {
    importMemoryBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const contents = event.target?.result as string;
            const parsed = JSON.parse(contents);
            
            if (Array.isArray(parsed)) {
              localStorage.setItem(MEMORY_KEY, contents);
              updateMemoryCount();
              showToast('Memory imported successfully.', 'success');
            } else {
              showToast('Invalid memory file format.', 'error');
            }
          } catch (e) {
            showToast('Error parsing memory file: ' + (e as Error).message, 'error');
          }
        };
        
        reader.readAsText(file);
      };
      
      input.click();
    });
  }

  // Sidebar setting
  const sidebarEnabledCheckbox = document.getElementById('sidebarEnabled') as HTMLInputElement;
  if (sidebarEnabledCheckbox) {
    // Load saved sidebar preference
    const savedSidebarEnabled = localStorage.getItem('sidebarEnabled') === 'true';
    sidebarEnabledCheckbox.checked = savedSidebarEnabled;
    
    // Apply sidebar layout if enabled
    applySidebarLayout(savedSidebarEnabled);
    
    // Handle sidebar toggle
    sidebarEnabledCheckbox.addEventListener('change', () => {
      const isEnabled = sidebarEnabledCheckbox.checked;
      localStorage.setItem('sidebarEnabled', isEnabled.toString());
      applySidebarLayout(isEnabled);
      showToast(isEnabled ? 'Sidebar enabled' : 'Sidebar disabled', 'success');
    });
  }

  // Collapse/Expand functionality
  setupCollapseExpandButtons();

  // Clear any stuck loading states IMMEDIATELY
  clearStuckLoadingStates();
  
  // Set up periodic cleanup every 5 seconds to prevent stuck states
  setInterval(() => {
    clearStuckLoadingStates();
  }, 5000);

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
    console.log('[Memory] Updated memory count display:', memory.length);
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
  // Initialize chat UI in the fixed container
  const chatInputContainer = document.querySelector('.chat-input-container');
  if (chatInputContainer) {
    console.log('[setupAgentControls] Chat input container found');
    // Add chat input area if it doesn't exist
    let chatInputArea = document.querySelector('.chat-input-area');
    if (!chatInputArea) {
      console.log('[setupAgentControls] Creating chat input area');
      chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <div class="chat-mode-selector">
          <label class="mode-option">
            <input type="radio" name="chatMode" value="ask" checked />
            <span>Ask</span>
          </label>
          ${DOAGENT_ENABLED ? `
          <label class="mode-option">
            <input type="radio" name="chatMode" value="do" />
            <span>Do</span>
          </label>
          ` : ''}
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        </div>
      `;
      
      chatInputContainer.appendChild(chatInputArea);
      
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
        console.log('[sendMessage] Selected contexts:', selectedWebpageContexts.length);
        
        // Get selected mode
        const selectedMode = document.querySelector('input[name="chatMode"]:checked') as HTMLInputElement;
        const mode = selectedMode ? selectedMode.value : 'ask';
        console.log('[sendMessage] Selected mode:', mode);
        
        // Update placeholder based on mode
        const placeholderText = mode === 'do' ? 'Enter a task to perform...' : 'Ask a follow-up question...';
        chatInput.placeholder = placeholderText;
        
        // Add user message to chat
        addMessageToChat('user', message);
        
        // Process the message based on mode
        if (mode === 'do') {
          // Use DoAgent for automation tasks
          console.log('[sendMessage] Using DoAgent for automation task');
          processDoTask(message);
        } else {
          // Use existing ask mode logic
          if (selectedWebpageContexts.length > 0) {
            console.log('🚨 [SEND DEBUG] Found contexts, calling processFollowupQuestionWithContexts');
            processFollowupQuestionWithContexts(message, selectedWebpageContexts);
          } else {
            console.log('🚨 [SEND DEBUG] Calling processFollowupQuestion');
            processFollowupQuestion(message);
          }
        }
        
        // Clear input and contexts
        chatInput.value = '';
        clearAllWebpageContexts();
      }
    };
    
    // Add click handler to send button
    sendButton.addEventListener('click', (e) => {
      console.log('[setupChatInputHandlers] Send button clicked');
      e.preventDefault();
      hideMentionDropdown(); // Hide dropdown before sending
      sendMessage();
    });
    
    // Enhanced keypress handler for Enter key and @ mentions
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        console.log('[setupChatInputHandlers] Enter key pressed');
        e.preventDefault();
        hideMentionDropdown(); // Hide dropdown before sending
        sendMessage();
      }
    });
    
    // Add input handler for @ mention detection
    chatInput.addEventListener('input', (e) => {
      const value = chatInput.value;
      const cursorPosition = chatInput.selectionStart || 0;
      
      console.log('🚨 [INPUT HANDLER] Input event triggered');
      console.log('🚨 [INPUT HANDLER] Value:', value);
      console.log('🚨 [INPUT HANDLER] Cursor position:', cursorPosition);
      console.log('🚨 [INPUT HANDLER] Character at cursor-1:', value.charAt(cursorPosition - 1));
      
      // Check if user just typed @
      if (value.charAt(cursorPosition - 1) === '@') {
        console.log('🔍 [MENTION] @ detected, showing dropdown');
        console.log('🚨 [INPUT HANDLER] Calling showMentionDropdown');
        showMentionDropdown(chatInput);
      } else if (isShowingMentionDropdown) {
        console.log('🚨 [INPUT HANDLER] Dropdown is showing, checking if should hide');
        // Check if we should hide the dropdown
        const lastAtIndex = value.lastIndexOf('@');
        console.log('🚨 [INPUT HANDLER] Last @ index:', lastAtIndex, 'cursor position:', cursorPosition);
        if (lastAtIndex === -1 || cursorPosition <= lastAtIndex) {
          console.log('🚨 [INPUT HANDLER] Hiding dropdown');
          hideMentionDropdown();
        }
      }
    });
    
    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (isShowingMentionDropdown && 
          !target.closest('#mentionDropdown') && 
          target !== chatInput) {
        hideMentionDropdown();
      }
    });
    
    // Add keyboard navigation for dropdown
    chatInput.addEventListener('keydown', (e) => {
      if (isShowingMentionDropdown) {
        const dropdown = document.getElementById('mentionDropdown');
        if (dropdown) {
          const items = dropdown.querySelectorAll('.mention-item:not(.empty)');
          const currentActive = dropdown.querySelector('.mention-item.active');
          let activeIndex = currentActive ? Array.from(items).indexOf(currentActive) : -1;
          
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
          } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            (items[activeIndex] as HTMLElement).click();
            return;
          } else if (e.key === 'Escape') {
            e.preventDefault();
            hideMentionDropdown();
            return;
          }
          
          // Update active state
          items.forEach((item, index) => {
            item.classList.toggle('active', index === activeIndex);
          });
        }
      }
    });
    
    // Add blur handler to hide dropdown
    chatInput.addEventListener('blur', (e) => {
      // Small delay to allow clicking on dropdown items
      setTimeout(() => {
        if (isShowingMentionDropdown && !document.querySelector('#mentionDropdown:hover')) {
          hideMentionDropdown();
        }
      }, 150);
    });
    
    // Add mode change handler
    const modeRadios = document.querySelectorAll('input[name="chatMode"]');
    modeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const mode = (e.target as HTMLInputElement).value;
        console.log('[setupChatInputHandlers] Mode changed to:', mode);
        
        // Update placeholder based on mode
        const placeholderText = mode === 'do' ? 'Enter a task to perform...' : 'Ask a follow-up question...';
        chatInput.placeholder = placeholderText;
      });
    });
    
    // Mark as having handlers
    (sendButton as any).hasHandlers = true;
    
    console.log('[setupChatInputHandlers] Enhanced chat input handlers with @ mentions set up successfully');
  }, 100); // Small delay to ensure DOM is ready
}

// ========================= HISTORY PAGE =========================

function showHistoryPage(): void {
  console.log('=== SHOW HISTORY PAGE CALLED ===');
  
  try {
    const webview = getActiveWebview();
    console.log('Active webview found:', !!webview);
    
    if (webview) {
      const historyURL = `file://${path.join(process.cwd(), 'src/renderer/history.html')}`;
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
      const historyURL = `file://${path.join(process.cwd(), 'src/renderer/history.html')}`;
      const newTabId = createNewTab(historyURL);
      console.log('New history tab created:', newTabId);
    }
  } catch (error) {
    console.error('Error in showHistoryPage:', error);
    showToast('Error opening history page: ' + (error as Error).message, 'error');
  }
}

// ========================= AGENT EXECUTION =========================

// Helper function to get extension display name from ID
function getExtensionDisplayName(extensionId: string): string {
  const displayNames: Record<string, string> = {
    'topic-agent': 'Topic Agent',
    'research-agent': 'Research Agent',
    'conversation-agent': 'Conversation Agent'
  };
  
  return displayNames[extensionId] || extensionId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Helper function to get the currently selected AI provider
function getSelectedProvider(): string {
  const modelSelector = document.getElementById('modelSelector') as HTMLSelectElement;
  return modelSelector ? modelSelector.value : 'anthropic'; // Default to anthropic
}

// Helper function to gather all browser API keys
function getBrowserApiKeys(): Record<string, string> {
  const providers = ['openai', 'anthropic', 'perplexity', 'chutes'];
  const apiKeys: Record<string, string> = {};
  
  console.log('[DEBUG] Reading API keys from localStorage...');
  
  providers.forEach(provider => {
    const key = localStorage.getItem(`${provider}_api_key`);
    if (key) {
      apiKeys[provider] = key;
      // Log partial key for debugging (mask sensitive parts)
      const maskedKey = key.length > 12 ? key.substring(0, 8) + '...' + key.substring(key.length - 4) : 'short_key';
      console.log(`[DEBUG] ${provider}: ${maskedKey} (length: ${key.length})`);
    } else {
      console.log(`[DEBUG] ${provider}: NO KEY FOUND`);
    }
  });
  
  console.log(`[DEBUG] Total API keys found: ${Object.keys(apiKeys).length}`);
  return apiKeys;
}

// Helper function to sync API keys with backend ExtensionManager
async function syncApiKeysWithBackend(): Promise<void> {
  try {
    const apiKeys = getBrowserApiKeys();
    const provider = getSelectedProvider();
    
    console.log('[DEBUG] Syncing API keys with backend...');
    
    // Update API keys in ExtensionManager
    await ipcRenderer.invoke('update-browser-api-keys', apiKeys);
    
    // Update selected provider in ExtensionManager
    await ipcRenderer.invoke('update-selected-provider', provider);
    
    console.log('[DEBUG] Successfully synced API keys and provider with backend');
  } catch (error) {
    console.error('[DEBUG] Failed to sync API keys with backend:', error);
  }
}

async function executeAgent(): Promise<void> {
  logExecutionFlow('executeAgent', { isWorkflowExecuting });
  console.log('🎯 [EXECUTION DEBUG] executeAgent() called');
  console.log('🎯 [EXECUTION DEBUG] isWorkflowExecuting:', isWorkflowExecuting);
  
  // Prevent manual execution when workflow is already executing (from chat input)
  if (isWorkflowExecuting) {
    console.log('[executeAgent] Workflow already executing (likely from chat input), skipping Run Agent button execution');
    showToast('Workflow already in progress...', 'info');
    return;
  }
  
  // Set execution flag immediately to prevent race conditions
  isWorkflowExecuting = true;
  console.log('[executeAgent] Setting execution flag at start to prevent conflicts');
  
  try {
    console.log("executeAgent function called - running agent");
    
    // Sync API keys with backend first
    await syncApiKeysWithBackend();
    
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
    
    // Global duplicate check - prevent same query from any path
    if (isQueryRecentlyProcessed(query)) {
      console.log('🚨 [GLOBAL DUPLICATE FIX] Duplicate query detected in executeAgent, aborting');
      showToast('This query was just processed, skipping duplicate', 'info');
      return;
    }
    
    // Prevent duplicate processing of the same query within 5 seconds
    const currentTime = Date.now();
    const queryKey = `${query}-${url}`;
    const lastProcessedKey = `lastProcessed_${queryKey}`;
    const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
    
    if (currentTime - lastProcessedTime < 5000) {
      console.log('[executeAgent] Same query processed recently, skipping duplicate execution');
      showToast('This query was just processed, skipping duplicate execution', 'info');
      return;
    }
    
    // Store current processing time
    localStorage.setItem(lastProcessedKey, currentTime.toString());
    
    // Ensure chat input area exists in the fixed container
    const chatInputContainer = document.querySelector('.chat-input-container');
    if (chatInputContainer && !document.querySelector('.chat-input-area')) {
      console.log('[executeAgent] Chat input area not found, creating one');
      
      const chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <div class="chat-mode-selector">
          <label class="mode-option">
            <input type="radio" name="chatMode" value="ask" checked />
            <span>Ask</span>
          </label>
          ${DOAGENT_ENABLED ? `
          <label class="mode-option">
            <input type="radio" name="chatMode" value="do" />
            <span>Do</span>
          </label>
          ` : ''}
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        </div>
      `;
      
      chatInputContainer.appendChild(chatInputArea);
      setupChatInputHandlers();
    }

    // Show loading
    addMessageToChat('assistant', '<div class="loading">Analyzing request and routing to appropriate agents...</div>');
    
    // Extract page content
    const pageContent = await extractPageContent(webview);
    
    // Debug: Log that HTML content is being passed to agent
    console.log('🔍 [CONTENT DEBUG] Page content extracted for agent:');
    console.log('📄 Title:', pageContent.title);
    console.log('📝 Text content length:', pageContent.content?.length || 0, 'chars');
    console.log('🌐 HTML content length:', pageContent.html?.length || 0, 'chars');
    console.log('🔗 HTML includes links:', pageContent.html?.includes('<a ') || false);
    
    // Route request to appropriate extension or workflow
    console.log('Routing extension request for query:', query);
    
    const routingResult = await ipcRenderer.invoke('route-extension-request', query);
    console.log('Agent execution routing result:', routingResult);
    
    // Clear loading indicators first  
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    // Check if routing returned a workflow result - execute asynchronously with progress
    if (routingResult.type === 'workflow') {
      console.log('Agent execution detected workflow - using async execution with progress events');
      
      // Don't initialize workflow progress indicator here - let the backend workflow-start event handle it
      // This fixes the workflow ID mismatch issue where frontend uses Date.now() but backend uses uuid4()
      console.log('Workflow detected - progress will be initialized by backend workflow-start event');
      
      // Execute workflow asynchronously - progress events will update the UI
      // The workflow-complete event listener will call displayAgentResults when done
      try {
        const workflowData = {
          pageContent,
          browserApiKeys: getBrowserApiKeys(),
          selectedProvider: provider,
          selectedModel: modelSelector.selectedOptions[0]?.dataset.model || 'claude-3-7-sonnet-latest',
          isQuestion: false,
          conversationHistory: await buildConversationHistoryWithMemories(url, query)
        };

        await ipcRenderer.invoke('execute-workflow', {
          query,
          data: workflowData
        });
        
        // Workflow execution is async - progress events will handle UI updates
        // The workflow-complete event listener will call displayAgentResults when done
        
      } catch (workflowError) {
        console.error('Workflow execution failed:', workflowError);
        addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
      } finally {
        // Always clear the execution flag
        isWorkflowExecuting = false;
        console.log('[executeAgent] Workflow execution finished, clearing execution flag');
      }
      
      return; // Don't execute single extension path
    }
    
    // Handle single extension result
    const extensionId = routingResult.extensionId;
    if (!extensionId) {
      addMessageToChat('assistant', 'Error: No extension available for your request');
      return;
    }
    
    // Create progress indicator for single extension execution
    const singleExtensionWorkflowData = {
      workflowId: `single-${Date.now()}`,
      type: 'single_extension',
      steps: [{
        extensionId: extensionId,
        extensionName: getExtensionDisplayName(extensionId)
      }]
    };
    
    console.log('🚨 [SINGLE EXTENSION DEBUG] Creating progress indicator for single extension:', singleExtensionWorkflowData);
    const progressElement = addWorkflowProgressToChat(singleExtensionWorkflowData);
    
    // Start the progress indicator
    if (progressElement && (progressElement as any).progressIndicator) {
      (progressElement as any).progressIndicator.startWorkflow(singleExtensionWorkflowData);
      
      // Update to running state
      (progressElement as any).progressIndicator.updateProgress({
        workflowId: singleExtensionWorkflowData.workflowId,
        currentStep: 0,
        stepStatus: 'running'
      });
    }
    
    const action = 'process_page';
    const data = {
      query,
      pageContent,
      isQuestion: false,
      conversationHistory: await buildConversationHistoryWithMemories(url, query)
    };
    
    console.log(`Executing single extension: ${extensionId} (confidence: ${routingResult.confidence}) with action: ${action}`);
    console.log(`Routing reason: ${routingResult.reason}`);
    
    const startTime = Date.now();
    
    try {
      const result = await ipcRenderer.invoke('execute-python-extension', {
        extensionId,
        action,
        data,
        browserApiKeys: getBrowserApiKeys(),
        selectedProvider: provider
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      console.log(`Agent result received:`, result);
      
      // Complete the progress indicator
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.updateProgress({
          workflowId: singleExtensionWorkflowData.workflowId,
          currentStep: 0,
          stepStatus: 'completed',
          stepResult: result.data
        });
        
        (progressElement as any).progressIndicator.completeWorkflow({
          workflowId: singleExtensionWorkflowData.workflowId,
          result: result.data
        });
      }
      
      if (result.success === false) {
        addMessageToChat('assistant', `Error: ${result.error}`);
      } else {
              console.log('Calling displayAgentResults with:', result.data);
      displayAgentResults(result.data);
      
      // Store memory if available - try multiple content sources
      if (memoryService && result.data) {
        let summary = '';
        let memoryQuery = query || 'Agent Query';
        
        // Try different content sources in order of preference
        if (result.data.consolidated_summary) {
          summary = result.data.consolidated_summary;
        } else if (result.data.summaries && result.data.summaries.length > 0) {
          summary = result.data.summaries.map((s: any) => `${s.title}: ${s.summary}`).join('\n\n');
        } else if (typeof result.data === 'string') {
          // Handle simple string responses
          summary = result.data;
        } else if (result.data.content) {
          // Handle responses with content field
          summary = result.data.content;
        } else if (result.data.response) {
          // Handle responses with response field
          summary = result.data.response;
        }
        
        if (summary && summary.trim()) {
          console.log('[Memory] Storing agent result in memory from workflow-complete');
          
          // Get current page info for memory context
          const webview = getActiveWebview();
          const url = webview?.src || '';
          const title = webview?.getTitle ? webview.getTitle() : '';
          
          storeInMemory(url, memoryQuery, summary, title);
        } else {
          console.log('[Memory] No suitable content found for memory storage in workflow-complete');
        }
      }
      }
    } catch (extensionError) {
      console.error('Single extension execution failed:', extensionError);
      
      // Mark progress as failed
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.handleWorkflowError({
          workflowId: singleExtensionWorkflowData.workflowId,
          error: (extensionError as Error).message
        });
      }
      
      addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
    }
  } catch (error) {
    console.error("Agent execution error:", error);
    
    // Remove any loading indicators
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    addMessageToChat('assistant', `Error: ${(error as Error).message}`);
  } finally {
    // Always clear the execution flag when function ends
    isWorkflowExecuting = false;
    console.log('[executeAgent] Clearing execution flag on function completion');
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
          
          // Get both text content and full HTML
          const mainContent = document.querySelector('article') || 
                            document.querySelector('main') || 
                            document.querySelector('.content') ||
                            document.querySelector('#content') ||
                            document.body;
          
          const bodyText = mainContent ? mainContent.innerText.replace(/\\s+/g, ' ').trim() : '';
          const bodyHTML = mainContent ? mainContent.innerHTML : document.body.innerHTML;
          
          return {
            title: title,
            description: description,
            content: bodyText,
            html: bodyHTML,
            url: window.location.href
          };
        } catch(finalError) {
          console.error('Fatal error in content extraction:', finalError);
          return {
            title: document.title || '',
            description: '',
            content: 'Error extracting content: ' + finalError.message,
            html: '',
            url: window.location.href
          };
        }
      })();
    `;
    
    const result = await webview.executeJavaScript(extractScript);
    return result || { title: '', description: '', content: '', html: '', url: '' };
  } catch (error) {
    console.error('Error in extractPageContent:', error);
    return { title: '', description: '', content: '', html: '', url: '' };
  }
}

// Simple markdown to HTML converter
function markdownToHtml(text: string): string {
  let html = text;
  
  // Escape HTML entities in content first, but preserve already-escaped entities
  html = html.replace(/&(?!amp;|lt;|gt;|quot;|#39;|#x27;)/g, '&amp;');
  
  // Headers (must come before other processing)
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  
  // Bold text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic text
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Code blocks (triple backticks)
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Inline code (single backticks)
  html = html.replace(/`([^`]*)`/g, '<code>$1</code>');
  
  // Lists - simple approach
  // Convert unordered list items
  html = html.replace(/^\* (.*$)/gm, '<li>$1</li>');
  html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
  
  // Convert ordered list items  
  html = html.replace(/^\d+\. (.*$)/gm, '<li>$1</li>');
  
  // Wrap consecutive <li> elements in appropriate list tags
  html = html.replace(/(<li>.*<\/li>)/gms, function(match) {
    return '<ul>' + match + '</ul>';
  });
  
  // Convert line breaks to <br> but preserve existing HTML structure
  // Don't add <br> before closing tags, opening tags, or after certain elements
  html = html.replace(/\n(?!<\/|<h|<ul|<ol|<li|<pre|<blockquote|<strong|<em)/g, '<br>');
  
  // Links [text](url)
  html = html.replace(/\[([^\]]*)\]\(([^\)]*)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Blockquotes
  html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
  
  return html;
}

function addMessageToChat(role: string, content: string, timing?: number): void {
  try {
    let chatContainer = document.getElementById('chatContainer');
    
    // Create chat container if it doesn't exist
    if (!chatContainer) {
      console.log('[addMessageToChat] Chat container not found, creating one');
      
      const agentResults = document.getElementById('agentResults');
      if (!agentResults) {
        console.error('[addMessageToChat] agentResults container not found');
        return;
      }
      
      // Remove any existing welcome containers when starting chat
      const existingWelcome = agentResults.querySelector('.welcome-container');
      if (existingWelcome) {
        existingWelcome.remove();
      }
      
      // Create the chat container
      chatContainer = document.createElement('div');
      chatContainer.id = 'chatContainer';
      chatContainer.className = 'chat-container';
      agentResults.appendChild(chatContainer);
      
      console.log('[addMessageToChat] Chat container created successfully');
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
      messageDiv.innerHTML = `<div class="message-content">${markdownToHtml(content)}</div>`;
      messageDiv.dataset.role = 'context';
    } else if (role === 'user') {
      messageDiv.className = 'chat-message user-message';
      messageDiv.innerHTML = `<div class="message-content">${markdownToHtml(content)}</div>`;
      messageDiv.dataset.role = 'user';
      messageDiv.dataset.timestamp = new Date().toISOString();
    } else if (role === 'assistant') {
      messageDiv.className = 'chat-message assistant-message';
      messageDiv.dataset.role = 'assistant';
      messageDiv.dataset.timestamp = new Date().toISOString();
      
      // Check if content contains only a loading indicator
      const isLoading = content.includes('class="loading"') && !content.replace(/<div class="loading">.*?<\/div>/g, '').trim();
      
      // Apply markdown processing for assistant messages (but not for loading indicators)
      const processedContent = isLoading ? content : markdownToHtml(content);
      
      if (timing && !isLoading) {
        messageDiv.innerHTML = `
          <div class="timing-info">
            <span>Response generated in</span>
            <span class="time-value">${timing.toFixed(2)}s</span>
          </div>
          <div class="message-content">${processedContent}</div>
        `;
        messageDiv.dataset.genTime = timing.toFixed(2);
      } else {
        messageDiv.innerHTML = `<div class="message-content">${processedContent}</div>`;
      }
    }
    
    chatContainer.appendChild(messageDiv);
    
    // Scroll to bottom with smooth behavior
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    // Ensure chat input area exists in the fixed container
    const chatInputContainer = document.querySelector('.chat-input-container');
    if (chatInputContainer && !document.querySelector('.chat-input-area')) {
      console.log('[addMessageToChat] Creating chat input area for follow-up questions');
      
      const chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <div class="chat-mode-selector">
          <label class="mode-option">
            <input type="radio" name="chatMode" value="ask" checked />
            <span>Ask</span>
          </label>
          ${DOAGENT_ENABLED ? `
          <label class="mode-option">
            <input type="radio" name="chatMode" value="do" />
            <span>Do</span>
          </label>
          ` : ''}
        </div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
          <button id="sendMessageBtn" class="chat-send-btn">Send</button>
        </div>
      `;
      
      chatInputContainer.appendChild(chatInputArea);
      setupChatInputHandlers();
    }
    
    console.log(`[addMessageToChat] Message added successfully. Total messages: ${chatContainer.children.length}`);
  } catch (error) {
    console.error('[addMessageToChat] Error adding message to chat:', error);
    console.error('[addMessageToChat] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[addMessageToChat] Parameters that caused error:', { role, content: content?.substring(0, 100), timing });
  }
}

function displayAgentResults(data: any): void {
  // Track this call for duplicate debugging
  trackDisplayAgentResultsCall(data);
  logExecutionFlow('displayAgentResults', { hasData: !!data, hasConsolidatedSummary: !!(data && data.consolidated_summary) });
  
  try {
    console.log('[displayAgentResults] Called with data:', data);
    console.log('[displayAgentResults] Data type:', typeof data);
    console.log('[displayAgentResults] Data keys:', data ? Object.keys(data) : 'null');
    
    if (!data) {
      console.log('[displayAgentResults] No data - showing fallback message');
      addMessageToChat('assistant', 'No data received from agent');
      return;
    }

    // Prevent duplicate results within 3 seconds
    const currentTime = Date.now();
    const contentHash = JSON.stringify(data).substring(0, 200); // Use first 200 chars as hash
    const lastDisplayKey = `lastDisplayed_${contentHash}`;
    const lastDisplayTime = parseInt(localStorage.getItem(lastDisplayKey) || '0');
    
    if (currentTime - lastDisplayTime < 3000) {
      console.log('[displayAgentResults] Same content displayed recently, skipping duplicate');
      return;
    }
    
    // Store current display time
    localStorage.setItem(lastDisplayKey, currentTime.toString());

    console.log("[displayAgentResults] Agent result data:", data);
    console.log('[displayAgentResults] Has consolidated_summary:', !!data.consolidated_summary);
    console.log('[displayAgentResults] Has summaries:', !!data.summaries);
    console.log('[displayAgentResults] Summaries length:', data.summaries ? data.summaries.length : 'none');
    
    if (data.consolidated_summary) {
      console.log('[displayAgentResults] Displaying consolidated summary:', data.consolidated_summary.substring(0, 100) + '...');
      addMessageToChat('assistant', data.consolidated_summary, data.generation_time);
      console.log('[displayAgentResults] Consolidated summary displayed successfully');
    } else if (data.summaries && data.summaries.length > 0) {
      console.log('[displayAgentResults] Displaying individual summaries');
      const summariesText = data.summaries.map((s: any) => `<b>${s.title}</b>\n${s.summary}`).join('\n\n');
      addMessageToChat('assistant', summariesText, data.generation_time);
      console.log('[displayAgentResults] Individual summaries displayed successfully');
    } else {
      console.log('[displayAgentResults] No summaries found - showing fallback message');
      addMessageToChat('assistant', 'No relevant information found.', data.generation_time);
      console.log('[displayAgentResults] Fallback message displayed successfully');
    }
    
    console.log('[displayAgentResults] Function completed successfully');
  } catch (error) {
    console.error('[displayAgentResults] Error in displayAgentResults:', error);
    console.error('[displayAgentResults] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[displayAgentResults] Data that caused error:', data);
    
    // Fallback error handling - show user-friendly message
    try {
      addMessageToChat('assistant', 'Error displaying results: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } catch (chatError) {
      console.error('[displayAgentResults] Even fallback chat message failed:', chatError);
    }
  }
}

async function processFollowupQuestion(question: string): Promise<void> {
  console.log('[processFollowupQuestion] Processing question:', question);
  
  // Global duplicate check - prevent same query from any path
  if (isQueryRecentlyProcessed(question)) {
    console.log('🚨 [GLOBAL DUPLICATE FIX] Duplicate query detected in processFollowupQuestion, aborting');
    showToast('This question was just processed, skipping duplicate', 'info');
    return;
  }
  
  // Prevent follow-up execution when workflow is already executing
  if (isWorkflowExecuting) {
    console.log('[processFollowupQuestion] Workflow already executing, skipping follow-up execution');
    showToast('Workflow already in progress...', 'info');
    return;
  }
  
  // Prevent duplicate processing of the same query within 5 seconds
  const currentTime = Date.now();
  const queryKey = `followup_${question}`;
  const lastProcessedKey = `lastProcessed_${queryKey}`;
  const lastProcessedTime = parseInt(localStorage.getItem(lastProcessedKey) || '0');
  
  if (currentTime - lastProcessedTime < 5000) {
    console.log('[processFollowupQuestion] Same question processed recently, skipping duplicate execution');
    showToast('This question was just processed, skipping duplicate execution', 'info');
    return;
  }
  
  // Store current processing time
  localStorage.setItem(lastProcessedKey, currentTime.toString());
  
  // Set execution flag immediately to prevent race conditions
  isWorkflowExecuting = true;
  console.log('[processFollowupQuestion] Setting execution flag at start to prevent conflicts');
  
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
      isWorkflowExecuting = false; // Clear flag if not proceeding
      return;
    }
    
    const provider = modelSelector.value;
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    if (!apiKey) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
      isWorkflowExecuting = false; // Clear flag if not proceeding
      return;
    }
    
    const activeWebview = getActiveWebview();
    if (!activeWebview) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'No active webview found.');
      isWorkflowExecuting = false; // Clear flag if not proceeding
      return;
    }
    
    const currentUrl = activeWebview.src || '';
    console.log('[processFollowupQuestion] Extracting page content from:', currentUrl);
    const pageContent = await extractPageContent(activeWebview);
    
    // Debug: Log that HTML content is being passed to agent
    console.log('🔍 [CONTENT DEBUG] Page content extracted for agent:');
    console.log('📄 Title:', pageContent.title);
    console.log('📝 Text content length:', pageContent.content?.length || 0, 'chars');
    console.log('🌐 HTML content length:', pageContent.html?.length || 0, 'chars');
    console.log('🔗 HTML includes links:', pageContent.html?.includes('<a ') || false);
    
    // Route request to appropriate extension for question answering
    const questionRequest = `Answer this question about the page: ${question}`;
    
    console.log('[processFollowupQuestion] Routing extension request...');
    const routingResult = await ipcRenderer.invoke('route-extension-request', questionRequest);
    console.log('Follow-up question routing result:', routingResult);
    console.log('Follow-up question routing result type:', routingResult.type);
    console.log('Follow-up question workflow_info:', routingResult.workflow_info);
    
    // Clear loading indicators first
    clearLoadingIndicators();
    
    // Check if routing returned a workflow result
    if (routingResult.type === 'workflow') {
      console.log('Follow-up question received workflow result:', routingResult);
      console.log('workflowProgressIndicator exists:', !!workflowProgressIndicator);
      
      // Don't initialize workflow progress indicator here - let the backend workflow-start event handle it
      // This fixes the workflow ID mismatch issue where frontend uses Date.now() but backend uses uuid4()
      console.log('Follow-up workflow detected - progress will be initialized by backend workflow-start event');
      
      // Execute workflow asynchronously with progress events
      try {
        const workflowData = {
          pageContent,
          browserApiKeys: getBrowserApiKeys(),
          selectedProvider: provider,
          selectedModel: modelSelector.selectedOptions[0]?.dataset.model || 'claude-3-7-sonnet-latest',
          isQuestion: true,
          conversationHistory: await buildConversationHistoryWithMemories(currentUrl, question)
        };

        await ipcRenderer.invoke('execute-workflow', {
          query: questionRequest,
          data: workflowData
        });
        
        // Workflow execution is async - progress events will handle UI updates
        // The workflow-complete event listener will call displayAgentResults when done
        
      } catch (workflowError) {
        console.error('Follow-up workflow execution failed:', workflowError);
        addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
      }
      
      return; // Don't execute single extension path
    }
    
    // Handle single extension result
    const extensionId = routingResult.extensionId;
    if (!extensionId) {
      addMessageToChat('assistant', 'Error: No extension available to answer your question');
      return;
    }
    
    // Create progress indicator for single extension execution
    const singleExtensionWorkflowData = {
      workflowId: `followup-single-${Date.now()}`,
      type: 'single_extension',
      steps: [{
        extensionId: extensionId,
        extensionName: getExtensionDisplayName(extensionId)
      }]
    };
    
    console.log('🚨 [FOLLOWUP DEBUG] Creating progress indicator for single extension:', singleExtensionWorkflowData);
    const progressElement = addWorkflowProgressToChat(singleExtensionWorkflowData);
    
    // Start the progress indicator
    if (progressElement && (progressElement as any).progressIndicator) {
      (progressElement as any).progressIndicator.startWorkflow(singleExtensionWorkflowData);
      
      // Update to running state
      (progressElement as any).progressIndicator.updateProgress({
        workflowId: singleExtensionWorkflowData.workflowId,
        currentStep: 0,
        stepStatus: 'running'
      });
    }
    
    const action = 'process_page';
    const data = {
      query: questionRequest,
      pageContent,
      isQuestion: true,
      conversationHistory: await buildConversationHistoryWithMemories(currentUrl, question)
    };
    
    console.log(`[processFollowupQuestion] Executing extension with question: ${extensionId} (confidence: ${routingResult.confidence}) - ${question}`);
    console.log(`Follow-up routing reason: ${routingResult.reason}`);
    
    const startTime = Date.now();
    
    try {
      const result = await ipcRenderer.invoke('execute-python-extension', {
        extensionId,
        action,
        data,
        browserApiKeys: getBrowserApiKeys(),
        selectedProvider: provider
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      console.log('[processFollowupQuestion] Extension result received:', result);
      
      // Complete the progress indicator
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.updateProgress({
          workflowId: singleExtensionWorkflowData.workflowId,
          currentStep: 0,
          stepStatus: 'completed',
          stepResult: result.data
        });
        
        (progressElement as any).progressIndicator.completeWorkflow({
          workflowId: singleExtensionWorkflowData.workflowId,
          result: result.data
        });
      }
      
      if (result.success === false) {
        addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
        return;
      }
      
      console.log('[processFollowupQuestion] Displaying results...');
      displayAgentResults(result.data);
      
      // Store memory if available - try multiple content sources
      if (memoryService && result.data) {
        let summary = '';
        
        // Try different content sources in order of preference
        if (result.data.consolidated_summary) {
          summary = result.data.consolidated_summary;
        } else if (result.data.summaries && result.data.summaries.length > 0) {
          summary = result.data.summaries.map((s: any) => `${s.title}: ${s.summary}`).join('\n\n');
        } else if (typeof result.data === 'string') {
          // Handle simple string responses
          summary = result.data;
        } else if (result.data.content) {
          // Handle responses with content field
          summary = result.data.content;
        } else if (result.data.response) {
          // Handle responses with response field
          summary = result.data.response;
        }
        
        if (summary && summary.trim()) {
          console.log('[Memory] Storing followup result in memory');
          
          // Get current page info for memory context
          const webview = getActiveWebview();
          const url = webview?.src || '';
          const title = webview?.getTitle ? webview.getTitle() : '';
          
          storeInMemory(url, question, summary, title);
        } else {
          console.log('[Memory] No suitable content found for memory storage in followup');
        }
      }
    } catch (extensionError) {
      console.error('Follow-up extension execution failed:', extensionError);
      
      // Mark progress as failed
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.handleWorkflowError({
          workflowId: singleExtensionWorkflowData.workflowId,
          error: (extensionError as Error).message
        });
      }
      
      addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
    }
  } catch (error) {
    console.error('Error in processFollowupQuestion:', error);
    
    // Ensure loading indicators are cleared even on error
    clearLoadingIndicators();
    
    addMessageToChat('assistant', `Error: ${(error as Error).message}`);
  } finally {
    // Always clear the execution flag when function ends
    isWorkflowExecuting = false;
    console.log('[processFollowupQuestion] Clearing execution flag on function completion');
  }
}

async function processFollowupQuestionWithContexts(question: string, contexts: WebpageContext[]): Promise<void> {
  console.log('[processFollowupQuestionWithContexts] Processing question:', question);
  console.log('[processFollowupQuestionWithContexts] Contexts:', contexts.length);
  
  // Prevent follow-up execution when workflow is already executing
  if (isWorkflowExecuting) {
    console.log('[processFollowupQuestionWithContexts] Workflow already executing, skipping follow-up execution');
    showToast('Workflow already in progress...', 'info');
    return;
  }
  
  // Set execution flag immediately to prevent race conditions
  isWorkflowExecuting = true;
  console.log('[processFollowupQuestionWithContexts] Setting execution flag at start to prevent conflicts');
  
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
    addMessageToChat('assistant', '<div class="loading">Processing your question with webpage contexts...</div>');
    
    if (!modelSelector) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'Error: Model selector not found.');
      isWorkflowExecuting = false;
      return;
    }
    
    const provider = modelSelector.value;
    const apiKey = localStorage.getItem(`${provider}_api_key`);
    
    if (!apiKey) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'Please configure your API key in the Extensions panel.');
      isWorkflowExecuting = false;
      return;
    }
    
    const activeWebview = getActiveWebview();
    if (!activeWebview) {
      clearLoadingIndicators();
      addMessageToChat('assistant', 'No active webview found.');
      isWorkflowExecuting = false;
      return;
    }
    
    const currentUrl = activeWebview.src || '';
    console.log('[processFollowupQuestionWithContexts] Extracting page content from:', currentUrl);
    const pageContent = await extractPageContent(activeWebview);
    
    // Debug: Log enhanced content and contexts
    console.log('🔍 [CONTEXT DEBUG] Page content extracted for agent:');
    console.log('📄 Title:', pageContent.title);
    console.log('📝 Text content length:', pageContent.content?.length || 0, 'chars');
    console.log('🌐 HTML content length:', pageContent.html?.length || 0, 'chars');
    console.log('🔗 HTML includes links:', pageContent.html?.includes('<a ') || false);
    console.log('📋 Additional contexts:', contexts.length);
    
    // Log each additional context in detail
    if (contexts.length > 0) {
      console.log('🔍 [CONTEXT DEBUG] Additional webpage contexts:');
      for (let i = 0; i < contexts.length; i++) {
        const ctx = contexts[i];
        console.log(`  📄 Context ${i + 1}:`);
        console.log(`    Title: ${ctx.title}`);
        console.log(`    URL: ${ctx.url}`);
        console.log(`    Content length: ${ctx.content?.content?.length || 0} chars`);
        console.log(`    HTML length: ${ctx.content?.html?.length || 0} chars`);
        console.log(`    Has actual content: ${(ctx.content?.content?.length || 0) > 50}`);
      }
    }
    
    // Prepare enhanced page content with additional contexts
    const enhancedPageContent = {
      ...pageContent,
      additionalContexts: contexts.map(ctx => ({
        title: ctx.title,
        url: ctx.url,
        content: ctx.content || {}
      }))
    };
    
    // Debug: Log the final enhanced page content structure
    console.log('🔍 [CONTEXT DEBUG] Enhanced page content structure:');
    console.log('  Current page content length:', enhancedPageContent.content?.length || 0);
    console.log('  Current page HTML length:', enhancedPageContent.html?.length || 0);
    console.log('  Additional contexts count:', enhancedPageContent.additionalContexts?.length || 0);
    enhancedPageContent.additionalContexts?.forEach((ctx: any, index: number) => {
      console.log(`  Additional context ${index + 1} content length:`, ctx.content?.content?.length || 0);
    });
    
    // Route request to appropriate extension for question answering
    const questionRequest = `Answer this question using the current page and any provided webpage contexts: ${question}`;
    
    console.log('[processFollowupQuestionWithContexts] Routing extension request...');
    const routingResult = await ipcRenderer.invoke('route-extension-request', questionRequest);
    console.log('Follow-up question with contexts routing result:', routingResult);
    
    // Clear loading indicators first
    clearLoadingIndicators();
    
    // Check if routing returned a workflow result
    if (routingResult.type === 'workflow') {
      console.log('Follow-up question with contexts received workflow result:', routingResult);
      
      console.log('Follow-up workflow detected - progress will be initialized by backend workflow-start event');
      
      // Execute workflow asynchronously with progress events
      try {
        const workflowData = {
          pageContent: enhancedPageContent,
          browserApiKeys: getBrowserApiKeys(),
          selectedProvider: provider,
          selectedModel: modelSelector.selectedOptions[0]?.dataset.model || 'claude-3-7-sonnet-latest',
          isQuestion: true,
          conversationHistory: await buildConversationHistoryWithMemories(currentUrl, question)
        };

        await ipcRenderer.invoke('execute-workflow', {
          query: questionRequest,
          data: workflowData
        });
        
      } catch (workflowError) {
        console.error('Follow-up workflow with contexts execution failed:', workflowError);
        addMessageToChat('assistant', `Workflow execution failed: ${(workflowError as Error).message}`);
      }
      
      return;
    }
    
    // Handle single extension result
    const extensionId = routingResult.extensionId;
    if (!extensionId) {
      addMessageToChat('assistant', 'Error: No extension available to answer your question');
      return;
    }
    
    // Create progress indicator for single extension execution
    const singleExtensionWorkflowData = {
      workflowId: `followup-context-single-${Date.now()}`,
      type: 'single_extension',
      steps: [{
        extensionId: extensionId,
        extensionName: getExtensionDisplayName(extensionId)
      }]
    };
    
    console.log('🚨 [FOLLOWUP CONTEXT DEBUG] Creating progress indicator for single extension:', singleExtensionWorkflowData);
    const progressElement = addWorkflowProgressToChat(singleExtensionWorkflowData);
    
    // Start the progress indicator
    if (progressElement && (progressElement as any).progressIndicator) {
      (progressElement as any).progressIndicator.startWorkflow(singleExtensionWorkflowData);
      
      // Update to running state
      (progressElement as any).progressIndicator.updateProgress({
        workflowId: singleExtensionWorkflowData.workflowId,
        currentStep: 0,
        stepStatus: 'running'
      });
    }
    
    const action = 'process_page';
    const data = {
      query: questionRequest,
      pageContent: enhancedPageContent,
      isQuestion: true,
      conversationHistory: await buildConversationHistoryWithMemories(currentUrl, question)
    };
    
    console.log(`[processFollowupQuestionWithContexts] Executing extension with question: ${extensionId} (confidence: ${routingResult.confidence}) - ${question}`);
    console.log(`Follow-up with contexts routing reason: ${routingResult.reason}`);
    
    const startTime = Date.now();
    
    try {
      const result = await ipcRenderer.invoke('execute-python-extension', {
        extensionId,
        action,
        data,
        browserApiKeys: getBrowserApiKeys(),
        selectedProvider: provider
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      console.log('[processFollowupQuestionWithContexts] Extension result received:', result);
      
      // Complete the progress indicator
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.updateProgress({
          workflowId: singleExtensionWorkflowData.workflowId,
          currentStep: 0,
          stepStatus: 'completed',
          stepResult: result.data
        });
        
        (progressElement as any).progressIndicator.completeWorkflow({
          workflowId: singleExtensionWorkflowData.workflowId,
          result: result.data
        });
      }
      
      if (result.success === false) {
        addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
        return;
      }
      
      console.log('[processFollowupQuestionWithContexts] Displaying results...');
      displayAgentResults(result.data);
      
      // Store memory if available - try multiple content sources
      if (memoryService && result.data) {
        let summary = '';
        
        // Try different content sources in order of preference
        if (result.data.consolidated_summary) {
          summary = result.data.consolidated_summary;
        } else if (result.data.summaries && result.data.summaries.length > 0) {
          summary = result.data.summaries.map((s: any) => `${s.title}: ${s.summary}`).join('\n\n');
        } else if (typeof result.data === 'string') {
          // Handle simple string responses
          summary = result.data;
        } else if (result.data.content) {
          // Handle responses with content field
          summary = result.data.content;
        } else if (result.data.response) {
          // Handle responses with response field
          summary = result.data.response;
        }
        
        if (summary && summary.trim()) {
          console.log('[Memory] Storing followup with contexts result in memory');
          
          // Get current page info for memory context
          const webview = getActiveWebview();
          const url = webview?.src || '';
          const title = webview?.getTitle ? webview.getTitle() : '';
          
          storeInMemory(url, question, summary, title);
        } else {
          console.log('[Memory] No suitable content found for memory storage in followup with contexts');
        }
      }
    } catch (extensionError) {
      console.error('Follow-up extension with contexts execution failed:', extensionError);
      
      // Mark progress as failed
      if (progressElement && (progressElement as any).progressIndicator) {
        (progressElement as any).progressIndicator.handleWorkflowError({
          workflowId: singleExtensionWorkflowData.workflowId,
          error: (extensionError as Error).message
        });
      }
      
      addMessageToChat('assistant', `Error: ${(extensionError as Error).message}`);
    }
  } catch (error) {
    console.error('Error in processFollowupQuestionWithContexts:', error);
    
    // Ensure loading indicators are cleared even on error
    clearLoadingIndicators();
    
    addMessageToChat('assistant', `Error: ${(error as Error).message}`);
  } finally {
    // Always clear the execution flag when function ends
    isWorkflowExecuting = false;
    console.log('[processFollowupQuestionWithContexts] Clearing execution flag on function completion');
  }
}

async function processDoTask(taskInstruction: string): Promise<void> {
  console.log('[processDoTask] Processing task:', taskInstruction);
  
  if (!DOAGENT_ENABLED) {
    addMessageToChat('assistant', 'DoAgent functionality is disabled in this build.');
    return;
  }
  
  // Prevent duplicate execution
  if (isWorkflowExecuting) {
    console.log('[processDoTask] Workflow already executing, skipping task execution');
    showToast('Task already in progress...', 'info');
    return;
  }
  
  // Set execution flag
  isWorkflowExecuting = true;
  console.log('[processDoTask] Setting execution flag for task execution');
  
  try {
    const activeWebview = getActiveWebview();
    if (!activeWebview) {
      addMessageToChat('assistant', 'No active webview found.');
      return;
    }
    
    // Import DoAgent
    const { DoAgent } = await import('./services/DoAgent');
    
    // Create DoAgent instance with enhanced progress callback
    const doAgent = new DoAgent((task, step) => {
      console.log('[DoAgent Progress]', `Step ${step.id}: ${step.description} - ${step.status}`);
      
      // Create detailed progress message with LLM reasoning
      let progressMessage = `**${step.id}:** ${step.description}`;
      
      if (step.reasoning) {
        progressMessage += `\n  *AI Reasoning: ${step.reasoning}*`;
      }
      
      if (step.status === 'completed') {
        progressMessage += ' ✅';
      } else if (step.status === 'failed') {
        progressMessage += ' ❌';
        if (step.error) {
          progressMessage += `\n  Error: ${step.error}`;
        }
      } else if (step.status === 'running') {
        progressMessage += ' ⏳';
      }
      
      // Find the latest assistant message and update it with progress
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) {
        const lastMessage = chatContainer.querySelector('.chat-message.assistant-message:last-child .message-content');
        if (lastMessage) {
          // If it's a loading message, replace it
          if (lastMessage.innerHTML.includes('class="loading"')) {
            lastMessage.innerHTML = progressMessage;
          } else {
            // Add to existing message
            lastMessage.innerHTML += `<br/>${progressMessage}`;
          }
        }
      }
    });
    
    // Show initial loading message
    addMessageToChat('assistant', '<div class="loading">🤖 Analyzing page and planning actions with AI...</div>');
    
    // Execute the task
    const result = await doAgent.executeTask(taskInstruction, activeWebview);
    
    // Remove loading message
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    // Display results
    if (result.success) {
      let resultMessage = `✅ **Task completed successfully!**\n⏱️ *Execution time: ${(result.executionTime / 1000).toFixed(2)}s*`;
      
      if (result.data) {
        // Handle generic extracted content format
        if (typeof result.data === 'string') {
          // Simple string result (like summaries)
          resultMessage += `\n\n📄 **Result:**\n${result.data}`;
        } else if (result.data.error) {
          // Error in extraction
          resultMessage += `\n\n⚠️ **Note:** ${result.data.error}`;
        } else if (result.data.url) {
          // Generic extracted content structure
          resultMessage += `\n\n📄 **Extracted from:** ${result.data.url}`;
          
          // Show headings if available
          if (result.data.headings && result.data.headings.length > 0) {
            resultMessage += '\n\n📋 **Page Structure:**\n';
            result.data.headings.slice(0, 5).forEach((heading: any) => {
              resultMessage += `${'#'.repeat(heading.level === 'h1' ? 1 : heading.level === 'h2' ? 2 : 3)} ${heading.text}\n`;
            });
          }
          
          // Show main content if available
          if (result.data.textContent && result.data.textContent.length > 0) {
            resultMessage += '\n\n📝 **Main Content:**\n';
            result.data.textContent.slice(0, 3).forEach((content: any, index: number) => {
              if (content.text && content.text.length > 50) {
                resultMessage += `${index + 1}. ${content.text.substring(0, 200)}${content.text.length > 200 ? '...' : ''}\n`;
              }
            });
          }
          
          // Show links if available
          if (result.data.links && result.data.links.length > 0) {
            resultMessage += '\n\n🔗 **Links found:**\n';
            result.data.links.slice(0, 5).forEach((link: any, index: number) => {
              resultMessage += `${index + 1}. [${link.text}](${link.href})\n`;
            });
          }
          
          // Show lists if available
          if (result.data.lists && result.data.lists.length > 0) {
            resultMessage += '\n\n📝 **Lists found:**\n';
            result.data.lists.slice(0, 2).forEach((list: any, index: number) => {
              resultMessage += `**List ${index + 1}:**\n`;
              list.items.slice(0, 3).forEach((item: string) => {
                resultMessage += `• ${item}\n`;
              });
            });
          }
          
          // Show page type information
          if (result.data.pageStructure) {
            const structure = result.data.pageStructure;
            const pageTypes = [];
            if (structure.hasPosts) pageTypes.push('Posts');
            if (structure.hasBookmarks) pageTypes.push('Bookmarks');
            if (structure.hasProducts) pageTypes.push('Products');
            if (structure.hasFlights) pageTypes.push('Flights');
            if (structure.hasComments) pageTypes.push('Comments');
            if (structure.hasArticles) pageTypes.push('Articles');
            
            if (pageTypes.length > 0) {
              resultMessage += `\n\n🏷️ **Page Type:** ${pageTypes.join(', ')}`;
            }
          }
          
          // Show fallback content if no structured data
          if (result.data.fallbackContent && 
              (!result.data.textContent || result.data.textContent.length === 0) &&
              (!result.data.headings || result.data.headings.length === 0)) {
            resultMessage += `\n\n📄 **Page content:**\n${result.data.fallbackContent}`;
          }
        } else {
          // Unknown result format, show as is
          resultMessage += `\n\n📄 **Result:**\n${JSON.stringify(result.data, null, 2)}`;
        }
      }
      
      addMessageToChat('assistant', resultMessage, result.executionTime / 1000);
    } else {
      addMessageToChat('assistant', `❌ **Task failed:** ${result.error}`);
    }
    
  } catch (error) {
    console.error('[processDoTask] Error executing task:', error);
    
    // Remove loading message
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    addMessageToChat('assistant', `❌ **Task execution failed:** ${(error as Error).message}`);
  } finally {
    // Always clear execution flag
    isWorkflowExecuting = false;
    console.log('[processDoTask] Clearing execution flag');
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
    if (webviewsContainer) {
      webviewsContainer.appendChild(storeContainer);
    }
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

// ========================= FLOATING ADD TO CHAT BUTTON =========================

function createAddToChatButton(): HTMLElement {
  if (addToChatButton) {
    return addToChatButton;
  }
  
  addToChatButton = document.createElement('button');
  addToChatButton.className = 'add-to-chat-button';
  addToChatButton.textContent = 'Add to Chat';
  addToChatButton.setAttribute('title', 'Add selected text to chat conversation');
  
  // Add click handler
  addToChatButton.addEventListener('click', () => {
    if (currentSelection) {
      console.log('[Add to Chat] Adding selected text to chat:', currentSelection.text.substring(0, 50) + '...');
      
      // Add the selected text as a context message to chat
      addMessageToChat('context', `**Selected Text:**\n\n${currentSelection.text}`);
      
      // Clear selection and hide button
      hideAddToChatButton();
      
      // Show success feedback
      showToast('Text added to chat!', 'success');
    }
  });
  
  document.body.appendChild(addToChatButton);
  return addToChatButton;
}

function showAddToChatButton(text: string, rect: any, webview: any): void {
  console.log('[Add to Chat] Showing button for selection:', text.substring(0, 30) + '...');
  
  // Store current selection
  currentSelection = { text, rect, webview };
  
  // Create button if it doesn't exist
  const button = createAddToChatButton();
  
  // Get webview container position to calculate absolute coordinates
  const webviewContainer = document.querySelector('.webviews-container');
  if (!webviewContainer) return;
  
  const containerRect = webviewContainer.getBoundingClientRect();
  
  // Position the button above the selection
  const buttonX = containerRect.left + rect.left + (rect.width / 2);
  const buttonY = containerRect.top + rect.top - 40; // 40px above selection
  
  // Ensure button stays within viewport
  const buttonWidth = 120; // Approximate button width
  const adjustedX = Math.max(10, Math.min(buttonX - buttonWidth / 2, window.innerWidth - buttonWidth - 10));
  const adjustedY = Math.max(10, buttonY);
  
  button.style.left = `${adjustedX}px`;
  button.style.top = `${adjustedY}px`;
  
  // Show the button with animation
  requestAnimationFrame(() => {
    button.classList.add('show');
  });
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (currentSelection && currentSelection.text === text) {
      hideAddToChatButton();
    }
  }, 5000);
}

function hideAddToChatButton(): void {
  if (addToChatButton) {
    addToChatButton.classList.remove('show');
    currentSelection = null;
  }
}

// Hide button when clicking elsewhere
document.addEventListener('click', (e) => {
  if (addToChatButton && !addToChatButton.contains(e.target as Node)) {
    hideAddToChatButton();
  }
});

// Hide button when scrolling or resizing
document.addEventListener('scroll', hideAddToChatButton, true);
window.addEventListener('resize', hideAddToChatButton);

function setupTextSelectionListener(): void {
  console.log('[Text Selection] Setting up message listener for text selections');
  
  // Listen for messages from webviews about text selections
  window.addEventListener('message', (event) => {
    console.log('🔍 [MESSAGE DEBUG] Received window message:', event.data);
    // Only handle messages from our webviews
    if (event.data && event.data.type === 'add-to-chat') {
      console.log('✅ [Add to Chat] Received postMessage with text:', event.data.text?.substring(0, 30) + '...');
      if (event.data.text) {
        // Add selected text to @ context system instead of just chat
        const activeWebview = getActiveWebview();
        if (activeWebview) {
          addSelectedTextToContextSystem(event.data.text, activeWebview);
          showToast('✅ Text added to context!', 'success');
          console.log('✅ [Add to Chat] Text successfully added to context system via postMessage');
        }
      } else {
        console.warn('⚠️ [Add to Chat] PostMessage received but no text found');
      }
    }
  });
  
  console.log('[Text Selection] Message listener set up successfully');
}

function injectEnhancedSelectionHandler(webview: any): void {
  if (!webview) return;
  
  // Check if webview is valid and ready
  if (!webview.id || !webview.src || webview.src === 'about:blank' || webview.isDestroyed) {
    console.log('[Selection Handler] Skipping injection - webview not ready');
    return;
  }
  
  try {
    console.log('[Selection Handler] Injecting enhanced selection handler for webview:', webview.id);
    
    const injectionScript = `
      (function() {
        // Prevent multiple injections
        if (window.__browzerSelectionHandler) {
          console.log('Selection handler already installed');
          return;
        }
        
        console.log('Installing Browzer enhanced selection handler...');
        window.__browzerSelectionHandler = true;
        
        // Create and style the add to chat button
        let addToChatBtn = null;
        let selectionTimeout = null;
        
        function createAddToChatButton(selectedText, rect) {
          try {
            // Remove any existing button
            hideAddToChatButton();
            
            // Create new button
            addToChatBtn = document.createElement('button');
                         addToChatBtn.textContent = '@ Add to Context';
            addToChatBtn.setAttribute('data-browzer-button', 'true');
            
            // Apply styles directly
            const styles = {
              position: 'fixed',
              zIndex: '2147483647',
              padding: '8px 12px',
              background: '#1a73e8',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
              boxShadow: '0 4px 16px rgba(26, 115, 232, 0.3), 0 2px 8px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)'
            };
            
            Object.assign(addToChatBtn.style, styles);
            
            // Position the button above the selection
            const buttonTop = Math.max(10, rect.top - 40);
            const buttonLeft = Math.max(10, Math.min(rect.left, window.innerWidth - 140));
            
            addToChatBtn.style.top = buttonTop + 'px';
            addToChatBtn.style.left = buttonLeft + 'px';
            
            // Hover effects
            addToChatBtn.addEventListener('mouseenter', function() {
              this.style.background = '#1557b0';
              this.style.transform = 'translateY(-1px)';
              this.style.boxShadow = '0 6px 20px rgba(26, 115, 232, 0.4), 0 4px 12px rgba(0, 0, 0, 0.15)';
            });
            
            addToChatBtn.addEventListener('mouseleave', function() {
              this.style.background = '#1a73e8';
              this.style.transform = 'translateY(0)';
              this.style.boxShadow = '0 4px 16px rgba(26, 115, 232, 0.3), 0 2px 8px rgba(0, 0, 0, 0.1)';
            });
            
            // Click handler with multiple communication methods
            addToChatBtn.addEventListener('click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              
              console.log('Add to Chat clicked, sending text:', selectedText.substring(0, 50));
              
              let messageSent = false;
              
                             // Method 1: Try IPC (for Electron webviews with node integration)
               try {
                 if (typeof require !== 'undefined') {
                   const { ipcRenderer } = require('electron');
                   if (ipcRenderer && ipcRenderer.sendToHost) {
                     ipcRenderer.sendToHost('add-to-chat', selectedText);
                     messageSent = true;
                     console.log('Message sent via IPC sendToHost');
                   }
                 }
               } catch (err) {
                 console.log('IPC sendToHost method failed:', err.message);
               }
              
              // Method 2: PostMessage to parent
              if (!messageSent) {
                try {
                  window.parent.postMessage({
                    type: 'add-to-chat',
                    text: selectedText,
                    source: 'browzer-selection'
                  }, '*');
                  messageSent = true;
                  console.log('Message sent via postMessage to parent');
                } catch (err) {
                  console.log('PostMessage to parent failed:', err.message);
                }
              }
              
              // Method 3: PostMessage to top window
              if (!messageSent) {
                try {
                  window.top.postMessage({
                    type: 'add-to-chat',
                    text: selectedText,
                    source: 'browzer-selection'
                  }, '*');
                  messageSent = true;
                  console.log('Message sent via postMessage to top');
                } catch (err) {
                  console.log('PostMessage to top failed:', err.message);
                }
              }
              
              if (messageSent) {
                console.log('Text sent to chat:', selectedText.substring(0, 30) + '...');
                hideAddToChatButton();
              } else {
                console.error('Failed to send text to chat - no communication method worked');
              }
            });
            
            // Add to DOM
            document.body.appendChild(addToChatBtn);
            console.log('Add to Chat button created and positioned');
            
            // Auto-hide after 7 seconds
            setTimeout(hideAddToChatButton, 7000);
            
          } catch (err) {
            console.error('Error creating Add to Chat button:', err);
          }
        }
        
        function hideAddToChatButton() {
          if (addToChatBtn && addToChatBtn.parentNode) {
            addToChatBtn.parentNode.removeChild(addToChatBtn);
          }
          addToChatBtn = null;
        }
        
        function handleTextSelection() {
          try {
            clearTimeout(selectionTimeout);
            selectionTimeout = setTimeout(() => {
              const selection = window.getSelection();
              const text = selection.toString().trim();
              
              if (text && text.length >= 5) {
                const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
                if (range) {
                  const rect = range.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    console.log('Text selected for add to chat:', text.substring(0, 30) + '...');
                    createAddToChatButton(text, rect);
                  }
                }
              } else {
                hideAddToChatButton();
              }
            }, 100);
          } catch (e) {
            console.error('Error in selection handler:', e);
          }
        }
        
        // Add event listeners
        document.addEventListener('mouseup', handleTextSelection, true);
        document.addEventListener('selectionchange', handleTextSelection);
        document.addEventListener('touchend', handleTextSelection);
        
        // Hide button when clicking elsewhere
        document.addEventListener('click', function(e) {
          if (addToChatBtn && !addToChatBtn.contains(e.target)) {
            hideAddToChatButton();
          }
        });
        
        // Hide on scroll
        document.addEventListener('scroll', hideAddToChatButton, true);
        window.addEventListener('resize', hideAddToChatButton);
        
        console.log('✓ Enhanced selection handler installed successfully');
        
      })();
    `;
    
    // Check one more time before execution
    if (!webview || webview.isDestroyed || !webview.executeJavaScript) {
      console.log('[Selection Handler] Webview no longer valid, skipping injection');
      return;
    }
    
    webview.executeJavaScript(injectionScript, false)
      .then(() => {
        console.log('[Selection Handler] ✓ Enhanced selection handler injection successful for webview:', webview.id);
      })
      .catch((error: any) => {
        // Don't log errors for destroyed webviews or common navigation errors
        if (!error.message.includes('Object has been destroyed') && 
            !error.message.includes('navigation') &&
            !error.message.includes('Script failed to execute')) {
          console.error('[Selection Handler] Failed to inject enhanced selection handler:', error);
        }
      });
      
  } catch (error) {
    console.error('[Selection Handler] Error setting up enhanced selection handler:', error);
  }
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

function addWorkflowProgressToChat(workflowData: any): HTMLElement {
  let chatContainer = document.getElementById('chatContainer');
  
  // Create chat container if it doesn't exist
  if (!chatContainer) {
    console.log('[addWorkflowProgressToChat] Chat container not found, creating one');
    
    const agentResults = document.getElementById('agentResults');
    if (!agentResults) {
      console.error('[addWorkflowProgressToChat] agentResults container not found');
      return document.createElement('div');
    }
    
    // Remove any existing welcome containers when starting chat
    const existingWelcome = agentResults.querySelector('.welcome-container');
    if (existingWelcome) {
      existingWelcome.remove();
    }
    
    // Create the chat container
    chatContainer = document.createElement('div');
    chatContainer.id = 'chatContainer';
    chatContainer.className = 'chat-container';
    agentResults.appendChild(chatContainer);
    
    console.log('[addWorkflowProgressToChat] Chat container created successfully');
  }

  console.log('[addWorkflowProgressToChat] Creating workflow progress for:', workflowData);

  // Create workflow progress message container
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message workflow-progress-message';
  messageDiv.dataset.role = 'workflow-progress';
  messageDiv.dataset.workflowId = workflowData.workflowId;
  messageDiv.dataset.timestamp = new Date().toISOString();

  // Create container for the workflow progress component
  const progressContainer = document.createElement('div');
  progressContainer.className = 'workflow-progress-container';
  
  messageDiv.appendChild(progressContainer);
  chatContainer.appendChild(messageDiv);

  // Initialize WorkflowProgressIndicator for this specific workflow
  const progressIndicator = new WorkflowProgressIndicator(progressContainer);
  progressIndicator.startWorkflow(workflowData);

  // Store reference to the progress indicator on the message element
  (messageDiv as any).progressIndicator = progressIndicator;

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;

  console.log('[addWorkflowProgressToChat] Workflow progress message added to chat');
  return messageDiv;
}

function findWorkflowProgressInChat(workflowId: string): HTMLElement | null {
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return null;

  const workflowMessages = chatContainer.querySelectorAll(`[data-workflow-id="${workflowId}"]`);
  return workflowMessages.length > 0 ? workflowMessages[0] as HTMLElement : null;
}

// ========================= SELECTED TEXT TO CONTEXT SYSTEM =========================

async function addSelectedTextToContextSystem(selectedText: string, webview: any): Promise<void> {
  try {
    console.log('[Context System] Adding selected text to @ context system:', selectedText.substring(0, 50) + '...');
    
    // Get current page info
    const url = webview.src || '';
    const title = webview.getTitle ? webview.getTitle() : '';
    
    // Create a webpage context with the selected text
    const contextId = `selected-${Date.now()}`;
    const contextTitle = `Selected: ${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}`;
    
    const webpageContext: WebpageContext = {
      id: contextId,
      title: contextTitle,
      url: url,
      timestamp: Date.now(),
      content: {
        title: title,
        description: `Selected text from ${title || url}`,
        content: selectedText,
        html: selectedText,
        url: url
      }
    };
    
    // Add to the context system
    addWebpageContext(webpageContext);
    
    console.log('[Context System] Selected text successfully added to @ context system');
    console.log('[Context System] Total contexts now:', selectedWebpageContexts.length);
    
  } catch (error) {
    console.error('[Context System] Error adding selected text to context system:', error);
    // Fallback to regular chat message if context system fails
    addMessageToChat('context', `**Selected Text:**\n\n${selectedText}`);
  }
}

// ========================= WEBPAGE CONTEXT MANAGEMENT =========================

function getAvailableWebpages(): WebpageContext[] {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    console.log('🔍 [DROPDOWN DEBUG] Total history items:', history.length);
    
    // Filter out internal pages and take up to 15 items for @ mentions
    const filteredHistory = history.filter((item: any) => {
      return item.url && 
             !item.url.startsWith('about:') && 
             !item.url.startsWith('file://') &&
             !item.url.includes('localhost') &&
             item.title && 
             item.title.length > 0 &&
             item.title !== 'New Tab';
    });
    
    console.log('🔍 [DROPDOWN DEBUG] Filtered history items:', filteredHistory.length);
    
    const webpages = filteredHistory.slice(0, 15).map((item: any) => ({
      id: item.id.toString(),
      title: item.title,
      url: item.url,
      timestamp: item.timestamp
    }));
    
    console.log('🔍 [DROPDOWN DEBUG] Available webpages for dropdown:', webpages.length);
    webpages.forEach((webpage: WebpageContext, index: number) => {
      console.log(`🔍 [DROPDOWN DEBUG] ${index + 1}. ${webpage.title} - ${webpage.url}`);
    });
    
    return webpages;
  } catch (error) {
    console.error('Error getting available webpages:', error);
    return [];
  }
}

function addWebpageContext(webpage: WebpageContext): void {
  console.log('🚨 [ADD CONTEXT] Adding webpage context:', webpage.title);
  console.log('🚨 [ADD CONTEXT] Current contexts before add:', selectedWebpageContexts.length);
  
  // Avoid duplicates
  if (!selectedWebpageContexts.find(ctx => ctx.url === webpage.url)) {
    selectedWebpageContexts.push(webpage);
    console.log('🔍 [CONTEXT] Added webpage context:', webpage.title);
    console.log('🚨 [ADD CONTEXT] Context added successfully, new total:', selectedWebpageContexts.length);
    updateContextVisualIndicators();
  } else {
    console.log('🚨 [ADD CONTEXT] Context already exists, skipping duplicate');
  }
}

function removeWebpageContext(webpageId: string): void {
  console.log('🚨 [REMOVE CONTEXT] Removing context with ID:', webpageId);
  const beforeCount = selectedWebpageContexts.length;
  selectedWebpageContexts = selectedWebpageContexts.filter(ctx => ctx.id !== webpageId);
  console.log('🔍 [CONTEXT] Removed webpage context:', webpageId);
  console.log('🚨 [REMOVE CONTEXT] Contexts before/after:', beforeCount, '→', selectedWebpageContexts.length);
  updateContextVisualIndicators();
}

function clearAllWebpageContexts(): void {
  console.log('🚨 [CLEAR CONTEXTS] Clearing all contexts, current count:', selectedWebpageContexts.length);
  selectedWebpageContexts = [];
  console.log('🔍 [CONTEXT] Cleared all webpage contexts');
  updateContextVisualIndicators();
}

async function fetchWebpageContent(url: string): Promise<any> {
  try {
    // Check if we can get content from an open tab with this URL
    const matchingTab = tabs.find(tab => tab.url === url);
    if (matchingTab) {
      const webview = document.getElementById(matchingTab.webviewId);
      if (webview) {
        console.log('🔍 [FETCH] Found open tab for URL:', url);
        return await extractPageContent(webview);
      }
    }
    
    console.log('🔍 [FETCH] Creating hidden webview to fetch content for:', url);
    
    // Create a hidden webview to fetch the content
    return new Promise((resolve, reject) => {
      const hiddenWebview = document.createElement('webview') as any;
      hiddenWebview.style.display = 'none';
      hiddenWebview.style.position = 'absolute';
      hiddenWebview.style.top = '-10000px';
      hiddenWebview.style.width = '1024px';
      hiddenWebview.style.height = '768px';
      
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.warn('🔍 [FETCH] Timeout fetching content for:', url);
        hiddenWebview.remove();
        resolve({
          title: '',
          description: '',
          content: `Timeout loading content from ${url}`,
          html: '',
          url: url
        });
      }, 15000); // 15 second timeout
      
      hiddenWebview.addEventListener('did-finish-load', async () => {
        try {
          console.log('🔍 [FETCH] Hidden webview loaded, extracting content for:', url);
          clearTimeout(timeout);
          
          // Extract content from the hidden webview
          const content = await extractPageContent(hiddenWebview);
          console.log('🔍 [FETCH] Content extracted successfully:', content.title);
          
          // Clean up
          hiddenWebview.remove();
          resolve(content);
        } catch (error) {
          console.error('🔍 [FETCH] Error extracting content:', error);
          clearTimeout(timeout);
          hiddenWebview.remove();
          resolve({
            title: '',
            description: '',
            content: `Error extracting content from ${url}`,
            html: '',
            url: url
          });
        }
      });
      
      hiddenWebview.addEventListener('did-fail-load', (event: any) => {
        console.error('🔍 [FETCH] Failed to load webpage:', url, event);
        clearTimeout(timeout);
        hiddenWebview.remove();
        resolve({
          title: '',
          description: '',
          content: `Failed to load content from ${url}`,
          html: '',
          url: url
        });
      });
      
      // Add to DOM and load URL
      document.body.appendChild(hiddenWebview);
      hiddenWebview.src = url;
    });
    
  } catch (error) {
    console.error('🔍 [FETCH] Error in fetchWebpageContent:', error);
    return {
      title: '',
      description: '',
      content: `Error loading content from ${url}`,
      html: '',
      url: url
    };
  }
}

function updateContextVisualIndicators(): void {
  console.log('🚨 [VISUAL INDICATORS] Updating context visual indicators');
  console.log('🚨 [VISUAL INDICATORS] Selected contexts count:', selectedWebpageContexts.length);
  
  // Update UI to show selected contexts
  const chatInputArea = document.querySelector('.chat-input-area');
  if (!chatInputArea) {
    console.log('🚨 [VISUAL INDICATORS] Chat input area not found, returning');
    return;
  }
  
  // Remove existing context indicators
  const existingIndicators = document.querySelectorAll('.context-indicators');
  console.log('🚨 [VISUAL INDICATORS] Removing existing indicators:', existingIndicators.length);
  existingIndicators.forEach(indicator => indicator.remove());
  
  // Add context indicators directly attached to the chat input area
  if (selectedWebpageContexts.length > 0) {
    console.log('🚨 [VISUAL INDICATORS] Creating context container for', selectedWebpageContexts.length, 'contexts');
    
    const contextContainer = document.createElement('div');
    contextContainer.className = 'context-indicators';
    
    selectedWebpageContexts.forEach(context => {
      console.log('🚨 [VISUAL INDICATORS] Creating indicator for:', context.title);
      const indicator = document.createElement('div');
      indicator.className = 'context-indicator';
      indicator.innerHTML = `
        <span class="context-title">${context.title}</span>
        <button class="context-remove" data-context-id="${context.id}">×</button>
      `;
      contextContainer.appendChild(indicator);
    });
    
    // Insert the context container right before the chat input area to create seamless connection
    chatInputArea.parentElement?.insertBefore(contextContainer, chatInputArea);
    console.log('🚨 [VISUAL INDICATORS] Context container inserted before chat input area');
    
    // Add CSS class to chat input area to modify its styling when context is present
    chatInputArea.classList.add('has-context');
    console.log('🚨 [VISUAL INDICATORS] Added has-context class to chat input area');
    
    // Add remove event listeners
    contextContainer.querySelectorAll('.context-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const contextId = (e.target as HTMLElement).dataset.contextId;
        if (contextId) {
          console.log('🚨 [VISUAL INDICATORS] Remove button clicked for context:', contextId);
          removeWebpageContext(contextId);
        }
      });
    });
  } else {
    console.log('🚨 [VISUAL INDICATORS] No contexts, removing has-context class');
    // Remove the has-context class when no contexts
    chatInputArea.classList.remove('has-context');
  }
}

// ========================= MENTION DROPDOWN =========================

function createMentionDropdown(): HTMLElement {
  const dropdown = document.createElement('div');
  dropdown.className = 'mention-dropdown';
  dropdown.id = 'mentionDropdown';
  
  const webpages = getAvailableWebpages();
  
  if (webpages.length === 0) {
    dropdown.innerHTML = '<div class="mention-item empty">No recent webpages found</div>';
  } else {
    dropdown.innerHTML = webpages.map(webpage => `
      <div class="mention-item" data-webpage-id="${webpage.id}" data-webpage-url="${webpage.url}">
        <div class="mention-title">${webpage.title}</div>
        <div class="mention-url">${webpage.url}</div>
      </div>
    `).join('');
  }
  
  // Add click handlers
  dropdown.querySelectorAll('.mention-item:not(.empty)').forEach(item => {
    item.addEventListener('click', async (e) => {
      const webpageId = (e.currentTarget as HTMLElement).dataset.webpageId;
      const webpageUrl = (e.currentTarget as HTMLElement).dataset.webpageUrl;
      
      console.log('🚨 [MENTION CLICK] Webpage selected:', { webpageId, webpageUrl });
      
      if (webpageId && webpageUrl) {
        const webpage = webpages.find(w => w.id === webpageId);
        if (webpage) {
          console.log('🚨 [MENTION CLICK] Found webpage object:', webpage.title);
          console.log('🚨 [MENTION CLICK] Calling fetchWebpageContent for:', webpageUrl);
          
          // Fetch content for this webpage
          const content = await fetchWebpageContent(webpageUrl);
          console.log('🚨 [MENTION CLICK] Content fetched:', {
            title: content.title,
            contentLength: content.content?.length || 0,
            htmlLength: content.html?.length || 0
          });
          
          webpage.content = content;
          
          console.log('🚨 [MENTION CLICK] Adding webpage context');
          addWebpageContext(webpage);
          console.log('🚨 [MENTION CLICK] Context added, total contexts:', selectedWebpageContexts.length);
          
          hideMentionDropdown();
          
          // Update chat input to remove the @ trigger
          const chatInput = document.getElementById('chatInput') as HTMLInputElement;
          if (chatInput) {
            const value = chatInput.value;
            const lastAtIndex = value.lastIndexOf('@');
            if (lastAtIndex !== -1) {
              console.log('🚨 [MENTION CLICK] Removing @ from input');
              chatInput.value = value.substring(0, lastAtIndex);
              chatInput.focus();
            }
          }
        } else {
          console.error('🚨 [MENTION CLICK] Webpage object not found for ID:', webpageId);
        }
      } else {
        console.error('🚨 [MENTION CLICK] Missing webpageId or webpageUrl');
      }
    });
  });
  
  return dropdown;
}

function showMentionDropdown(chatInput: HTMLInputElement): void {
  console.log('🚨 [MENTION DROPDOWN] showMentionDropdown called');
  console.log('🚨 [MENTION DROPDOWN] isShowingMentionDropdown:', isShowingMentionDropdown);
  
  if (isShowingMentionDropdown) {
    console.log('🚨 [MENTION DROPDOWN] Already showing, returning');
    return;
  }
  
  console.log('🚨 [MENTION DROPDOWN] Creating mention dropdown');
  const dropdown = createMentionDropdown();
  isShowingMentionDropdown = true;
  
  // Position dropdown above the input
  const inputRect = chatInput.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.left = `${inputRect.left}px`;
  dropdown.style.bottom = `${window.innerHeight - inputRect.top + 5}px`;
  dropdown.style.width = `${inputRect.width}px`;
  dropdown.style.maxHeight = '200px';
  
  document.body.appendChild(dropdown);
  console.log('🚨 [MENTION DROPDOWN] Dropdown added to body');
  
  console.log('🔍 [MENTION] Showing mention dropdown');
}

function hideMentionDropdown(): void {
  console.log('🚨 [MENTION DROPDOWN] hideMentionDropdown called');
  
  const dropdown = document.getElementById('mentionDropdown');
  if (dropdown) {
    console.log('🚨 [MENTION DROPDOWN] Removing dropdown from DOM');
    dropdown.remove();
    isShowingMentionDropdown = false;
    console.log('🔍 [MENTION] Hiding mention dropdown');
  } else {
    console.log('🚨 [MENTION DROPDOWN] No dropdown found to remove');
  }
}

// Helper function to build conversation history with memories
async function buildConversationHistoryWithMemories(currentUrl: string, query: string): Promise<any[]> {
  const conversationHistory: any[] = [];
  
  try {
    // Get recent chat messages from the UI
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
      const messages = chatContainer.querySelectorAll('.chat-message');
      
      // Add recent chat messages (last 10)
      const recentMessages = Array.from(messages).slice(-10);
      recentMessages.forEach(message => {
        // Skip loading messages
        if (message.querySelector('.loading')) return;
        
        // Determine role (user or assistant)
        let role = 'assistant';
        if (message.classList.contains('user-message')) {
          role = 'user';
        }
        
        // Get text content, stripping HTML
        const contentEl = message.querySelector('.message-content');
        let content = '';
        if (contentEl) {
          // Create a temporary div to extract text without HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = contentEl.innerHTML;
          content = tempDiv.textContent || tempDiv.innerText || '';
        }
        
        if (content && !content.includes('class="loading"')) {
          conversationHistory.push({
            role: role,
            content: content
          });
        }
      });
    }
    
    // Get relevant memories from localStorage (simple approach)
    try {
      const allMemories = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
      if (allMemories && allMemories.length > 0) {
        // Simple relevance scoring - get recent memories from same domain or with query keywords
        const relevantMemories = allMemories.slice(0, 10).filter((memory: any) => {
          if (!memory) return false;
          
          // Check domain match
          const currentDomain = currentUrl ? new URL(currentUrl).hostname : '';
          const memoryDomain = memory.domain || '';
          if (currentDomain && memoryDomain && currentDomain === memoryDomain) {
            return true;
          }
          
          // Check keyword match in question or answer
          const queryLower = query.toLowerCase();
          const questionMatch = memory.question && memory.question.toLowerCase().includes(queryLower);
          const answerMatch = memory.answer && memory.answer.toLowerCase().includes(queryLower);
          
          return questionMatch || answerMatch;
        }).slice(0, 5); // Take top 5 relevant memories
        
        console.log(`[Memory] Found ${relevantMemories.length} relevant memories for query:`, query);
        
        // Format memories with proper structure expected by Python agents
        relevantMemories.forEach((memory: any) => {
          // Add the original question as a user message with memory flag
          conversationHistory.push({
            role: 'user',
            content: memory.question,
            isMemory: true,
            source: {
              url: memory.url,
              domain: memory.domain,
              title: memory.title,
              timestamp: memory.timestamp,
              topic: memory.topic
            }
          });
          
          // Add the answer as an assistant message with memory flag  
          conversationHistory.push({
            role: 'assistant',
            content: memory.answer,
            isMemory: true,
            source: {
              url: memory.url,
              domain: memory.domain,
              title: memory.title,
              timestamp: memory.timestamp,
              topic: memory.topic
            }
          });
        });
      }
    } catch (memoryError) {
      console.error('[Memory] Error retrieving memories:', memoryError);
    }
    
         console.log(`[Memory] Built conversation history with ${conversationHistory.length} items (${conversationHistory.filter(item => item.isMemory).length} from memory)`);
     return conversationHistory;
     
   } catch (error) {
     console.error('[Memory] Error building conversation history with memories:', error);
     return conversationHistory; // Return whatever we have so far
   }
 }

// Simple memory functions (based on working deprecated implementation)
function storeInMemory(url: string, question: string, answer: string, title: string = ''): void {
  try {
    // Skip storing memory for empty content
    if (!url || (!question && !answer)) {
      console.log('Skipping memory storage due to empty content');
      return;
    }
    
    // Get existing memory
    let memory: any[] = [];
    try {
      memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
      if (!Array.isArray(memory)) {
        console.error('Memory is not an array, resetting');
        memory = [];
      }
    } catch (parseError) {
      console.error('Error parsing memory from localStorage:', parseError);
      memory = [];
    }
    
    // Get page title from active webview if not provided
    let pageTitle = title;
    if (!pageTitle) {
      const activeWebview = getActiveWebview();
      if (activeWebview) {
        try {
          pageTitle = activeWebview.getTitle ? activeWebview.getTitle() : '';
        } catch (e) {
          console.error('Error getting title:', e);
        }
      }
    }
    
    // Try to detect the main topic automatically
    let pageTopic = '';
    try {
      pageTopic = extractTopicSimple({
        title: pageTitle,
        question: question,
        answer: answer
      });
    } catch (topicError) {
      console.error('Error extracting topic:', topicError);
    }
    
    // Create memory item with enhanced metadata
    const memoryItem = {
      timestamp: Date.now(),
      url: url || '',
      title: pageTitle || '',
      question: question || '',
      answer: answer || '',
      domain: url ? (new URL(url)).hostname : '',
      topic: pageTopic || '',
      // Track the model used for answers when available
      modelInfo: {
        provider: getModelProvider(),
        name: 'unknown' // We can enhance this later
      }
    };
    
    // Add to beginning of array
    memory.unshift(memoryItem);
    
    // Limit size
    if (memory.length > MAX_MEMORY_ITEMS) {
      memory = memory.slice(0, MAX_MEMORY_ITEMS);
    }
    
    // Save to localStorage immediately
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
      console.log('Memory stored:', { url, question: question.substring(0, 50), topic: pageTopic });
    } catch (saveError) {
      console.error('Error saving memory to localStorage:', saveError);
    }
    
  } catch (error) {
    console.error('Error storing memory:', error);
  }
}

function extractTopicSimple(itemContent: any): string {
  try {
    if (!itemContent) return '';
    
    // Simple topic extraction - look for knowledge domains, subjects, or key entities
    const fullText = `${itemContent.title || ''} ${itemContent.question || ''}`.toLowerCase();
    
    // Common subjects and entities people might compare
    const knownDomains = [
      'python', 'javascript', 'react', 'machine learning', 'ai', 'artificial intelligence',
      'computer science', 'programming', 'crypto', 'cryptocurrency', 'bitcoin', 'ethereum',
      'history', 'science', 'physics', 'chemistry', 'biology', 'medicine', 'health',
      'politics', 'economics', 'finance', 'investing', 'stocks', 'business',
      'climate', 'environment', 'technology', 'privacy', 'security',
      'education', 'travel', 'food', 'nutrition', 'diet', 'fitness'
    ];
    
    for (const domain of knownDomains) {
      if (fullText.includes(domain)) {
        return domain;
      }
    }
    
    // If no known domain, try to use first 2-3 significant words from title/question
    const words = fullText.split(/\s+/).filter(w => w && w.length > 3);
    if (words.length >= 2) {
      return words.slice(0, 2).join(' ');
    }
    
    return '';
  } catch (error) {
    console.error('Error extracting topic:', error);
    return '';
  }
}

// ========================= AD BLOCKER SETUP =========================

function setupAdBlocker(): void {
  console.log('[AdBlocker] Setting up ad blocker controls...');
  
  // Get UI elements
  const adBlockEnabledCheckbox = document.getElementById('adBlockEnabled') as HTMLInputElement;
  const domainInput = document.getElementById('domainInput') as HTMLInputElement;
  const blockDomainBtn = document.getElementById('blockDomainBtn') as HTMLButtonElement;
  const allowDomainBtn = document.getElementById('allowDomainBtn') as HTMLButtonElement;
  const blockedDomainsCount = document.getElementById('blockedDomainsCount') as HTMLSpanElement;
  const cssRulesCount = document.getElementById('cssRulesCount') as HTMLSpanElement;
  const filterRulesCount = document.getElementById('filterRulesCount') as HTMLSpanElement;
  const blockedDomainsList = document.getElementById('blockedDomainsList') as HTMLDivElement;
  const allowedDomainsList = document.getElementById('allowedDomainsList') as HTMLDivElement;
  
  if (!adBlockEnabledCheckbox || !domainInput || !blockDomainBtn || !allowDomainBtn) {
    console.error('[AdBlocker] Required UI elements not found');
    return;
  }
  
  // Load initial state
  loadAdBlockerStatus();
  
  // Set up event listeners
  adBlockEnabledCheckbox.addEventListener('change', async () => {
    try {
      const enabled = adBlockEnabledCheckbox.checked;
      const result = await ipcRenderer.invoke('toggle-adblock', enabled);
      
      if (result.success) {
        console.log(`[AdBlocker] Ad blocking ${enabled ? 'enabled' : 'disabled'}`);
        showToast(`Ad blocking ${enabled ? 'enabled' : 'disabled'}`, 'success');
        
        // Re-inject CSS into all webviews
        const webviews = document.querySelectorAll('webview');
        webviews.forEach((webview: any) => {
          setTimeout(() => {
            // Validate webview before injection
            if (webview && !webview.isDestroyed && webview.executeJavaScript && webview.src && webview.src !== 'about:blank') {
              injectAdBlockCSS(webview);
            }
          }, 100);
        });
      } else {
        console.error('[AdBlocker] Failed to toggle ad blocker:', result.error);
        showToast('Failed to toggle ad blocker', 'error');
        // Revert checkbox state
        adBlockEnabledCheckbox.checked = !enabled;
      }
    } catch (error) {
      console.error('[AdBlocker] Error toggling ad blocker:', error);
      showToast('Error toggling ad blocker', 'error');
    }
  });
  
  blockDomainBtn.addEventListener('click', async () => {
    const domain = domainInput.value.trim();
    if (!domain) {
      showToast('Please enter a domain', 'error');
      return;
    }
    
    try {
      const result = await ipcRenderer.invoke('add-blocked-domain', domain);
      if (result.success) {
        console.log(`[AdBlocker] Added blocked domain: ${domain}`);
        showToast(`Blocked domain: ${domain}`, 'success');
        domainInput.value = '';
        loadAdBlockerStatus();
      } else {
        console.error('[AdBlocker] Failed to add blocked domain:', result.error);
        showToast('Failed to add blocked domain', 'error');
      }
    } catch (error) {
      console.error('[AdBlocker] Error adding blocked domain:', error);
      showToast('Error adding blocked domain', 'error');
    }
  });
  
  allowDomainBtn.addEventListener('click', async () => {
    const domain = domainInput.value.trim();
    if (!domain) {
      showToast('Please enter a domain', 'error');
      return;
    }
    
    try {
      const result = await ipcRenderer.invoke('add-allowed-domain', domain);
      if (result.success) {
        console.log(`[AdBlocker] Added allowed domain: ${domain}`);
        showToast(`Allowed domain: ${domain}`, 'success');
        domainInput.value = '';
        loadAdBlockerStatus();
      } else {
        console.error('[AdBlocker] Failed to add allowed domain:', result.error);
        showToast('Failed to add allowed domain', 'error');
      }
    } catch (error) {
      console.error('[AdBlocker] Error adding allowed domain:', error);
      showToast('Error adding allowed domain', 'error');
    }
  });
  
  // Allow adding domains by pressing Enter
  domainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        allowDomainBtn.click();
      } else {
        blockDomainBtn.click();
      }
    }
  });
  
  console.log('[AdBlocker] Ad blocker controls set up successfully');
}

async function loadAdBlockerStatus(): Promise<void> {
  try {
    const status = await ipcRenderer.invoke('get-adblock-status');
    
    // Update checkbox
    const adBlockEnabledCheckbox = document.getElementById('adBlockEnabled') as HTMLInputElement;
    if (adBlockEnabledCheckbox) {
      adBlockEnabledCheckbox.checked = status.enabled;
    }
    
    // Update stats
    const blockedDomainsCount = document.getElementById('blockedDomainsCount') as HTMLSpanElement;
    const cssRulesCount = document.getElementById('cssRulesCount') as HTMLSpanElement;
    const filterRulesCount = document.getElementById('filterRulesCount') as HTMLSpanElement;
    
    if (blockedDomainsCount) blockedDomainsCount.textContent = status.stats.blockedDomains.toString();
    if (cssRulesCount) cssRulesCount.textContent = status.stats.cssRules.toString();
    if (filterRulesCount) filterRulesCount.textContent = status.stats.filterRules.toString();
    
    console.log('[AdBlocker] Status loaded:', status);
  } catch (error) {
    console.error('[AdBlocker] Error loading status:', error);
    
    // Set default values
    const blockedDomainsCount = document.getElementById('blockedDomainsCount') as HTMLSpanElement;
    const cssRulesCount = document.getElementById('cssRulesCount') as HTMLSpanElement;
    const filterRulesCount = document.getElementById('filterRulesCount') as HTMLSpanElement;
    
    if (blockedDomainsCount) blockedDomainsCount.textContent = 'Error';
    if (cssRulesCount) cssRulesCount.textContent = 'Error';
    if (filterRulesCount) filterRulesCount.textContent = 'Error';
  }
}

function getModelProvider(): string {
  const modelSelector = document.getElementById('modelSelector') as HTMLSelectElement;
  if (!modelSelector) return 'unknown';
  return modelSelector.value || 'unknown';
}