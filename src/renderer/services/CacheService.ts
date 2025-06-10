import { CacheItem, CacheSettings, CACHE_TYPES, CacheType } from '../../shared/types';

// Default cache settings
const DEFAULT_CACHE_SETTINGS: CacheSettings = {
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

// Cache key constants
const CACHE_PREFIX = 'browser_cache_';
const CACHE_METADATA_KEY = 'cache_metadata';
const CACHE_SETTINGS_KEY = 'cache_settings';

export class CacheService {
  private settings: CacheSettings;
  private metadata: Record<string, any>;
  private stats: {
    hits: number;
    misses: number;
    writes: number;
    evictions: number;
  };

  constructor() {
    this.settings = this.loadSettings();
    this.metadata = this.loadMetadata();
    this.stats = {
      hits: 0,
      misses: 0,
      writes: 0,
      evictions: 0
    };
    
    if (this.settings.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  private loadSettings(): CacheSettings {
    try {
      const saved = localStorage.getItem(CACHE_SETTINGS_KEY);
      return saved ? { ...DEFAULT_CACHE_SETTINGS, ...JSON.parse(saved) } : DEFAULT_CACHE_SETTINGS;
    } catch (error) {
      console.error('Error loading cache settings:', error);
      return DEFAULT_CACHE_SETTINGS;
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(CACHE_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Error saving cache settings:', error);
    }
  }

  private loadMetadata(): Record<string, any> {
    try {
      const saved = localStorage.getItem(CACHE_METADATA_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Error loading cache metadata:', error);
      return {};
    }
  }

  private saveMetadata(): void {
    try {
      localStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(this.metadata));
    } catch (error) {
      console.error('Error saving cache metadata:', error);
    }
  }

  private generateKey(type: CacheType, identifier: string, params: Record<string, any> = {}): string {
    const paramString = Object.keys(params).length > 0 ? JSON.stringify(params) : '';
    const combined = `${type}:${identifier}:${paramString}`;
    
    if (combined.length > 100) {
      return `${CACHE_PREFIX}${this.simpleHash(combined)}`;
    }
    
    return `${CACHE_PREFIX}${combined}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private compress(data: any): any {
    if (!this.settings.enableCompression) return data;
    
    try {
      if (typeof data === 'object') {
        return JSON.stringify(data);
      }
      return data;
    } catch (error) {
      console.error('Error compressing data:', error);
      return data;
    }
  }

  private decompress(data: any, originalType: string): any {
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

  set(type: CacheType, identifier: string, data: any, customTTL?: number, params: Record<string, any> = {}): boolean {
    try {
      const key = this.generateKey(type, identifier, params);
      const ttl = customTTL || this.settings.typeTTLs[type] || this.settings.defaultTTL;
      const expiresAt = Date.now() + ttl;
      
      const originalType = typeof data;
      const compressedData = this.compress(data);
      
      const cacheItem: CacheItem = {
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

      this.ensureSpace(cacheItem.size);

      localStorage.setItem(key, JSON.stringify(cacheItem));
      
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

  get(type: CacheType, identifier: string, params: Record<string, any> = {}): any {
    try {
      const key = this.generateKey(type, identifier, params);
      const itemStr = localStorage.getItem(key);
      
      if (!itemStr) {
        this.stats.misses++;
        return null;
      }

      const item = JSON.parse(itemStr);
      
      if (Date.now() > item.expiresAt) {
        this.delete(type, identifier, params);
        this.stats.misses++;
        return null;
      }

      item.accessCount++;
      item.lastAccessed = Date.now();
      
      if (this.metadata[key]) {
        this.metadata[key].lastAccessed = item.lastAccessed;
      }
      
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

  delete(type: CacheType, identifier: string, params: Record<string, any> = {}): boolean {
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

  has(type: CacheType, identifier: string, params: Record<string, any> = {}): boolean {
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

  clearByType(type: CacheType): number {
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

  clearAll(): number {
    try {
      let cleared = 0;
      const keysToDelete = Object.keys(this.metadata);
      
      keysToDelete.forEach(key => {
        localStorage.removeItem(key);
        cleared++;
      });
      
      this.metadata = {};
      this.saveMetadata();
      
      this.stats = { hits: 0, misses: 0, writes: 0, evictions: 0 };
      
      console.log(`Cache cleared all ${cleared} items`);
      return cleared;
    } catch (error) {
      console.error('Error clearing all cache:', error);
      return 0;
    }
  }

  private ensureSpace(newItemSize: number): void {
    const currentSize = this.getCurrentSize();
    const totalItems = Object.keys(this.metadata).length;
    
    if (currentSize + newItemSize > this.settings.maxSize) {
      this.evictLRU(currentSize + newItemSize - this.settings.maxSize);
    }
    
    if (totalItems >= this.settings.maxItems) {
      this.evictLRU(0, totalItems - this.settings.maxItems + 1);
    }
  }

  private evictLRU(sizeToFree: number = 0, itemsToFree: number = 0): void {
    try {
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

  cleanup(): { cleaned: number; freedSize: number } {
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

  private startAutoCleanup(): void {
    setInterval(() => {
      this.cleanup();
    }, this.settings.cleanupInterval);
  }

  getCurrentSize(): number {
    return Object.values(this.metadata).reduce((sum: number, item: any) => sum + item.size, 0);
  }

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

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  updateSettings(newSettings: Partial<CacheSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }
} 