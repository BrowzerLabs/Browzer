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
const path = require('path');
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

// History management
const HISTORY_STORAGE_KEY = 'browser_history';

// Caching system constants
const CACHE_PREFIX = 'browser_cache_';
const CACHE_METADATA_KEY = 'cache_metadata';
const CACHE_SETTINGS_KEY = 'cache_settings';

// Cache types
const CACHE_TYPES = {
  PAGE_CONTENT: 'page_content',
  API_RESPONSE: 'api_response', 
  METADATA: 'metadata',
  RESOURCES: 'resources',
  AI_ANALYSIS: 'ai_analysis'
};

// Default cache settings
const DEFAULT_CACHE_SETTINGS = {
  maxSize: 50 * 1024 * 1024, // 50MB total cache size
  maxItems: 1000, // Maximum number of cached items
  defaultTTL: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  enableCompression: true,
  enableAutoCleanup: true,
  cleanupInterval: 60 * 60 * 1000, // 1 hour
  typeTTLs: {
    [CACHE_TYPES.PAGE_CONTENT]: 6 * 60 * 60 * 1000, // 6 hours
    [CACHE_TYPES.API_RESPONSE]: 2 * 60 * 60 * 1000, // 2 hours
    [CACHE_TYPES.METADATA]: 24 * 60 * 60 * 1000, // 24 hours
    [CACHE_TYPES.RESOURCES]: 7 * 24 * 60 * 60 * 1000, // 7 days
    [CACHE_TYPES.AI_ANALYSIS]: 12 * 60 * 60 * 1000 // 12 hours
  }
};

// Cache system class
class BrowserCache {
  constructor() {
    this.settings = this.loadSettings();
    this.metadata = this.loadMetadata();
    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      evictions: 0
    };
    
    // Auto-cleanup timer
    if (this.settings.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  // Load cache settings
  loadSettings() {
    try {
      const saved = localStorage.getItem(CACHE_SETTINGS_KEY);
      return saved ? { ...DEFAULT_CACHE_SETTINGS, ...JSON.parse(saved) } : DEFAULT_CACHE_SETTINGS;
    } catch (error) {
      console.error('Error loading cache settings:', error);
      return DEFAULT_CACHE_SETTINGS;
    }
  }

  // Save cache settings
  saveSettings() {
    try {
      localStorage.setItem(CACHE_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Error saving cache settings:', error);
    }
  }

  // Load cache metadata
  loadMetadata() {
    try {
      const saved = localStorage.getItem(CACHE_METADATA_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Error loading cache metadata:', error);
      return {};
    }
  }

  // Save cache metadata
  saveMetadata() {
    try {
      localStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(this.metadata));
    } catch (error) {
      console.error('Error saving cache metadata:', error);
    }
  }

  // Generate cache key
  generateKey(type, identifier, params = {}) {
    const paramString = Object.keys(params).length > 0 ? JSON.stringify(params) : '';
    const combined = `${type}:${identifier}:${paramString}`;
    
    // Use a simple hash for long keys
    if (combined.length > 100) {
      return `${CACHE_PREFIX}${this.simpleHash(combined)}`;
    }
    
    return `${CACHE_PREFIX}${combined}`;
  }

  // Simple hash function
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Compress data if enabled
  compress(data) {
    if (!this.settings.enableCompression) return data;
    
    try {
      // Simple compression using JSON stringification with reduced whitespace
      if (typeof data === 'object') {
        return JSON.stringify(data);
      }
      return data;
    } catch (error) {
      console.error('Error compressing data:', error);
      return data;
    }
  }

  // Decompress data if needed
  decompress(data, originalType) {
    if (!this.settings.enableCompression) return data;
    
    try {
      if (originalType === 'object' && typeof data === 'string') {
        return JSON.parse(data);
      }
      return data;
    } catch (error) {
      console.error('Error decompressing data:', error);
      return data;
    }
  }

  // Set cache item
  set(type, identifier, data, customTTL = null, params = {}) {
    try {
      const key = this.generateKey(type, identifier, params);
      const ttl = customTTL || this.settings.typeTTLs[type] || this.settings.defaultTTL;
      const expiresAt = Date.now() + ttl;
      
      const originalType = typeof data;
      const compressedData = this.compress(data);
      
      const cacheItem = {
        data: compressedData,
        originalType: originalType,
        type: type,
        identifier: identifier,
        params: params,
        createdAt: Date.now(),
        expiresAt: expiresAt,
        accessCount: 0,
        lastAccessed: Date.now(),
        size: JSON.stringify(compressedData).length
      };

      // Check if we need to make space
      this.ensureSpace(cacheItem.size);

      // Store the item
      localStorage.setItem(key, JSON.stringify(cacheItem));
      
      // Update metadata
      this.metadata[key] = {
        type: type,
        createdAt: cacheItem.createdAt,
        expiresAt: expiresAt,
        size: cacheItem.size,
        lastAccessed: cacheItem.lastAccessed
      };
      
      this.saveMetadata();
      this.stats.writes++;
      
      console.log(`Cache SET: ${type}:${identifier} (${this.formatSize(cacheItem.size)})`);
      return true;
      
    } catch (error) {
      console.error('Error setting cache item:', error);
      return false;
    }
  }

  // Get cache item
  get(type, identifier, params = {}) {
    try {
      const key = this.generateKey(type, identifier, params);
      const itemStr = localStorage.getItem(key);
      
      if (!itemStr) {
        this.stats.misses++;
        return null;
      }

      const item = JSON.parse(itemStr);
      
      // Check expiration
      if (Date.now() > item.expiresAt) {
        this.delete(type, identifier, params);
        this.stats.misses++;
        return null;
      }

      // Update access stats
      item.accessCount++;
      item.lastAccessed = Date.now();
      
      // Update metadata
      if (this.metadata[key]) {
        this.metadata[key].lastAccessed = item.lastAccessed;
      }
      
      // Re-save with updated stats
      localStorage.setItem(key, JSON.stringify(item));
      this.saveMetadata();
      
      this.stats.hits++;
      
      console.log(`Cache HIT: ${type}:${identifier}`);
      return this.decompress(item.data, item.originalType);
      
    } catch (error) {
      console.error('Error getting cache item:', error);
      this.stats.misses++;
      return null;
    }
  }

  // Delete cache item
  delete(type, identifier, params = {}) {
    try {
      const key = this.generateKey(type, identifier, params);
      localStorage.removeItem(key);
      delete this.metadata[key];
      this.saveMetadata();
      
      console.log(`Cache DELETE: ${type}:${identifier}`);
      return true;
    } catch (error) {
      console.error('Error deleting cache item:', error);
      return false;
    }
  }

  // Check if item exists and is valid
  has(type, identifier, params = {}) {
    try {
      const key = this.generateKey(type, identifier, params);
      const metadata = this.metadata[key];
      
      if (!metadata) return false;
      if (Date.now() > metadata.expiresAt) {
        this.delete(type, identifier, params);
        return false;
      }
      
      return localStorage.getItem(key) !== null;
    } catch (error) {
      console.error('Error checking cache item:', error);
      return false;
    }
  }

  // Clear cache by type
  clearByType(type) {
    try {
      let cleared = 0;
      const keysToDelete = [];
      
      for (const [key, metadata] of Object.entries(this.metadata)) {
        if (metadata.type === type) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => {
        localStorage.removeItem(key);
        delete this.metadata[key];
        cleared++;
      });
      
      this.saveMetadata();
      console.log(`Cache cleared ${cleared} items of type: ${type}`);
      return cleared;
    } catch (error) {
      console.error('Error clearing cache by type:', error);
      return 0;
    }
  }

  // Clear all cache
  clearAll() {
    try {
      let cleared = 0;
      const keysToDelete = Object.keys(this.metadata);
      
      keysToDelete.forEach(key => {
        localStorage.removeItem(key);
        cleared++;
      });
      
      this.metadata = {};
      this.saveMetadata();
      
      // Reset stats
      this.stats = { hits: 0, misses: 0, writes: 0, evictions: 0 };
      
      console.log(`Cache cleared all ${cleared} items`);
      return cleared;
    } catch (error) {
      console.error('Error clearing all cache:', error);
      return 0;
    }
  }

  // Ensure we have enough space for new item
  ensureSpace(newItemSize) {
    const currentSize = this.getCurrentSize();
    const totalItems = Object.keys(this.metadata).length;
    
    // Check size limit
    if (currentSize + newItemSize > this.settings.maxSize) {
      this.evictLRU(currentSize + newItemSize - this.settings.maxSize);
    }
    
    // Check item count limit
    if (totalItems >= this.settings.maxItems) {
      this.evictLRU(0, totalItems - this.settings.maxItems + 1);
    }
  }

  // Evict least recently used items
  evictLRU(sizeToFree = 0, itemsToFree = 0) {
    try {
      // Sort by last accessed (oldest first)
      const sortedItems = Object.entries(this.metadata)
        .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
      
      let freedSize = 0;
      let freedItems = 0;
      
      for (const [key, metadata] of sortedItems) {
        if ((sizeToFree > 0 && freedSize >= sizeToFree) || 
            (itemsToFree > 0 && freedItems >= itemsToFree)) {
          break;
        }
        
        localStorage.removeItem(key);
        freedSize += metadata.size;
        freedItems++;
        delete this.metadata[key];
        this.stats.evictions++;
        
        console.log(`Cache EVICT: ${key} (${this.formatSize(metadata.size)})`);
      }
      
      this.saveMetadata();
      console.log(`Cache evicted ${freedItems} items, freed ${this.formatSize(freedSize)}`);
      
    } catch (error) {
      console.error('Error during cache eviction:', error);
    }
  }

  // Clean up expired items
  cleanup() {
    try {
      const now = Date.now();
      let cleaned = 0;
      let freedSize = 0;
      
      const expiredKeys = Object.entries(this.metadata)
        .filter(([, metadata]) => now > metadata.expiresAt)
        .map(([key]) => key);
      
      expiredKeys.forEach(key => {
        const metadata = this.metadata[key];
        localStorage.removeItem(key);
        freedSize += metadata.size;
        delete this.metadata[key];
        cleaned++;
      });
      
      if (cleaned > 0) {
        this.saveMetadata();
        console.log(`Cache cleanup: removed ${cleaned} expired items, freed ${this.formatSize(freedSize)}`);
      }
      
      return { cleaned, freedSize };
    } catch (error) {
      console.error('Error during cache cleanup:', error);
      return { cleaned: 0, freedSize: 0 };
    }
  }

  // Start auto-cleanup timer
  startAutoCleanup() {
    setInterval(() => {
      this.cleanup();
    }, this.settings.cleanupInterval);
  }

  // Get current cache size
  getCurrentSize() {
    return Object.values(this.metadata).reduce((sum, item) => sum + item.size, 0);
  }

  // Get cache statistics
  getStats() {
    const currentSize = this.getCurrentSize();
    const itemCount = Object.keys(this.metadata).length;
    const hitRate = this.stats.hits + this.stats.misses > 0 ? 
      (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      currentSize: this.formatSize(currentSize),
      currentSizeBytes: currentSize,
      maxSize: this.formatSize(this.settings.maxSize),
      itemCount: itemCount,
      maxItems: this.settings.maxItems,
      utilization: `${((currentSize / this.settings.maxSize) * 100).toFixed(1)}%`
    };
  }

  // Format size for display
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Update settings
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }
}

// Initialize global cache instance
const browserCache = new BrowserCache();

// Cache helper functions for common operations
const CacheHelpers = {
  // Cache page content for faster AI analysis
  cachePageContent: async (url, webview) => {
    try {
      if (!url || url === 'about:blank') return false;
      
      // Check if already cached and recent
      const cached = browserCache.get(CACHE_TYPES.PAGE_CONTENT, url);
      if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30 minutes
        return cached;
      }
      
      // Extract fresh content
      const content = await extractPageContent(webview, { 
        includeHtml: false, 
        preserveLinks: true,
        detectContentType: true 
      });
      
      if (content && content.content) {
        // Cache with metadata
        const cacheData = {
          ...content,
          timestamp: Date.now(),
          domain: new URL(url).hostname
        };
        
        browserCache.set(CACHE_TYPES.PAGE_CONTENT, url, cacheData);
        console.log(`Cached page content for: ${url}`);
        return cacheData;
      }
      
      return false;
    } catch (error) {
      console.error('Error caching page content:', error);
      return false;
    }
  },

  // Cache AI analysis results
  cacheAIAnalysis: (url, query, result, model = 'unknown') => {
    try {
      const cacheKey = `${url}_${query.substring(0, 50)}`;
      const cacheData = {
        result: result,
        query: query,
        model: model,
        timestamp: Date.now(),
        domain: url ? new URL(url).hostname : 'unknown'
      };
      
      browserCache.set(CACHE_TYPES.AI_ANALYSIS, cacheKey, cacheData);
      console.log(`Cached AI analysis for: ${url}`);
      return true;
    } catch (error) {
      console.error('Error caching AI analysis:', error);
      return false;
    }
  },

  // Get cached AI analysis
  getCachedAIAnalysis: (url, query) => {
    try {
      const cacheKey = `${url}_${query.substring(0, 50)}`;
      return browserCache.get(CACHE_TYPES.AI_ANALYSIS, cacheKey);
    } catch (error) {
      console.error('Error getting cached AI analysis:', error);
      return null;
    }
  },

  // Cache API responses
  cacheAPIResponse: (endpoint, params, response, customTTL = null) => {
    try {
      const cacheKey = `${endpoint}_${JSON.stringify(params).substring(0, 100)}`;
      browserCache.set(CACHE_TYPES.API_RESPONSE, cacheKey, response, customTTL);
      console.log(`Cached API response for: ${endpoint}`);
      return true;
    } catch (error) {
      console.error('Error caching API response:', error);
      return false;
    }
  },

  // Get cached API response
  getCachedAPIResponse: (endpoint, params) => {
    try {
      const cacheKey = `${endpoint}_${JSON.stringify(params).substring(0, 100)}`;
      return browserCache.get(CACHE_TYPES.API_RESPONSE, cacheKey);
    } catch (error) {
      console.error('Error getting cached API response:', error);
      return null;
    }
  },

  // Cache page metadata (title, description, etc.)
  cachePageMetadata: (url, metadata) => {
    try {
      browserCache.set(CACHE_TYPES.METADATA, url, metadata);
      console.log(`Cached metadata for: ${url}`);
      return true;
    } catch (error) {
      console.error('Error caching metadata:', error);
      return false;
    }
  },

  // Get cached metadata
  getCachedMetadata: (url) => {
    try {
      return browserCache.get(CACHE_TYPES.METADATA, url);
    } catch (error) {
      console.error('Error getting cached metadata:', error);
      return null;
    }
  },

  // Smart cache key generation for URLs
  generateURLCacheKey: (url) => {
    try {
      const urlObj = new URL(url);
      // Remove query parameters that don't affect content
      const paramsToIgnore = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid', '_ga'];
      
      paramsToIgnore.forEach(param => {
        urlObj.searchParams.delete(param);
      });
      
      return urlObj.toString();
    } catch (error) {
      return url; // Fallback to original URL
    }
  },

  // Preload cache for common operations
  preloadCache: async (urls) => {
    try {
      const promises = urls.map(async (url) => {
        if (!browserCache.has(CACHE_TYPES.PAGE_CONTENT, url)) {
          // This would need to be implemented with background loading
          console.log(`Would preload: ${url}`);
        }
      });
      
      await Promise.all(promises);
    } catch (error) {
      console.error('Error preloading cache:', error);
    }
  }
};

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

// Add this after the existing constants but before the tab management
// Memory management
const MEMORY_KEY = 'agent_memory';
const MAX_MEMORY_ITEMS = 100; // Maximum number of conversation items to store
// Store and manage the agent's memory
function storeInMemory(url, question, answer, title = '') {
  try {
    // Skip storing memory for empty content
    if (!url || (!question && !answer)) {
      console.log('Skipping memory storage due to empty content');
      return;
    }
    
    // Get existing memory
    let memory = [];
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
      pageTopic = extractTopic({
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
        name: getModelName()
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
      console.log('Memory stored:', memoryItem);
    } catch (saveError) {
      console.error('Error saving memory to localStorage:', saveError);
    }
    
    // Try to get content snippet in background with improved extraction
    const activeWebview = getActiveWebview();
    if (activeWebview) {
      try {
        activeWebview.executeJavaScript(`
          (function() {
            try {
              // Try multiple strategies to get the most relevant content
              
              // First, look for the main article content
              const mainContent = document.querySelector('article') || 
                                document.querySelector('main') || 
                                document.querySelector('.content') ||
                                document.querySelector('#content');
              
              if (mainContent) {
                // If we have a main content section, try to get the most relevant paragraph
                const paragraphs = mainContent.querySelectorAll('p');
                if (paragraphs && paragraphs.length > 0) {
                  // Get the longest paragraph (likely the most informative)
                  let bestParagraph = '';
                  let bestLength = 0;
                  
                  for (const p of paragraphs) {
                    const text = p.innerText.trim();
                    if (text.length > bestLength && text.length > 100) {
                      bestParagraph = text;
                      bestLength = text.length;
                    }
                  }
                  
                  if (bestParagraph) {
                    return bestParagraph.substring(0, 500) + (bestParagraph.length > 500 ? '...' : '');
                  }
                  
                  // If no good paragraph, return a collection of shorter paragraphs
                  const combinedParagraphs = Array.from(paragraphs)
                    .map(p => p.innerText.trim())
                    .filter(t => t.length > 30)
                    .slice(0, 3)
                    .join(' ');
                    
                  if (combinedParagraphs) {
                    return combinedParagraphs.substring(0, 500) + (combinedParagraphs.length > 500 ? '...' : '');
                  }
                }
                
                // Fallback to main content text
                return mainContent.innerText.substring(0, 500) + '...';
              }
              
              // If no main content found, try looking for key headings and their following content
              const headings = document.querySelectorAll('h1, h2, h3');
              if (headings && headings.length > 0) {
                for (const heading of headings) {
                  // Find the next paragraph after this heading
                  let nextElement = heading.nextElementSibling;
                  while (nextElement && 
                         (nextElement.tagName !== 'P' || 
                          nextElement.innerText.trim().length < 50)) {
                    nextElement = nextElement.nextElementSibling;
                  }
                  
                  if (nextElement && nextElement.tagName === 'P') {
                    const headingText = heading.innerText.trim();
                    const paragraphText = nextElement.innerText.trim();
                    if (paragraphText.length > 50) {
                      return headingText + ': ' + paragraphText.substring(0, 450) + '...';
                    }
                  }
                }
              }
              
              // Last resort: get the first 500 characters of useful body text
              const bodyText = document.body.innerText
                .replace(/\\s+/g, ' ')
                .trim()
                .substring(0, 500);
              return bodyText + (bodyText.length === 500 ? '...' : '');
            } catch(e) {
              console.error('Error getting content snippet:', e);
              return '';
            }
          })()
        `).then(snippet => {
          if (snippet) {
            try {
              // Get memory again in case it changed
              let updatedMemory = [];
              try {
                updatedMemory = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
              } catch (parseError) {
                console.error('Error parsing memory for snippet update:', parseError);
                return;
              }
              
              // Update the memory item we just added with the snippet
              if (updatedMemory.length > 0 && updatedMemory[0].timestamp === memoryItem.timestamp) {
                updatedMemory[0].contentSnippet = snippet;
                
                // Also try to extract keywords from the content for better retrieval later
                try {
                  const keywords = extractKeywords(snippet, 5);
                  if (keywords && keywords.length > 0) {
                    updatedMemory[0].keywords = keywords;
                  }
                } catch (keywordError) {
                  console.error('Error extracting keywords:', keywordError);
                }
                
                localStorage.setItem(MEMORY_KEY, JSON.stringify(updatedMemory));
                console.log('Updated memory with content snippet and keywords');
              }
            } catch (memoryUpdateError) {
              console.error('Error updating memory with snippet:', memoryUpdateError);
            }
          }
        }).catch(e => {
          console.error('Error getting content snippet:', e);
        });
      } catch (e) {
        console.error('Error executing JS for content snippet:', e);
      }
    }
  } catch (error) {
    console.error('Error storing memory:', error);
  }
}

// Helper function to extract keywords from text
function extractKeywords(text, maxKeywords = 5) {
  if (!text || typeof text !== 'string') return [];
  
  try {
    // Simple keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word && word.length > 4);
    
    // Count word frequencies
    const wordFreq = {};
    words.forEach(word => {
      if (!wordFreq[word]) wordFreq[word] = 0;
      wordFreq[word]++;
    });
    
    // Sort by frequency
    const sortedWords = Object.keys(wordFreq)
      .sort((a, b) => wordFreq[b] - wordFreq[a])
      .slice(0, maxKeywords);
    
    return sortedWords;
  } catch (error) {
    console.error('Error extracting keywords:', error);
    return [];
  }
}

// Helper to get current model provider
function getModelProvider() {
  const modelSelector = document.getElementById('modelSelector');
  if (!modelSelector) return 'unknown';
  return modelSelector.value || 'unknown';
}

// Get relevant memories for a given context
function getRelevantMemories(url, query, limit = 5) {
  try {
    // Safe initialization
    const memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
    if (!memory || !Array.isArray(memory) || memory.length === 0) {
      console.log('No memories found in storage');
      return [];
    }
    
    // Continue with regular processing...
    let relevantMemories = [];
    try {
      const currentDomain = url ? new URL(url).hostname : '';
      
      // Extract meaningful keywords from the query
      const stopWords = ['the', 'and', 'for', 'with', 'from', 'how', 'what', 'when', 'where', 'who', 'why', 'does', 'do', 'is', 'are', 'will', 'should', 'can', 'could', 'would', 'this', 'that', 'these', 'those', 'there', 'their', 'about'];
      
      // Clean the query for better keyword extraction
      const cleanQuery = query.toLowerCase()
        .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
        .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
        .trim();
      
      // Extract keywords
      const queryWords = cleanQuery.split(/\s+/);
      const queryKeywords = queryWords.filter(word => word.length > 2 && !stopWords.includes(word));
      
      console.log('Searching memory with keywords:', queryKeywords);
      
      // Score each memory item for relevance
      const scoredMemories = memory.map(item => {
        if (!item) return { memory: null, score: 0 };
        
        let score = 0;
        
        // Prepare memory content for matching - safely
        const itemContent = {
          title: (item.title || '').toLowerCase(),
          question: (item.question || '').toLowerCase(),
          answer: (item.answer || '').toLowerCase(),
          contentSnippet: (item.contentSnippet || '').toLowerCase(),
          domain: (item.domain || '').toLowerCase()
        };
        
        // Domain match
        if (currentDomain && itemContent.domain) {
          if (currentDomain === itemContent.domain) {
            score += 5;
          } else if (currentDomain.includes(itemContent.domain) || itemContent.domain.includes(currentDomain)) {
            score += 2;
          }
        }
        
        // Temporal relevance
        const ageInHours = (Date.now() - (item.timestamp || 0)) / (1000 * 60 * 60);
        if (ageInHours < 1) {
          score += 4; // Very recent (less than 1 hour)
        } else if (ageInHours < 24) {
          score += 3; // Today
        } else if (ageInHours < 72) {
          score += 2; // Last few days
        } else if (ageInHours < 168) {
          score += 1; // Last week
        }
        
        // Keyword matching with field weighting
        const weights = {
          question: 3,
          title: 2.5,
          answer: 2,
          contentSnippet: 1
        };
        
        // Exact keyword matches
        for (const keyword of queryKeywords) {
          if (!keyword) continue;
          
          // Direct field matches with weighted scoring
          Object.entries(weights).forEach(([field, weight]) => {
            if (itemContent[field] && itemContent[field].includes(keyword)) {
              score += weight;
            }
          });
        }
        
        return { 
          memory: item, 
          score
        };
      }).filter(item => item.memory !== null);
      
      // Sort by score (highest first)
      scoredMemories.sort((a, b) => b.score - a.score);
      
      // Only include items with a minimum score
      const minimumScore = query.length > 30 ? 3 : 2;
      
      // Get the top memories
      relevantMemories = scoredMemories
        .filter(item => item.score >= minimumScore)
        .map(item => item.memory)
        .slice(0, limit);
      
      console.log(`Found ${relevantMemories.length} relevant memories`);
      
      return relevantMemories;
    } catch (innerError) {
      console.error('Error scoring memories:', innerError);
      return [];
    }
  } catch (error) {
    console.error('Error in getRelevantMemories:', error);
    return []; // Return empty array on error to prevent crashes
  }
}

// Helper function to extract potential topic from memory content
function extractTopic(itemContent) {
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

// Helper to deduplicate overlapping memories
function deduplicateMemories(memories) {
  try {
    if (!memories || !Array.isArray(memories) || memories.length <= 1) return memories || [];
    
    const result = [];
    const seenContent = new Set();
    
    for (const memory of memories) {
      if (!memory) continue;
      
      // Create a fingerprint of the memory content
      const contentFingerprint = ((memory.question || '') + (memory.answer || '')).substring(0, 100);
      
      // Skip if we've seen very similar content
      if (seenContent.has(contentFingerprint)) continue;
      
      // Otherwise add to results
      result.push(memory);
      seenContent.add(contentFingerprint);
    }
    
    return result;
  } catch (error) {
    console.error('Error deduplicating memories:', error);
    return memories || []; // Return original memories on error
  }
}

// Load saved preferences on startup
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded');
  
  // Initialize DOM element references
  tabsContainer = document.getElementById('tabsContainer');
  newTabBtn = document.getElementById('newTabBtn');
  webviewsContainer = document.querySelector('.webviews-container');

  // Add CSS fix for empty memory context blocks
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    /* Fix for empty memory contexts */
    .memory-context:empty,
    .memory-context .memory-list:empty,
    .context-message:empty,
    .context-message:has(.memory-list:empty) {
      display: none !important;
    }
    
    /* Fix for yellow block that appears sometimes */
    .chat-message.context-message {
      display: none;
    }
    
    .chat-message.context-message:has(.memory-item) {
      display: block;
    }
  `;
  document.head.appendChild(styleEl);

  // Set up IPC listeners for menu commands
  const { ipcRenderer } = require('electron');
  
  // Handle menu commands
  ipcRenderer.on('menu-new-tab', () => {
    console.log('Menu: New Tab');
    createNewTab();
  });
  
  ipcRenderer.on('menu-close-tab', () => {
    console.log('Menu: Close Tab');
    if (activeTabId) {
      closeTab(activeTabId);
    }
  });
  
  ipcRenderer.on('menu-show-history', () => {
    console.log('Menu: Show History');
    showHistoryPage();
  });
  
  ipcRenderer.on('menu-reload', () => {
    console.log('Menu: Reload');
    const webview = getActiveWebview();
    if (webview) {
      webview.reload();
    }
  });
  
  ipcRenderer.on('menu-force-reload', () => {
    console.log('Menu: Force Reload');
    const webview = getActiveWebview();
    if (webview) {
      webview.reloadIgnoringCache();
    }
  });
  
  ipcRenderer.on('menu-go-back', () => {
    console.log('Menu: Go Back');
    const webview = getActiveWebview();
    if (webview && webview.canGoBack()) {
      webview.goBack();
    }
  });
  
  ipcRenderer.on('menu-go-forward', () => {
    console.log('Menu: Go Forward');
    const webview = getActiveWebview();
    if (webview && webview.canGoForward()) {
      webview.goForward();
    }
  });
  
  ipcRenderer.on('menu-clear-history', () => {
    console.log('Menu: Clear History');
    if (confirm('Are you sure you want to clear all browsing history? This action cannot be undone.')) {
      try {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        alert('History cleared successfully.');
      } catch (error) {
        console.error('Error clearing history:', error);
        alert('Error clearing history: ' + error.message);
      }
    }
  });

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

    // Configure webview to mimic a real browser and avoid detection
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'; // Common Chrome User Agent

    // Modern browser-like webview preferences
    // contextIsolation=true is crucial for security and mimicking modern browsers.
    // nodeIntegration=false is also important for security and standard browser behavior.
    const webPreferencesArray = [
      'contextIsolation=true',
      'nodeIntegration=false',
      'webSecurity=true',
      'allowRunningInsecureContent=false',
      'experimentalFeatures=true', // Enables features that might be on by default in Chrome
      'sandbox=false', // Disabling sandbox can sometimes help with compatibility but consider security implications
      'webgl=true',
      'plugins=true', // Though NPAPI plugins are deprecated, some sites might check for this
      'javascript=true',
      'images=true',
      'textAreasAreResizable=true',
      'backgroundThrottling=false' // Prevents throttling of background tabs
    ];

    // Apply browser-like settings
    webview.setAttribute('useragent', userAgent);
    webview.setAttribute('webpreferences', webPreferencesArray.join(', '));
    webview.setAttribute('allowpopups', 'true'); // Allow popups as most browsers do
    webview.setAttribute('partition', 'persist:main-session'); // Use a persistent session

    // Enable modern web features (enableremotemodule should be false for security)
    webview.setAttribute('enableremotemodule', 'false');
    webview.setAttribute('nodeintegrationinsubframes', 'false');
    
    // Set the preload script path for injecting scripts safely with contextIsolation
    const preloadScriptPath = `file://${__dirname}/preload.js`;
    webview.setAttribute('preload', preloadScriptPath);

    // Special handling for problematic sites - might use a separate session or slightly different prefs
    if (needsSpecialSettings) {
      console.log('Using enhanced compatibility mode for:', url);
      // Use a different partition for problematic sites to isolate their data
      webview.setAttribute('partition', 'persist:compat-session');
      // Potentially override some webPreferences for compatibility if needed, but start with the same secure defaults.
      // For example, if a site specifically breaks with the sandbox, you might adjust it here ONLY for that site.
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
    
    // Inject selection handler and compatibility scripts via preload, triggered by an IPC message from the webview once it's ready
    webview.addEventListener('ipc-message', (event) => {
      if (event.channel === 'webview-ready-for-scripts') {
        console.log(`Webview ${webview.id} is ready for scripts. Injecting selection handler and compatibility enhancements.`);
        // Inject selection handler
        injectSelectionHandler(webview); 
        // Inject compatibility enhancements
        webview.executeJavaScript(`
          // Override navigator properties to better mimic Chrome
          try {
            Object.defineProperty(navigator, 'webdriver', {
              get: () => false, // Explicitly set to false, as it is in real Chrome
            });
            Object.defineProperty(navigator, 'languages', {
              get: () => ['en-US', 'en'], // Common browser languages
            });
            Object.defineProperty(navigator, 'platform', {
              get: () => 'MacIntel', // Common platform for macOS Chrome
            });
            Object.defineProperty(navigator, 'plugins', {
              get: () => ({ length: 0 }), // Mimic no plugins, or a few common ones if needed
            });
            
            // Ensure window.chrome object looks more legitimate
            window.chrome = window.chrome || {};
            window.chrome.runtime = window.chrome.runtime || {};
            window.chrome.loadTimes = window.chrome.loadTimes || function() {};
            window.chrome.csi = window.chrome.csi || function() {};
            
            // Remove properties that might indicate Electron
            delete window.process;
            delete window.Buffer;
            delete window.global;
            delete window.require;
            delete window.exports;
            delete window.module;

            console.log('Browser compatibility enhancements applied inside webview.');
          } catch (e) {
            console.error('Error applying compatibility enhancements inside webview:', e.message);
          }
        `).catch(err => {
          console.error('Failed to inject compatibility enhancements into webview:', err.message);
        });
      }
    });
    
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
        if (urlBar) {
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
    if (urlBar) {
    urlBar.value = webview.src;
    }
    
    // Update tab title
    updateTabTitle(webview, webview.getTitle());
    
    // Update navigation buttons
    updateNavigationButtons();
    
    // Track page visit in history
    const url = webview.src;
    const title = webview.getTitle();
    if (url && url !== 'about:blank' && !url.startsWith('file://')) {
      trackPageVisit(url, title);
    }
    
    // Cache page content and metadata for faster AI analysis
    if (url && url.startsWith('http')) {
      // Cache page metadata
      const metadata = {
        title: title || '',
        url: url,
        timestamp: Date.now(),
        domain: new URL(url).hostname
      };
      CacheHelpers.cachePageMetadata(url, metadata);
      
      // Cache page content in background (non-blocking)
      setTimeout(async () => {
        try {
          await CacheHelpers.cachePageContent(url, webview);
        } catch (error) {
          console.error('Error caching page content:', error);
        }
      }, 2000); // Wait 2 seconds after page load to ensure content is ready
    }
    
    // Auto-summarize if enabled (for any page, not just Google)
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
      showToast('✓ Text added to chat input');
    }
  });
  
  // Also listen for console messages to help debug add-to-chat
  webview.addEventListener('console-message', (event) => {
    if (event.message.includes('Text sent to chat') || event.message.includes('selection handler')) {
      console.log(`Webview ${webview.id} console:`, event.message);
    }
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
    
    // Show feedback
    showToast('✓ Text added to chat input');
    return;
  }
  
  // Handle navigation messages from history page
  if (event.data && event.data.type === 'navigate-to' && event.data.url) {
    console.log('Received navigate-to message from history page:', event.data.url);
    const webview = getActiveWebview();
    if (webview) {
      webview.loadURL(event.data.url);
    }
  }
  
  // Handle clear history message
  if (event.data && event.data.type === 'clear-history') {
    console.log('Received clear-history message from history page');
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      console.log('History cleared successfully');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }
  
  // Handle delete history item message
  if (event.data && event.data.type === 'delete-history-item' && event.data.itemId) {
    console.log('Received delete-history-item message for ID:', event.data.itemId);
    try {
      let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
      history = history.filter(item => item.id !== event.data.itemId);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
      console.log('History item deleted successfully');
    } catch (error) {
      console.error('Error deleting history item:', error);
    }
  }
});

// Modify the addSelectedTextToChat function
function addSelectedTextToChat(selectedText) {
  if (!selectedText || selectedText.trim().length === 0) {
    console.error('No text to add to chat');
    showToast('❌ Error: No text selected');
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
    // Ensure agent results area exists first
    const agentResults = document.getElementById('agentResults');
    if (!agentResults) {
      console.error('Agent results container not found');
      showToast('❌ Error: Chat area not found');
      return;
    }
    
    // Initialize chat UI if it doesn't exist
    let chatContainer = document.getElementById('chatContainer');
    let chatInput = document.getElementById('chatInput');
    
    if (!chatInput) {
      console.log('Chat input not found, initializing chat UI');
      
      // Clear existing content if needed
      if (!chatContainer) {
        agentResults.innerHTML = '';
        
        // Create chat container
        chatContainer = document.createElement('div');
        chatContainer.id = 'chatContainer';
        chatContainer.className = 'chat-container';
        agentResults.appendChild(chatContainer);
        
        // Add welcome message if container is empty
        if (chatContainer.children.length === 0) {
          const welcomeMessage = document.createElement('div');
          welcomeMessage.className = 'welcome-container';
          welcomeMessage.innerHTML = `
            <div class="welcome-icon">💬</div>
            <h3>Chat with AI</h3>
            <p>Text from webpage added to chat input. Ask questions about the selected content.</p>
          `;
          chatContainer.appendChild(welcomeMessage);
        }
      }
      
      // Add chat input area
      const chatInputArea = document.createElement('div');
      chatInputArea.className = 'chat-input-area';
      chatInputArea.innerHTML = `
        <input type="text" id="chatInput" placeholder="Ask a question about the selected text..." />
        <button id="sendMessageBtn" class="chat-send-btn">Send</button>
      `;
      agentResults.appendChild(chatInputArea);
      
      // Set up event handlers for the new input
      setupChatInputHandlers();
      
      // Get the newly created input
      chatInput = document.getElementById('chatInput');
    }
    
    if (chatInput) {
      // Add selected text directly without quotes or hyphen formatting
      const textToAdd = selectedText + (truncated ? ' (truncated)' : '');
      
      // If there's already text in the input, append to it with a space
      const existingText = chatInput.value.trim();
      if (existingText) {
        chatInput.value = existingText + ' ' + textToAdd;
      } else {
        chatInput.value = textToAdd;
      }
      
      // Focus and position cursor at the end
      chatInput.focus();
      chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length);
      
      // Scroll to make sure input is visible
      chatInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      
      console.log('✓ Text successfully added to chat input');
    } else {
      throw new Error('Could not create or find chat input');
    }
  } catch (error) {
    console.error('Error adding text to chat input:', error);
    showToast('❌ Error adding text to chat input');
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
if (backBtn) {
backBtn.addEventListener('click', () => {
  const webview = getActiveWebview();
  const tab = getActiveTab();
  
  if (webview && tab && webview.canGoBack()) {
    webview.goBack();
  }
});
} else {
  console.warn('backBtn element not found');
}

if (forwardBtn) {
forwardBtn.addEventListener('click', () => {
  const webview = getActiveWebview();
  const tab = getActiveTab();
  
  if (webview && tab && webview.canGoForward()) {
    webview.goForward();
  }
});
} else {
  console.warn('forwardBtn element not found');
}

if (reloadBtn) {
reloadBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (webview) {
        webview.reload();
    }
});
} else {
  console.warn('reloadBtn element not found');
}

// URL handling
function navigateToUrl() {
    if (!urlBar) {
      console.warn('urlBar element not found');
      return;
    }
    
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

if (goBtn) {
goBtn.addEventListener('click', navigateToUrl);
} else {
  console.warn('goBtn element not found');
}

if (urlBar) {
urlBar.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        navigateToUrl();
    }
});
} else {
  console.warn('urlBar element not found');
}

// History button
const historyBtn = document.getElementById('historyBtn');
if (historyBtn) {
    historyBtn.addEventListener('click', showHistoryPage);
}

// Update navigation buttons
function updateNavigationButtons() {
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

// Extensions Panel Management
if (extensionsBtn) {
extensionsBtn.addEventListener('click', () => {
      if (extensionsPanel) {
    extensionsPanel.classList.toggle('hidden');
      }
});
} else {
  console.warn('extensionsBtn element not found');
}

if (closeExtensionsBtn) {
closeExtensionsBtn.addEventListener('click', () => {
      if (extensionsPanel) {
    extensionsPanel.classList.add('hidden');
      }
});
} else {
  console.warn('closeExtensionsBtn element not found');
}

// Developer Mode
if (developerModeToggle) {
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
} else {
  console.warn('developerModeToggle element not found');
}

// Extension Installation
if (installExtensionBtn) {
installExtensionBtn.addEventListener('click', () => {
      if (extensionFile) {
    extensionFile.setAttribute('webkitdirectory', '');
    extensionFile.removeAttribute('accept');
    extensionFile.click();
      }
});
} else {
  console.warn('installExtensionBtn element not found');
}

if (loadExtensionBtn) {
loadExtensionBtn.addEventListener('click', () => {
      if (extensionFile) {
    extensionFile.removeAttribute('webkitdirectory');
    extensionFile.setAttribute('accept', '.crx');
    extensionFile.click();
      }
});
} else {
  console.warn('loadExtensionBtn element not found');
}

if (extensionFile) {
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
} else {
  console.warn('extensionFile element not found');
}

// Chrome Web Store Integration
if (openChromeStoreBtn) {
openChromeStoreBtn.addEventListener('click', () => {
    shell.openExternal('https://chrome.google.com/webstore');
});
} else {
  console.warn('openChromeStoreBtn element not found');
}

if (installFromStoreBtn) {
installFromStoreBtn.addEventListener('click', async () => {
      const extensionId = extensionIdInput ? extensionIdInput.value.trim() : '';
    if (!extensionId) {
        alert('Please enter an extension ID');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('install-from-store', extensionId);
        if (result.success) {
            updateExtensionsList();
              if (extensionIdInput) {
            extensionIdInput.value = '';
              }
        } else {
            alert('Failed to install extension: ' + result.error);
        }
    } catch (err) {
        alert('Error installing extension: ' + err.message);
    }
});
} else {
  console.warn('installFromStoreBtn element not found');
}

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
    
    // Detect if this is a question vs. a summary request
    // Skip question detection for URLs
    const isUrl = query.startsWith('http://') || query.startsWith('https://');
    
    // Question detection - if the query contains question marks or question words
    const questionWords = ['what', 'where', 'when', 'who', 'why', 'how', 'can', 'does', 'do', 'is', 'are', 'will', 'should'];
    const isQuestion = !isUrl && (query.includes('?') || 
                       questionWords.some(word => query.toLowerCase().split(/\s+/).includes(word.toLowerCase())));
    
    console.log(`Query "${query}" ${isQuestion ? 'appears to be a question' : 'appears to be a summary request'}`);
    
    // Check cache first for AI analysis results
    const normalizedQuery = query.toLowerCase().trim();
    const cachedResult = CacheHelpers.getCachedAIAnalysis(url, normalizedQuery);
    
    if (cachedResult && Date.now() - cachedResult.timestamp < 30 * 60 * 1000) { // 30 minutes cache
      console.log('Using cached AI analysis result for:', normalizedQuery);
      
      // Set up chat container if it doesn't exist
      const agentResults = document.getElementById('agentResults');
      if (agentResults) {
        let chatContainer = document.getElementById('chatContainer');
        if (!chatContainer) {
          console.log('Chat container not found, creating one');
          agentResults.innerHTML = '';
          
          chatContainer = document.createElement('div');
          chatContainer.id = 'chatContainer';
          chatContainer.className = 'chat-container';
          agentResults.appendChild(chatContainer);
          
          const chatInputArea = document.createElement('div');
          chatInputArea.className = 'chat-input-area';
          chatInputArea.innerHTML = `
            <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
            <button id="sendMessageBtn" class="chat-send-btn">Send</button>
          `;
          agentResults.appendChild(chatInputArea);
          
          setupChatInputHandlers();
        }
      }
      
      // Display cached results with cache indicator
      const cachedData = {
        ...cachedResult.result,
        cached: true,
        cacheTime: cachedResult.timestamp
      };
      
      addMessageToChat('assistant', 
        `<div class="info-message" style="margin-bottom: 12px; font-size: 12px; color: #666;">
          📋 Retrieved from cache (saved ${Math.round((Date.now() - cachedResult.timestamp) / 60000)} minutes ago)
        </div>`
      );
      
      displayAgentResults(cachedData);
      return;
    }
    
    // If this is a question, enhance the query with explicit instructions
    if (isQuestion) {
      // Format the query to clearly indicate it's a question requiring an answer
      query = `DIRECT QUESTION: ${query}\n\nPlease provide a direct answer to this specific question using the available context. Do not include source information or citations in your answer text - these will be displayed separately in a dedicated sources section.`;
      console.log('Enhanced question query:', query);
    }
    
    // Extract URLs from the page for Topic agent
    let urls = [];
    try {
      urls = await extractLinksFromWebview(webview);
    } catch (e) {
      console.error('Error extracting links:', e);
      // Continue with empty URLs array
    }
    
    // Extract page content for context (especially important for questions)
    let pageContent = null;
    if (agentType === 'topic' && isQuestion) {
      try {
        pageContent = await extractPageContent(webview);
        console.log('Extracted page content for question context');
      } catch (e) {
        console.error('Error extracting page content:', e);
      }
    }
    
    // If we want to use the topic agent and have extracted urls, pass them
    // For other agents like crypto, just use the query
    let agentParams = { 
      query,
      originalQuery: query.replace(/^DIRECT QUESTION: /, '').split('\n')[0], // Store the original query
      modelInfo: {
        provider,
        apiKey
      }
    };
    
    if (isQuestion) {
      agentParams.isQuestion = true;
    }
    
    if (agentType === 'topic') {
      if (isQuestion && pageContent) {
        // For questions, prioritize page content as context
        agentParams.pageContent = pageContent;
        agentParams.isDirectPage = true;
        
        // Also include URLs if available
        if (urls.length > 0) {
          agentParams.urls = urls.slice(0, 5); // Pass up to 5 URLs
        }
      } else if (urls.length > 0) {
        // For summaries, prioritize URLs
        agentParams.urls = urls.slice(0, 5); // Pass up to 5 URLs to the agent
      } else if (pageContent) {
        // Fallback to page content if no URLs
        agentParams.pageContent = pageContent;
        agentParams.isDirectPage = true;
      }
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
      isQuestion: agentParams.isQuestion || false,
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
          <button id="sendMessageBtn" class="chat-send-btn"></button>
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
    
    // Get conversation history if this is a direct question
    if (isQuestion) {
      const chatContainer = document.getElementById('chatContainer');
      let conversationHistory = [];
      
      if (chatContainer) {
        const messages = chatContainer.querySelectorAll('.chat-message');
        
        messages.forEach(message => {
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
          
          if (content) {
            conversationHistory.push({
              role: role,
              content: content
            });
          }
        });
        
        // Add the conversation history to agent params if we have any
        if (conversationHistory.length > 0) {
          console.log('Including conversation history for context:', conversationHistory);
          agentParams.conversationHistory = conversationHistory;
        }
      }
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
      
      // Cache the AI analysis result for future use
      if (result.data) {
        const originalQuery = agentParams.originalQuery || query;
        CacheHelpers.cacheAIAnalysis(url, originalQuery.toLowerCase().trim(), result.data, provider);
        console.log('Cached AI analysis result for future use');
      }
      
      // Store auto-summarized page in memory regardless of whether it's a question
      if (result.data && result.data.consolidated_summary) {
        // For auto-summarize, use the page title/URL as the "question"
        const pageTitle = result.data.summaries && result.data.summaries[0] ? 
          result.data.summaries[0].title : title || url;
        
        // Store visited page in memory
        storeInMemory(
          url, 
          `Auto-summary of ${pageTitle}`, 
          result.data.consolidated_summary,
          pageTitle
        );
      }
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
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    const loadingMessages = chatContainer.querySelectorAll('.chat-message');
    loadingMessages.forEach(message => {
      if (message.querySelector('.loading')) {
        message.remove();
      }
    });
  }
  
  // Then add the message to chat
  addMessageToChat(role, content, timing);
}

// Display agent execution results
function displayAgentResults(data) {
  if (!data) {
    clearLoadingAndUpdateChat('assistant', 'No data received from agent');
    return;
  }

  console.log("Agent result data:", data);
  
  // Remove any empty context messages before displaying new results
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    const emptyContextMessages = chatContainer.querySelectorAll('.context-message:not(:has(.memory-item))');
    emptyContextMessages.forEach(msg => msg.remove());
  }
  
  // Get current URL to store with memory
  const webview = getActiveWebview();
  const currentUrl = webview ? webview.src : '';
  let pageTitle = webview && webview.getTitle ? webview.getTitle() : '';
  
  // Check if this is a question answer or a regular summary
  const isQuestion = data.isQuestion === true;
  
  // Check if this is cached data
  const isCached = data.cached === true;
  let displayTiming = data.generation_time;
  
  // If cached, show 0.01s and prepare cache info
  if (isCached && data.cacheTime) {
    displayTiming = 0.01;
    const ageMinutes = Math.round((Date.now() - data.cacheTime) / 60000);
    // Store cache info to be picked up by addMessageToChat
    if (chatContainer) {
      chatContainer.dataset.cacheInfo = `saved ${ageMinutes} minutes ago`;
    }
  }
  
  // Handle direct question answers with special formatting
  if (isQuestion) {
    let answer = data.consolidated_summary || "No direct answer found for your question.";
    
    // Format as an answer rather than a summary - remove any "Source:" text that's in the answer
    answer = answer.replace(/Source:.*?(\.|$)/g, '').trim();
    let formattedAnswer = `<div class="answer-content">${answer}</div>`;
    
    // Include sources if available, but in a separate div with proper styling
    if (data.summaries && data.summaries.length > 0) {
      formattedAnswer += `<div class="answer-sources"><h4>Sources:</h4><ul>${data.summaries.map(source => 
            `<li><a href="${source.url}" target="_blank">${source.title}</a></li>`
          ).join('')}</ul></div>`;
    }
    
    clearLoadingAndUpdateChat('assistant', formattedAnswer, displayTiming);
    
    // Store this Q&A in memory (extract question from data)
    const question = data.originalQuery || data.query || '';
    if (question && question.replace('DIRECT QUESTION:', '').trim()) {
      storeInMemory(currentUrl, question.replace('DIRECT QUESTION:', '').trim(), answer, pageTitle);
    }
    
    return;
  }
  
  // Handle regular summaries (non-questions)
  if (data.consolidated_summary) {
    clearLoadingAndUpdateChat('assistant', data.consolidated_summary, displayTiming);
    
    // Always store the summary in memory for future reference
    // This makes all web content and summaries available for future questions
    const summaryTitle = data.summaries && data.summaries.length > 0 ? data.summaries[0].title : pageTitle || 'Page summary';
    storeInMemory(
      currentUrl, 
      `Page content: ${summaryTitle}`, 
      data.consolidated_summary,
      pageTitle
    );
  } else if (data.summaries && data.summaries.length > 0) {
    // If no consolidated summary, show the individual summaries
    const summariesText = data.summaries.map(s => `<b>${s.title}</b>\n${s.summary}`).join('\n\n');
    clearLoadingAndUpdateChat('assistant', summariesText, displayTiming);
    
    // Store individual summaries
    data.summaries.forEach(summary => {
      if (summary.url && summary.summary) {
        storeInMemory(
          summary.url,
          `Content from: ${summary.title || 'Page'}`,
          summary.summary,
          summary.title
        );
      }
    });
  } else {
    clearLoadingAndUpdateChat('assistant', 'No relevant information found.', displayTiming);
  }
}

function displayAgentError(error) {
  addMessageToChat('assistant', `Error: ${error}`);
}

if (dragbar) {
dragbar.addEventListener('mousedown', function(e) {
    isDragging = true;
    document.body.style.cursor = 'ew-resize';
});
} else {
  console.warn('dragbar element not found');
}

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
  
  // Get page title to use as context
  let title = '';
  try {
    title = webview.getTitle ? webview.getTitle() : '';
  } catch (e) {
    console.error('Error getting webview title:', e);
  }
  
  // Extract query from URL or title
  let query = url;
  if (isGoogleSearch) {
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
    query = title || url;
  }
  
  // Detect if this is a question vs. a summary request
  const isUrl = query.startsWith('http://') || query.startsWith('https://');
  const questionWords = ['what', 'where', 'when', 'who', 'why', 'how', 'can', 'does', 'do', 'is', 'are', 'will', 'should'];
  const isQuestion = !isUrl && (query.includes('?') || 
                     questionWords.some(word => query.toLowerCase().split(/\s+/).includes(word.toLowerCase())));
  
  console.log(`Auto-summarize query "${query}" ${isQuestion ? 'appears to be a question' : 'appears to be a summary request'}`);
  
  // Check cache first for auto-summarize results
  const normalizedQuery = query.toLowerCase().trim();
  const cachedResult = CacheHelpers.getCachedAIAnalysis(url, normalizedQuery);
  
  if (cachedResult && Date.now() - cachedResult.timestamp < 60 * 60 * 1000) { // 1 hour cache for auto-summarize
    console.log('Using cached auto-summarize result for:', normalizedQuery);
    
    // Clear any loading indicators first
    const loadingMessages = document.querySelectorAll('.loading');
    loadingMessages.forEach(message => {
      const parentMessage = message.closest('.chat-message');
      if (parentMessage) {
        parentMessage.remove();
      }
    });
    
    // Display cached results with cache indicator
    const cachedData = {
      ...cachedResult.result,
      cached: true,
      cacheTime: cachedResult.timestamp
    };
    
    addMessageToChat('assistant', 
      `<div class="info-message" style="margin-bottom: 12px; font-size: 12px; color: #666;">
        📋 Auto-summary from cache (saved ${Math.round((Date.now() - cachedResult.timestamp) / 60000)} minutes ago)
      </div>`
    );
    
    displayAgentResults(cachedData);
    return;
  }
  
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
        
        // Setup agent parameters
        const agentParams = {
          query,
          urls: urls.slice(0, 5),
          isQuestion,
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
          
          // Store auto-summarized page in memory regardless of whether it's a question
          if (result.data && result.data.consolidated_summary) {
            // For auto-summarize, use the page title/URL as the "question"
            const pageTitle = result.data.summaries && result.data.summaries[0] ? 
              result.data.summaries[0].title : title || url;
            
            // Store visited page in memory
            storeInMemory(
              url, 
              `Auto-summary of ${pageTitle}`, 
              result.data.consolidated_summary,
              pageTitle
            );
          }
          
          // Cache the auto-summarize result for future use
          if (result.data) {
            CacheHelpers.cacheAIAnalysis(url, normalizedQuery, result.data, provider);
            console.log('Cached auto-summarize result for future use');
          }
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
        
        // Build agent parameters
        const agentParams = {
          query: title || url, // Use page title as query if available
          pageContent: pageContent,
          isDirectPage: true,
          isQuestion,
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
          
          // Store auto-summarized page in memory regardless of whether it's a question
          if (result.data && result.data.consolidated_summary) {
            // For auto-summarize, use the page title/URL as the "question"
            const pageTitle = result.data.summaries && result.data.summaries[0] ? 
              result.data.summaries[0].title : title || url;
            
            // Store visited page in memory
            storeInMemory(
              url, 
              `Auto-summary of ${pageTitle}`, 
              result.data.consolidated_summary,
              pageTitle
            );
          }
          
          // Cache the auto-summarize result for future use
          if (result.data) {
            CacheHelpers.cacheAIAnalysis(url, normalizedQuery, result.data, provider);
            console.log('Cached auto-summarize result for future use');
          }
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

// Improve extractPageContent function with better error handling and caching
async function extractPageContent(specificWebview = null, options = {}) {
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
    
    // Check cache first for performance
    if (currentUrl && currentUrl.startsWith('http')) {
      const cachedContent = browserCache.get(CACHE_TYPES.PAGE_CONTENT, currentUrl);
      if (cachedContent && Date.now() - cachedContent.timestamp < 10 * 60 * 1000) { // 10 minutes
        console.log('Using cached page content for:', currentUrl);
        return cachedContent;
      }
    }
    
    // Default options - ALWAYS extract maximum content for better LLM analysis
    const defaultOptions = {
      includeHtml: true,        // Always extract HTML for link preservation
      preserveLinks: true,      // Always preserve links 
      detectContentType: true,  // Auto-detect what format to use based on the query
      waitForDynamic: true,     // Wait for dynamic content to load
      includeBlogContent: true  // Specifically look for blog content
    };
    
    const opts = {...defaultOptions, ...options};
    
    // NOTE: HTML content and links are now extracted by default for better LLM analysis
    
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
                extractPageContent(webview, opts).then(resolve).catch(e => {
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
        
        // Enhanced extraction script with HTML support
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
              
              // Find main content element
              const mainContent = document.querySelector('article') || 
                                document.querySelector('main') || 
                                document.querySelector('.content') ||
                                document.querySelector('#content') ||
                                document.body;
              
              // Handle HTML extraction if requested
              ${opts.includeHtml ? `
                if (mainContent) {
                  // Create a clone to modify without affecting the original page
                  const clone = mainContent.cloneNode(true);
                  
                  // Remove scripts, styles, and other unwanted elements
                  clone.querySelectorAll('script, style, iframe, noscript, svg, canvas').forEach(el => el.remove());
                  
                  // Process links to make them more visible to the LLM
                  ${opts.preserveLinks ? `
                    clone.querySelectorAll('a').forEach(link => {
                      if (link.href) {
                        // Mark the original text
                        const originalText = link.textContent.trim();
                        // Add explicit link annotation with URL
                        link.textContent = originalText + " [LINK: " + link.href + "]";
                        // Add a special attribute to make links stand out
                        link.setAttribute('data-extracted-link', 'true');
                      }
                    });
                    
                    // Also process buttons and interactive elements
                    clone.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach(btn => {
                      const btnText = btn.textContent.trim() || btn.value || "Button";
                      btn.setAttribute('data-extracted-button', btnText);
                    });
                  ` : ''}
                  
                  // Get both HTML and text content
                  return {
                    title: title,
                    description: description,
                    content: clone.innerText,
                    htmlContent: clone.innerHTML,
                    url: window.location.href
                  };
                }
              ` : ''}
              
              // Standard text extraction (when HTML not requested or as fallback)
              if (mainContent) {
                // If we have a main content section, try to get the most relevant paragraph
                const paragraphs = mainContent.querySelectorAll('p');
                if (paragraphs && paragraphs.length > 0) {
                  // Get the longest paragraph (likely the most informative)
                  let bestParagraph = '';
                  let bestLength = 0;
                  
                  for (const p of paragraphs) {
                    const text = p.innerText.trim();
                    if (text.length > bestLength && text.length > 100) {
                      bestParagraph = text;
                      bestLength = text.length;
                    }
                  }
                  
                  if (bestParagraph) {
                    return {
                      title: title,
                      description: description,
                      content: mainContent.innerText, 
                      url: window.location.href
                    };
                  }
                  
                  // If no good paragraph, return a collection of shorter paragraphs
                  const combinedParagraphs = Array.from(paragraphs)
                    .map(p => p.innerText.trim())
                    .filter(t => t.length > 30)
                    .slice(0, 3)
                    .join(' ');
                    
                  if (combinedParagraphs) {
                    return {
                      title: title,
                      description: description,
                      content: mainContent.innerText,
                      url: window.location.href
                    };
                  }
                }
                
                // Fallback to main content text
                return {
                  title: title,
                  description: description,
                  content: mainContent.innerText,
                  url: window.location.href
                };
              }
              
              // Last resort: get useful body text
              const bodyText = document.body.innerText
                .replace(/\\s+/g, ' ')
                .trim();
                
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
          if (pageInfo?.htmlContent) {
            console.log('HTML content extracted, length:', pageInfo.htmlContent.length);
          }
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

// // FIXER Also hook into form submissions to catch Google searches
// webview.addEventListener('did-start-navigation', (event) => {
//   if (event.url.includes('google.com/search')) {
//     // This is likely a Google search - we'll auto-summarize after it loads
//     console.log('Google search detected');
//   }
// });

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
  
  // Ctrl+H: Show history
  if (e.ctrlKey && e.key === 'h') {
    e.preventDefault();
    showHistoryPage();
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
    
    // Add Memory Management section
    const memorySection = document.createElement('div');
    memorySection.className = 'memory-section';
    memorySection.innerHTML = `
      <h4>AI Memory Management</h4>
      <div class="memory-controls">
        <div class="memory-stats">
          <span id="memoryCount">0</span> memories stored
        </div>
        <div class="memory-actions">
          <button id="clearMemoryBtn" class="btn-warning">Clear Memory</button>
          <button id="exportMemoryBtn">Export</button>
          <button id="importMemoryBtn">Import</button>
        </div>
      </div>
    `;
    extensionsContent.appendChild(memorySection);
    
    // Set up memory buttons
    const clearMemoryBtn = document.getElementById('clearMemoryBtn');
    const exportMemoryBtn = document.getElementById('exportMemoryBtn');
    const importMemoryBtn = document.getElementById('importMemoryBtn');
    const memoryCountSpan = document.getElementById('memoryCount');
    
    // Update memory count
    function updateMemoryCount() {
      try {
        const memory = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]');
        memoryCountSpan.textContent = memory.length.toString();
      } catch (e) {
        console.error('Error updating memory count:', e);
        memoryCountSpan.textContent = '0';
      }
    }
    
    // Initial count update
    updateMemoryCount();
    
    // Clear memory
    clearMemoryBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all AI memory? This cannot be undone.')) {
        localStorage.removeItem(MEMORY_KEY);
        updateMemoryCount();
        alert('Memory cleared successfully.');
      }
    });
    
    // Export memory
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
      } catch (e) {
        console.error('Error exporting memory:', e);
        alert('Error exporting memory: ' + e.message);
      }
    });
    
    // Import memory
    importMemoryBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const contents = event.target.result;
            const parsed = JSON.parse(contents);
            
            if (Array.isArray(parsed)) {
              localStorage.setItem(MEMORY_KEY, contents);
              updateMemoryCount();
              alert('Memory imported successfully.');
            } else {
              alert('Invalid memory file format.');
            }
          } catch (e) {
            alert('Error parsing memory file: ' + e.message);
          }
        };
        
        reader.readAsText(file);
      };
      
      input.click();
    });
    
    // Add Cache Management section
    const cacheSection = document.createElement('div');
    cacheSection.className = 'cache-section';
    cacheSection.innerHTML = `
      <h4>Cache Management</h4>
      <div class="cache-stats">
        <div class="cache-stat-item">
          <span class="cache-stat-label">Cache Size:</span>
          <span id="cacheSize">Loading...</span>
        </div>
        <div class="cache-stat-item">
          <span class="cache-stat-label">Items Cached:</span>
          <span id="cacheItems">Loading...</span>
        </div>
        <div class="cache-stat-item">
          <span class="cache-stat-label">Hit Rate:</span>
          <span id="cacheHitRate">Loading...</span>
        </div>
        <div class="cache-stat-item">
          <span class="cache-stat-label">Cache Utilization:</span>
          <span id="cacheUtilization">Loading...</span>
        </div>
      </div>
      <div class="cache-controls">
        <div class="cache-type-controls">
          <button id="clearPageCacheBtn" class="btn-secondary">Clear Page Cache</button>
          <button id="clearApiCacheBtn" class="btn-secondary">Clear API Cache</button>
          <button id="clearAllCacheBtn" class="btn-warning">Clear All Cache</button>
        </div>
        <div class="cache-settings">
          <label>
            <span>Max Cache Size (MB):</span>
            <input type="number" id="maxCacheSize" min="10" max="500" step="10" value="50">
          </label>
          <label>
            <span>Auto Cleanup:</span>
            <input type="checkbox" id="autoCleanupEnabled" checked>
          </label>
          <button id="saveCacheSettingsBtn" class="btn-primary">Save Settings</button>
        </div>
      </div>
      <div class="cache-actions">
        <button id="cleanupExpiredBtn" class="btn-secondary">Cleanup Expired</button>
        <button id="exportCacheStatsBtn" class="btn-secondary">Export Stats</button>
      </div>
    `;
    extensionsContent.appendChild(cacheSection);
    
    // Set up cache management functions
    function updateCacheStats() {
      try {
        const stats = browserCache.getStats();
        document.getElementById('cacheSize').textContent = stats.currentSize;
        document.getElementById('cacheItems').textContent = `${stats.itemCount} / ${stats.maxItems}`;
        document.getElementById('cacheHitRate').textContent = stats.hitRate;
        document.getElementById('cacheUtilization').textContent = stats.utilization;
      } catch (e) {
        console.error('Error updating cache stats:', e);
      }
    }
    
    // Update cache stats initially and every 5 seconds
    updateCacheStats();
    setInterval(updateCacheStats, 5000);
    
    // Load current cache settings
    const currentSettings = browserCache.settings;
    document.getElementById('maxCacheSize').value = Math.round(currentSettings.maxSize / (1024 * 1024));
    document.getElementById('autoCleanupEnabled').checked = currentSettings.enableAutoCleanup;
    
    // Clear page cache
    document.getElementById('clearPageCacheBtn').addEventListener('click', () => {
      const cleared = browserCache.clearByType(CACHE_TYPES.PAGE_CONTENT);
      alert(`Cleared ${cleared} page cache items.`);
      updateCacheStats();
    });
    
    // Clear API cache
    document.getElementById('clearApiCacheBtn').addEventListener('click', () => {
      const apiCleared = browserCache.clearByType(CACHE_TYPES.API_RESPONSE);
      const aiCleared = browserCache.clearByType(CACHE_TYPES.AI_ANALYSIS);
      alert(`Cleared ${apiCleared + aiCleared} API and AI cache items.`);
      updateCacheStats();
    });
    
    // Clear all cache
    document.getElementById('clearAllCacheBtn').addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all cache? This will slow down page loading and AI analysis until cache is rebuilt.')) {
        const cleared = browserCache.clearAll();
        alert(`Cleared all ${cleared} cache items.`);
        updateCacheStats();
      }
    });
    
    // Save cache settings
    document.getElementById('saveCacheSettingsBtn').addEventListener('click', () => {
      const maxSizeMB = parseInt(document.getElementById('maxCacheSize').value);
      const autoCleanup = document.getElementById('autoCleanupEnabled').checked;
      
      if (maxSizeMB >= 10 && maxSizeMB <= 500) {
        browserCache.updateSettings({
          maxSize: maxSizeMB * 1024 * 1024,
          enableAutoCleanup: autoCleanup
        });
        alert('Cache settings saved successfully.');
        updateCacheStats();
      } else {
        alert('Please enter a valid cache size between 10 and 500 MB.');
      }
    });
    
    // Cleanup expired items
    document.getElementById('cleanupExpiredBtn').addEventListener('click', () => {
      const result = browserCache.cleanup();
      alert(`Cleaned up ${result.cleaned} expired items, freed ${browserCache.formatSize(result.freedSize)}.`);
      updateCacheStats();
    });
    
    // Export cache statistics
    document.getElementById('exportCacheStatsBtn').addEventListener('click', () => {
      try {
        const stats = browserCache.getStats();
        const detailedStats = {
          ...stats,
          timestamp: new Date().toISOString(),
          cacheTypes: Object.values(CACHE_TYPES),
          settings: browserCache.settings
        };
        
        const blob = new Blob([JSON.stringify(detailedStats, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cache_stats_export.json';
        a.click();
        
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Error exporting cache stats:', e);
        alert('Error exporting cache stats: ' + e.message);
      }
    });
  }
}

// Update agent controls to include model selection
function setupAgentControls() {
  const agentControls = document.querySelector('.agent-controls');
  if (agentControls) {
    // Clear existing controls
    agentControls.innerHTML = '';
    
    // Create a clean, modern row for the controls
    const controlsRow = document.createElement('div');
    controlsRow.className = 'controls-row';
    
    // Create model selector without label, with an elegant dropdown
    const modelSelector = document.createElement('select');
    modelSelector.id = 'modelSelector';
    // Removed modern-selector class to avoid style conflicts
    modelSelector.innerHTML = `
      <option value="anthropic">Claude (Anthropic)</option>
      <option value="openai">GPT-4 (OpenAI)</option>
      <option value="perplexity">Perplexity</option>
      <option value="chutes">Chutes</option>
    `;
    controlsRow.appendChild(modelSelector);
    
    // Add Analyze button with a more modern design
    const analyzeButton = document.createElement('button');
    analyzeButton.id = 'runAgentBtn';
    analyzeButton.className = 'primary-btn';
    analyzeButton.innerHTML = `<span class="btn-icon">↻</span>Analyze Page`;
    analyzeButton.addEventListener('click', executeAgent);
    controlsRow.appendChild(analyzeButton);
    
    // Add the controls row to the agent controls
    agentControls.appendChild(controlsRow);
    
    // Add auto-summarize toggle below the controls
    const autoSummarizeContainer = document.createElement('div');
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
        autoSummarizeEnabled = e.target.checked;
        console.log('Auto-summarize set to:', e.target.checked);
      });
    }
  }
  
  // Create a chat container for messages with improved styling
  const agentResults = document.getElementById('agentResults');
  if (agentResults) {
    // Clear existing content
    agentResults.innerHTML = '';
    
    // Add a more engaging welcome message
    const welcomeContainer = document.createElement('div');
    welcomeContainer.className = 'welcome-container';
    welcomeContainer.innerHTML = `
      <div class="welcome-icon">🔍</div>
      <h3>AI Browser Assistant</h3>
      <p>Click "Analyze Page" to summarize the current page or get insights about its content.</p>
      <p>You can also select text on any webpage and add it to this chat.</p>
    `;
    agentResults.appendChild(welcomeContainer);
    
    // Add chat container with improved styling
    const chatContainer = document.createElement('div');
    chatContainer.id = 'chatContainer';
    chatContainer.className = 'chat-container';
    agentResults.appendChild(chatContainer);
    
    // Add a more modern input area for questions
    const chatInputArea = document.createElement('div');
    chatInputArea.className = 'chat-input-area';
    chatInputArea.innerHTML = `
      <input type="text" id="chatInput" placeholder="Ask a follow-up question..." />
      <button id="sendMessageBtn" class="chat-send-btn">Send</button>
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
  
  // Skip empty content
  if (!content || content.trim() === '') return;
  
  // Skip empty context messages (those with no memory items)
  if (role === 'context' && (!content.includes('memory-item') || content.includes('memory-list"></ul>'))) {
    console.log('Skipping empty context message');
    return;
  }
  
  const messageDiv = document.createElement('div');
  
  if (role === 'context') {
    // Special handling for context messages
    messageDiv.className = 'chat-message context-message';
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    messageDiv.dataset.role = 'context';
  } else if (role === 'user') {
    // User message is simple
    messageDiv.className = 'chat-message user-message';
    messageDiv.innerHTML = `<div class="message-content">${content}</div>`;
    messageDiv.dataset.role = 'user';
    messageDiv.dataset.timestamp = new Date().toISOString();
  } else if (role === 'assistant') {
    // Assistant message can include timing info
    messageDiv.className = 'chat-message assistant-message';
    messageDiv.dataset.role = 'assistant';
    messageDiv.dataset.timestamp = new Date().toISOString();
    
    // Check if content contains only a loading indicator
    const isLoading = content.includes('class="loading"') && !content.replace(/<div class="loading">.*?<\/div>/g, '').trim();
    
    if (timing && !isLoading) {
      // Check if this is cached data by looking for cache info in the chat container
      let displayTime = timing;
      let cacheText = '';
      let isCached = false;
      
      // Check if cache info was stored in the chat container dataset
      if (chatContainer.dataset.cacheInfo) {
        isCached = true;
        cacheText = ` (retrieved from cache - ${chatContainer.dataset.cacheInfo})`;
        displayTime = timing; // displayTiming is already 0.01 if cached
        // Clear the cache info after using it
        delete chatContainer.dataset.cacheInfo;
      }
      
      messageDiv.innerHTML = `
        <div class="timing-info">
          <span>Summary generated in</span>
          <span class="time-value">${displayTime.toFixed(2)}s</span>
          <span>using ${getModelName()}</span>
          ${cacheText}
        </div>
        <div class="message-content">${content}</div>
      `;
      messageDiv.dataset.genTime = displayTime.toFixed(2);
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
    
    // Get the active webview to potentially extract page content
    const activeWebview = document.querySelector('webview.active');
    if (!activeWebview) {
      addMessageToChat('assistant', 'No active webview found.');
      return;
    }
    
    // Get current URL for context
    const currentUrl = activeWebview.src || '';
    
    // Check cache first for this specific question
    const normalizedQuestion = question.toLowerCase().trim();
    const cachedResult = CacheHelpers.getCachedAIAnalysis(currentUrl, normalizedQuestion);
    
    if (cachedResult && Date.now() - cachedResult.timestamp < 30 * 60 * 1000) { // 30 minutes cache
      console.log('Using cached answer for question:', normalizedQuestion);
      
      // Clear loading indicators
      const loadingMessages = document.querySelectorAll('.loading');
      loadingMessages.forEach(message => {
        const parentMessage = message.closest('.chat-message');
        if (parentMessage) {
          parentMessage.remove();
        }
      });
      
      // Display cached results with cache indicator
      const cachedData = {
        ...cachedResult.result,
        cached: true,
        cacheTime: cachedResult.timestamp
      };

      displayAgentResults(cachedData);
      return;
    }
    
    // Note: We don't need to add the user's question to the chat again here
    // as it's already been added by the chat input handler
    
    try {
      // Detect if the question is about links, navigation, or UI elements
      const isAboutLinks = question.toLowerCase().match(/link|url|href|click|button|navigation|menu|download|sidebar|layout/);
      
      // Initialize conversation history array
      let conversationHistory = [];
      
      // Attempt to get the page content from the active webview
      // Pass extraction options based on the question type
      const extractionOptions = {
        includeHtml: isAboutLinks ? true : false,
        preserveLinks: isAboutLinks ? true : false,
        detectContentType: true // Let the function also try to auto-detect
      };
      
      console.log('Extraction options:', extractionOptions);
      const pageContent = await extractPageContent(activeWebview, extractionOptions);
      console.log("Extracted page content:", pageContent);
      
      // Look for any existing messages to provide as context
      const chatContainer = document.getElementById('chatContainer');
      
      if (chatContainer) {
        const messages = chatContainer.querySelectorAll('.chat-message');
        messages.forEach(message => {
          // Skip context messages and loading indicators
          if (message.classList.contains('context-message') || message.querySelector('.loading')) {
            return;
          }
          
          const role = message.classList.contains('user-message') ? 'user' : 'assistant';
          const contentEl = message.querySelector('.message-content');
          let content = '';
          
          if (contentEl) {
            // Use textContent to avoid HTML tags
            content = contentEl.textContent || '';
          }
          
          if (content && content.trim() && !content.includes('Processing your question...')) {
            conversationHistory.push({ role, content });
          }
        });
      }
      
      // Retrieve relevant memories for this context - safely
      try {
        const relevantMemories = getRelevantMemories(currentUrl, question, 3);
        console.log('Retrieved relevant memories:', relevantMemories);
        
        // If we found relevant memories, add them to the conversation history
        if (relevantMemories && relevantMemories.length > 0) {
          // Add a separator for memories
          conversationHistory.push({
            role: 'assistant',
            content: 'Here are some relevant items from previous conversations that may help:',
            isMemory: true
          });
          
          // Add each memory with enhanced source information
          relevantMemories.forEach(memory => {
            // Skip invalid memories
            if (!memory) return;
            
            try {
              // Detect likely topic of this memory based on content
              const detectedTopic = extractTopic({
                title: memory.title || '',
                question: memory.question || '',
                answer: memory.answer || '',
                contentSnippet: memory.contentSnippet || '',
                domain: memory.domain || ''
              });
              
              if (memory.question) {
                conversationHistory.push({
                  role: 'user',
                  content: memory.question,
                  isMemory: true,
                  source: {
                    domain: memory.domain || '',
                    url: memory.url || '',
                    title: memory.title || '',
                    timestamp: memory.timestamp || Date.now(),
                    topic: detectedTopic
                  }
                });
              }
              
              if (memory.answer) {
                conversationHistory.push({
                  role: 'assistant',
                  content: memory.answer,
                  isMemory: true,
                  source: {
                    domain: memory.domain || '',
                    url: memory.url || '',
                    title: memory.title || '',
                    timestamp: memory.timestamp || Date.now(),
                    topic: detectedTopic
                  }
                });
              }
            } catch (memoryError) {
              console.error('Error processing memory:', memoryError);
              // Continue with other memories
            }
          });
          
          // Add a separator after memories
          conversationHistory.push({
            role: 'assistant',
            content: 'Now addressing your current question:',
            isMemory: true
          });
        }
      } catch (memoryError) {
        console.error('Error retrieving or processing memories:', memoryError);
        // Continue without memories
      }
      
      // For questions, enhance the prompt to clearly indicate it's a question and instruct not to include source citations in the answer
      const enhancedQuery = `DIRECT QUESTION: ${question}\n\nPlease provide a direct answer to this specific question using the available context. Do not include source information or citations in your answer text - these will be displayed separately in a dedicated sources section.`;
      console.log('Enhanced query for follow-up question:', enhancedQuery);
      
      // Update agentParams with our enhanced query
      const agentParams = {
        query: enhancedQuery,
        originalQuery: question, // Keep the original question for reference
        pageContent: pageContent,
        isDirectPage: true,
        isQuestion: true, // Always set to true for questions
        isFollowUp: true,
        isAboutLinks: isAboutLinks, // Tell the agent if this is about links
        conversationHistory: conversationHistory,
        modelInfo: {
          provider,
          apiKey,
          isQuestion: true // Also include in modelInfo for backward compatibility
        }
      };
      
      // Set up the topic agent execution
      const agentPath = path.join(__dirname, 'agents', 'topic_agent.py');
      
      console.log(`Executing topic agent with question: ${question}`);
      console.log(`Agent params:`, JSON.stringify(agentParams, (key, value) => 
        key === 'apiKey' ? '[REDACTED]' : value));
      
      // Execute the agent
      const result = await ipcRenderer.invoke('execute-agent', {
        agentPath,
        agentParams
      });
      
      if (result.success === false) {
        addMessageToChat('assistant', `Error: ${result.error || 'Unknown error'}`);
        return;
      }
      
      // Display the results
      displayAgentResults(result.data);
      
      // Cache the follow-up question result for future use
      if (result.data) {
        CacheHelpers.cacheAIAnalysis(currentUrl, normalizedQuestion, result.data, provider);
        console.log('Cached follow-up question result for future use');
      }
      
    } catch (error) {
      console.error('Error processing question:', error);
      addMessageToChat('assistant', `Error processing your question: ${error.message}`);
    }
  } catch (error) {
    console.error('Error in processFollowupQuestion:', error);
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
    console.log('Setting up enhanced selection handler for webview:', webview.id);
    
    // Multiple injection strategies for better compatibility
    const attemptInjection = (attempt = 1) => {
      try {
        // Check if webview is still valid
        if (!webview || (webview.isDestroyed && webview.isDestroyed())) {
          console.log('Webview was destroyed, skipping injection');
          return;
        }
        
        console.log(`Injection attempt ${attempt} for webview:`, webview.id);
        
        // Enhanced script with better compatibility
        const injectionScript = `
          (function() {
            // Prevent multiple injections
            if (window.__browzerSelectionHandler) {
              console.log('Selection handler already installed');
              return;
            }
            
            console.log('Installing Browzer selection handler...');
            window.__browzerSelectionHandler = true;
            
            // Create and style the add to chat button
            let addToChatBtn = null;
            let selectionTimeout = null;
            
            function createAddToChatButton(selectedText, rect) {
              try {
                // Remove any existing button
                hideAddToChatButton();
                
                // Create new button with enhanced styling
                addToChatBtn = document.createElement('button');
                addToChatBtn.textContent = 'Add to Chat';
                addToChatBtn.setAttribute('data-browzer-button', 'true');
                
                // Apply styles directly to avoid CSP issues
                const styles = {
                  position: 'fixed',
                  zIndex: '2147483647', // Maximum z-index
                  padding: '8px 14px',
                  background: '#1a73e8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  userSelect: 'none',
                  pointerEvents: 'auto',
                  outline: 'none',
                  textDecoration: 'none'
                };
                
                Object.assign(addToChatBtn.style, styles);
                
                // Position button near selection with better boundary checking
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const scrollY = window.pageYOffset || document.documentElement.scrollTop;
                const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                
                let buttonTop = Math.max(10, rect.top + scrollY - 45);
                let buttonLeft = Math.min(viewportWidth - 130, Math.max(10, rect.left + scrollX));
                
                // Keep button in viewport
                if (buttonTop + 40 > viewportHeight + scrollY) {
                  buttonTop = rect.bottom + scrollY + 5;
                }
                
                addToChatBtn.style.top = buttonTop + 'px';
                addToChatBtn.style.left = buttonLeft + 'px';
                
                // Enhanced interaction handlers
                addToChatBtn.addEventListener('mouseenter', function() {
                  this.style.background = '#1765cc';
                  this.style.transform = 'translateY(-2px)';
                  this.style.boxShadow = '0 6px 12px rgba(0,0,0,0.25)';
                });
                
                addToChatBtn.addEventListener('mouseleave', function() {
                  this.style.background = '#1a73e8';
                  this.style.transform = 'translateY(0)';
                  this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                });
                
                // Click handler with multiple message strategies
                addToChatBtn.addEventListener('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  console.log('Add to Chat clicked, sending text:', selectedText.substring(0, 50));
                  
                  // Try multiple communication methods
                  let messageSent = false;
                  
                  // Method 1: IPC (for Electron webviews)
                  try {
                    if (typeof require !== 'undefined') {
                      const { ipcRenderer } = require('electron');
                      if (ipcRenderer && ipcRenderer.sendToHost) {
                        ipcRenderer.sendToHost('add-to-chat', selectedText);
                        messageSent = true;
                        console.log('Message sent via IPC');
                      }
                    }
                  } catch (err) {
                    console.log('IPC method failed:', err.message);
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
                  
                  // Method 4: Custom event
                  if (!messageSent) {
                    try {
                      const customEvent = new CustomEvent('browzer-add-to-chat', {
                        detail: { text: selectedText },
                        bubbles: true
                      });
                      document.dispatchEvent(customEvent);
                      console.log('Message sent via custom event');
                    } catch (err) {
                      console.log('Custom event failed:', err.message);
                    }
                  }
                  
                  // Remove button and clear selection
                  hideAddToChatButton();
                  try {
                    window.getSelection().removeAllRanges();
                  } catch (e) {}
                });
                
                // Add to page with error handling
                try {
                  document.body.appendChild(addToChatBtn);
                  console.log('Add to Chat button created and positioned');
                } catch (err) {
                  console.error('Failed to add button to page:', err);
                  return;
                }
                
                // Auto-hide after 7 seconds
                setTimeout(hideAddToChatButton, 7000);
                
              } catch (err) {
                console.error('Error creating Add to Chat button:', err);
              }
            }
            
            function hideAddToChatButton() {
              if (addToChatBtn && addToChatBtn.parentNode) {
                try {
                  addToChatBtn.parentNode.removeChild(addToChatBtn);
                } catch (e) {}
              }
              addToChatBtn = null;
            }
            
            // Enhanced selection detection
            function checkSelection() {
              try {
                const selection = window.getSelection();
                const text = selection.toString().trim();
                
                if (text && text.length >= 3) { // Lower threshold for better UX
                  console.log('Text selected for add to chat:', text.substring(0, 30) + '...');
                  
                  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
                  if (range) {
                    const rect = range.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      createAddToChatButton(text, rect);
                      return;
                    }
                  }
                }
                
                hideAddToChatButton();
              } catch (e) {
                console.error('Error in selection check:', e);
              }
            }
            
            // Multiple event listeners for better compatibility
            
            // Primary selection detection
            document.addEventListener('mouseup', function(e) {
              // Small delay to ensure selection is complete
              clearTimeout(selectionTimeout);
              selectionTimeout = setTimeout(checkSelection, 100);
            }, true);
            
            // Additional selection events
            document.addEventListener('selectionchange', function() {
              clearTimeout(selectionTimeout);
              selectionTimeout = setTimeout(checkSelection, 150);
            });
            
            // Touch support for mobile
            document.addEventListener('touchend', function(e) {
              clearTimeout(selectionTimeout);
              selectionTimeout = setTimeout(checkSelection, 200);
            });
            
            // Hide button on click elsewhere
            document.addEventListener('mousedown', function(e) {
              if (addToChatBtn && !addToChatBtn.contains(e.target)) {
                hideAddToChatButton();
              }
            }, true);
            
            // Enhanced keyboard shortcuts
            document.addEventListener('keydown', function(e) {
              // Ctrl+Shift+A or Cmd+Shift+A
              if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                const selection = window.getSelection();
                const text = selection.toString().trim();
                
                if (text) {
                  // Direct send without button
                  try {
                    window.parent.postMessage({
                      type: 'add-to-chat',
                      text: text,
                      source: 'browzer-keyboard'
                    }, '*');
                    console.log('Text sent via keyboard shortcut');
                    
                    // Visual feedback
                    const flash = document.createElement('div');
                    flash.textContent = '✓ Added to chat';
                    flash.style.cssText = \`
                      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
                      background: #4caf50; color: white; padding: 8px 16px;
                      border-radius: 4px; font-size: 14px; opacity: 0;
                      transition: opacity 0.3s;
                    \`;
                    document.body.appendChild(flash);
                    
                    setTimeout(() => flash.style.opacity = '1', 10);
                    setTimeout(() => {
                      flash.style.opacity = '0';
                      setTimeout(() => flash.remove(), 300);
                    }, 2000);
                    
                  } catch (err) {
                    console.log('Keyboard shortcut failed:', err);
                  }
                }
              }
              
              // Escape to hide button
              if (e.key === 'Escape') {
                hideAddToChatButton();
              }
            });
            
            console.log('✓ Browzer selection handler installed successfully');
            console.log('- Select text to see Add to Chat button');
            console.log('- Use Ctrl+Shift+A (or Cmd+Shift+A) for quick add');
            
            // Test injection success
            window.__browzerHandlerActive = true;
            
          })();
        `;
        
        // Execute the enhanced script
        webview.executeJavaScript(injectionScript, false)
          .then(() => {
            console.log(`✓ Selection handler injection successful (attempt ${attempt})`);
            
            // Verify injection worked
            setTimeout(() => {
              webview.executeJavaScript('window.__browzerHandlerActive === true', false)
                .then(result => {
                  if (result) {
                    console.log('✓ Selection handler verified as active');
                  } else {
                    console.log('Selection handler verification failed, trying again...');
                    if (attempt < 3) {
                      setTimeout(() => attemptInjection(attempt + 1), 2000);
                    }
                  }
                })
                .catch(() => {
                  if (attempt < 3) {
                    setTimeout(() => attemptInjection(attempt + 1), 2000);
                  }
                });
            }, 1000);
          })
          .catch(err => {
            console.log(`Injection attempt ${attempt} failed:`, err.message);
            
            // Retry with different timing
            if (attempt < 4) {
              const delay = attempt * 1000; // Increasing delay
              setTimeout(() => attemptInjection(attempt + 1), delay);
            }
          });
          
      } catch (err) {
        console.log(`Error in injection attempt ${attempt}:`, err.message);
        if (attempt < 3) {
          setTimeout(() => attemptInjection(attempt + 1), 1500);
        }
      }
    };
    
    // Start injection process
    const startInjection = () => {
      // Immediate attempt
      attemptInjection(1);
      
      // Also try after page events
      const tryAfterEvent = (eventName, delay = 500) => {
        webview.addEventListener(eventName, () => {
          setTimeout(() => attemptInjection(1), delay);
        }, { once: true });
      };
      
      tryAfterEvent('did-finish-load', 800);
      tryAfterEvent('dom-ready', 600);
    };
    
    // Check if webview is already loaded
    try {
      if (webview.isLoading && typeof webview.isLoading === 'function' && !webview.isLoading()) {
        // Already loaded, inject immediately
        startInjection();
      } else {
        // Wait for load
        webview.addEventListener('did-finish-load', startInjection, { once: true });
      }
    } catch (e) {
      // Fallback: just try injection
      startInjection();
    }
    
  } catch (err) {
    console.log('Error setting up selection handler:', err.message);
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


function trackPageVisit(url, title) {
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
    history = history.filter(item => item.url !== url);
    
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

// Set up message listener for history page navigation
window.addEventListener('message', function(event) {
  console.log('Received message from history page:', event.data);
  
  if (event.data && event.data.type === 'navigate-to' && event.data.url) {
    const webview = getActiveWebview();
    if (webview) {
      webview.loadURL(event.data.url);
    }
  }
  
  // Handle add-to-chat messages (existing functionality)
  if (event.data && event.data.type === 'add-to-chat') {
    console.log('Received add-to-chat message via postMessage:', event.data.text);
    addSelectedTextToChat(event.data.text);
  }
  
  // Handle clear history message
  if (event.data && event.data.type === 'clear-history') {
    console.log('Received clear-history message from history page');
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
      console.log('History cleared successfully');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }
  
  // Handle delete history item message
  if (event.data && event.data.type === 'delete-history-item' && event.data.itemId) {
    console.log('Received delete-history-item message for ID:', event.data.itemId);
    try {
      let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
      history = history.filter(item => item.id !== event.data.itemId);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
      console.log('History item deleted successfully');
    } catch (error) {
      console.error('Error deleting history item:', error);
              }
            }
          });
          
function showHistoryPage() {
  console.log('=== SHOW HISTORY PAGE CALLED ===');
  
  try {
    const webview = getActiveWebview();
    console.log('Active webview found:', !!webview);
    
    if (webview) {
      // Use simple file:// URL directly - no custom protocol
      const historyURL = `file://${require('path').join(process.cwd(), 'history.html')}`;
      console.log('Loading history URL:', historyURL);
      
      // Set up event listener to inject history data when page loads
      const historyLoadHandler = () => {
        console.log('History page loaded, injecting data...');
        
        // Get history data from localStorage
        try {
          const historyData = localStorage.getItem(HISTORY_STORAGE_KEY) || '[]';
          const parsedHistory = JSON.parse(historyData);
          console.log('Injecting history data:', parsedHistory.length, 'items');
          
          // Inject the history data into the page
        webview.executeJavaScript(`
            if (window.receiveHistoryData) {
              window.receiveHistoryData(${historyData});
            } else {
              // If function not ready yet, store for later
              window.__pendingHistoryData = ${historyData};
              
              // Try again in a moment
              setTimeout(() => {
                if (window.receiveHistoryData && window.__pendingHistoryData) {
                  window.receiveHistoryData(window.__pendingHistoryData);
                  delete window.__pendingHistoryData;
                }
              }, 500);
            }
          `).then(() => {
            console.log('History data injected successfully');
          }).catch(err => {
            console.error('Error injecting history data:', err);
          });
          
        } catch (error) {
          console.error('Error preparing history data:', error);
        }
        
        // Remove the event listener
        webview.removeEventListener('did-finish-load', historyLoadHandler);
      };
      
      // Add the event listener
      webview.addEventListener('did-finish-load', historyLoadHandler);
      
      // Load the URL
      webview.loadURL(historyURL);
      console.log('History URL loaded successfully');
      
    } else {
      console.log('No active webview, creating new tab...');
      const historyURL = `file://${require('path').join(process.cwd(), 'history.html')}`;
      const newTabId = createNewTab(historyURL);
      console.log('New history tab created:', newTabId);
    }
  } catch (error) {
    console.error('Error in showHistoryPage:', error);
    alert('Error opening history page: ' + error.message);
  }
}

function deleteHistoryItemLocal(itemId, modal) {
  try {
    let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    history = history.filter(item => item.id !== itemId);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    
    // Refresh the modal
    modal.remove();
    showHistoryPage();
  } catch (error) {
    console.error('Error deleting history item:', error);
    alert('Error deleting history item');
  }
}

// Add the missing Add to Chat button functions
let addToChatButton = null;

function showAddToChatButton(webview, selectedText, rect) {
  try {
    console.log('Showing add to chat button for selected text:', selectedText.substring(0, 50) + '...');
    
    // Remove any existing button first
    hideAddToChatButton();
    
    // Create the button
    addToChatButton = document.createElement('button');
    addToChatButton.className = 'add-to-chat-button';
    addToChatButton.textContent = 'Add to Chat';
    addToChatButton.style.position = 'fixed';
    addToChatButton.style.zIndex = '10000';
    
    // Position the button near the selection (with some offset)
    const webviewRect = webview.getBoundingClientRect();
    const buttonTop = Math.max(10, webviewRect.top + rect.top - 40);
    const buttonLeft = Math.min(window.innerWidth - 120, webviewRect.left + rect.left);
    
    addToChatButton.style.top = buttonTop + 'px';
    addToChatButton.style.left = buttonLeft + 'px';
    
    // Add click handler
    addToChatButton.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      addSelectedTextToChat(selectedText);
      hideAddToChatButton();
    };
    
    // Add the button to the DOM
    document.body.appendChild(addToChatButton);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      hideAddToChatButton();
    }, 5000);
    
  } catch (error) {
    console.error('Error showing add to chat button:', error);
  }
}

function hideAddToChatButton() {
  try {
    if (addToChatButton && addToChatButton.parentNode) {
      addToChatButton.parentNode.removeChild(addToChatButton);
    }
    addToChatButton = null;
  } catch (error) {
    console.error('Error hiding add to chat button:', error);
  }
}

function deleteHistoryItemLocal(itemId, modal) {
  try {
    let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    history = history.filter(item => item.id !== itemId);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    
    // Refresh the modal
    modal.remove();
    showHistoryPage();
  } catch (error) {
    console.error('Error deleting history item:', error);
    alert('Error deleting history item');
  }
}
 

