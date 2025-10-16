import Store from 'electron-store';
import { randomUUID } from 'crypto';
import { HistoryEntry, HistoryTransition, HistoryQuery, HistoryStats } from '../../shared/types';

/**
 * HistoryService
 * 
 * Manages browsing history similar to Chrome's history system.
 * Features:
 * - Track all page visits
 * - Search history
 * - Delete individual entries or all history
 * - Visit count tracking
 * - Domain-based grouping
 * - Time-based filtering
 */
export class HistoryService {
  private store: Store<{
    entries: Record<string, HistoryEntry>;
    urlToId: Record<string, string>; // URL -> Entry ID mapping for quick lookup
  }>;

  constructor() {
    this.store = new Store({
      name: 'history',
      defaults: {
        entries: {},
        urlToId: {},
      },
    });

    console.log('HistoryService initialized');
  }

  /**
   * Add or update a history entry
   */
  public async addEntry(
    url: string,
    title: string,
    transition: HistoryTransition = HistoryTransition.LINK,
    favicon?: string
  ): Promise<HistoryEntry | null> {
    // Skip internal pages
    if (url.startsWith('browzer://') || url.startsWith('chrome://') || url.startsWith('about:')) {
      return null;
    }

    const urlToId = this.store.get('urlToId', {});
    const entries = this.store.get('entries', {});
    const now = Date.now();

    // Check if URL already exists
    const existingId = urlToId[url];

    if (existingId && entries[existingId]) {
      // Update existing entry
      const entry = entries[existingId];
      entry.visitCount += 1;
      entry.lastVisitTime = now;
      entry.title = title || entry.title; // Update title if provided
      entry.favicon = favicon || entry.favicon;
      
      if (transition === HistoryTransition.TYPED) {
        entry.typedCount += 1;
      }

      entries[existingId] = entry;
      this.store.set('entries', entries);

      return entry;
    } else {
      // Create new entry
      const id = randomUUID();
      const entry: HistoryEntry = {
        id,
        url,
        title: title || url,
        visitTime: now,
        visitCount: 1,
        lastVisitTime: now,
        favicon,
        typedCount: transition === HistoryTransition.TYPED ? 1 : 0,
        transition,
      };

      entries[id] = entry;
      urlToId[url] = id;

      this.store.set('entries', entries);
      this.store.set('urlToId', urlToId);

      return entry;
    }
  }

  /**
   * Get all history entries
   */
  public async getAll(limit?: number): Promise<HistoryEntry[]> {
    const entries = this.store.get('entries', {});
    const allEntries = Object.values(entries);

    // Sort by last visit time (most recent first)
    allEntries.sort((a, b) => b.lastVisitTime - a.lastVisitTime);

    if (limit) {
      return allEntries.slice(0, limit);
    }

    return allEntries;
  }

  /**
   * Search history
   */
  public async search(query: HistoryQuery): Promise<HistoryEntry[]> {
    const entries = this.store.get('entries', {});
    let results = Object.values(entries);

    // Filter by text search
    if (query.text) {
      const searchText = query.text.toLowerCase();
      results = results.filter(
        (entry) =>
          entry.title.toLowerCase().includes(searchText) ||
          entry.url.toLowerCase().includes(searchText)
      );
    }

    // Filter by time range
    if (query.startTime !== undefined) {
      results = results.filter((entry) => entry.lastVisitTime >= query.startTime);
    }

    if (query.endTime !== undefined) {
      results = results.filter((entry) => entry.lastVisitTime <= query.endTime);
    }

    // Sort by last visit time (most recent first)
    results.sort((a, b) => b.lastVisitTime - a.lastVisitTime);

    // Limit results
    if (query.maxResults) {
      results = results.slice(0, query.maxResults);
    }

    return results;
  }

  /**
   * Get history for a specific date range
   */
  public async getByDateRange(startTime: number, endTime: number): Promise<HistoryEntry[]> {
    return this.search({ startTime, endTime });
  }

  /**
   * Get today's history
   */
  public async getToday(): Promise<HistoryEntry[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    return this.getByDateRange(startOfDay, endOfDay);
  }

  /**
   * Get history for the last N days
   */
  public async getLastNDays(days: number): Promise<HistoryEntry[]> {
    const now = Date.now();
    const startTime = now - days * 24 * 60 * 60 * 1000;

    return this.getByDateRange(startTime, now);
  }

  /**
   * Delete a specific history entry
   */
  public async deleteEntry(id: string): Promise<boolean> {
    const entries = this.store.get('entries', {});
    const urlToId = this.store.get('urlToId', {});

    const entry = entries[id];
    if (!entry) {
      return false;
    }

    // Remove from urlToId mapping
    delete urlToId[entry.url];

    // Remove entry
    delete entries[id];

    this.store.set('entries', entries);
    this.store.set('urlToId', urlToId);

    console.log(`Deleted history entry: ${entry.url}`);
    return true;
  }

  /**
   * Delete multiple entries by IDs
   */
  public async deleteEntries(ids: string[]): Promise<number> {
    let deletedCount = 0;

    for (const id of ids) {
      const success = await this.deleteEntry(id);
      if (success) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Delete history by URL
   */
  public async deleteByUrl(url: string): Promise<boolean> {
    const urlToId = this.store.get('urlToId', {});
    const id = urlToId[url];

    if (id) {
      return this.deleteEntry(id);
    }

    return false;
  }

  /**
   * Delete history by date range
   */
  public async deleteByDateRange(startTime: number, endTime: number): Promise<number> {
    const entries = await this.getByDateRange(startTime, endTime);
    const ids = entries.map((entry) => entry.id);

    return this.deleteEntries(ids);
  }

  /**
   * Clear all history
   */
  public async clearAll(): Promise<boolean> {
    this.store.set('entries', {});
    this.store.set('urlToId', {});

    console.log('Cleared all history');
    return true;
  }

  /**
   * Get history statistics
   */
  public async getStats(): Promise<HistoryStats> {
    const entries = this.store.get('entries', {});
    const allEntries = Object.values(entries);

    // Calculate total visits
    const totalVisits = allEntries.reduce((sum, entry) => sum + entry.visitCount, 0);

    // Calculate today's visits
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEntries = allEntries.filter((entry) => entry.lastVisitTime >= startOfDay);
    const todayVisits = todayEntries.reduce((sum, entry) => sum + entry.visitCount, 0);

    // Calculate week's visits
    const startOfWeek = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const weekEntries = allEntries.filter((entry) => entry.lastVisitTime >= startOfWeek);
    const weekVisits = weekEntries.reduce((sum, entry) => sum + entry.visitCount, 0);

    // Calculate top domains
    const domainCounts: Record<string, number> = {};
    allEntries.forEach((entry) => {
      try {
        const url = new URL(entry.url);
        const domain = url.hostname;
        domainCounts[domain] = (domainCounts[domain] || 0) + entry.visitCount;
      } catch (error) {
        // Skip invalid URLs
      }
    });

    const topDomains = Object.entries(domainCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalEntries: allEntries.length,
      totalVisits,
      topDomains,
      todayVisits,
      weekVisits,
    };
  }

  /**
   * Get most visited sites
   */
  public async getMostVisited(limit = 10): Promise<HistoryEntry[]> {
    const entries = this.store.get('entries', {});
    const allEntries = Object.values(entries);

    // Sort by visit count
    allEntries.sort((a, b) => b.visitCount - a.visitCount);

    return allEntries.slice(0, limit);
  }

  /**
   * Get recently visited sites (last 24 hours)
   */
  public async getRecentlyVisited(limit = 20): Promise<HistoryEntry[]> {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const entries = await this.getByDateRange(oneDayAgo, Date.now());

    return entries.slice(0, limit);
  }

  /**
   * Check if URL exists in history
   */
  public async hasUrl(url: string): Promise<boolean> {
    const urlToId = this.store.get('urlToId', {});
    return !!urlToId[url];
  }

  /**
   * Get entry by URL
   */
  public async getByUrl(url: string): Promise<HistoryEntry | null> {
    const urlToId = this.store.get('urlToId', {});
    const entries = this.store.get('entries', {});
    const id = urlToId[url];

    if (id && entries[id]) {
      return entries[id];
    }

    return null;
  }
}
