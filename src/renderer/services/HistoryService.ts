import { HistoryItem } from '../../shared/types';

export class HistoryService {
  private readonly HISTORY_STORAGE_KEY = 'browser_history';
  private history: HistoryItem[] = [];

  constructor() {
    this.loadHistory();
  }

  private loadHistory(): void {
    try {
      const historyData = localStorage.getItem(this.HISTORY_STORAGE_KEY);
      if (historyData) {
        this.history = JSON.parse(historyData);
        console.log(`Loaded ${this.history.length} history items`);
      }
    } catch (error) {
      console.error('Error loading history:', error);
      this.history = [];
    }
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(this.HISTORY_STORAGE_KEY, JSON.stringify(this.history));
    } catch (error) {
      console.error('Error saving history:', error);
    }
  }

  addVisit(url: string, title: string, favicon?: string): void {
    if (!url || url === 'about:blank' || url.startsWith('file://')) {
      return;
    }

    try {
      const now = Date.now();
      const id = `${url}_${now}`;

      // Check if this URL was visited recently (within 30 seconds)
      const recentVisit = this.history.find(item => 
        item.url === url && (now - item.visitTime) < 30000
      );

      if (recentVisit) {
        // Update the recent visit instead of creating a new entry
        recentVisit.visitTime = now;
        recentVisit.title = title;
        if (favicon) {
          recentVisit.favicon = favicon;
        }
      } else {
        // Add new history item
        const historyItem: HistoryItem = {
          id,
          url,
          title: title || url,
          visitTime: now,
          favicon
        };

        // Add to beginning of array (most recent first)
        this.history.unshift(historyItem);

        // Limit history to 10,000 items
        if (this.history.length > 10000) {
          this.history = this.history.slice(0, 10000);
        }
      }

      this.saveHistory();
      console.log('Added history item:', { url, title });
    } catch (error) {
      console.error('Error adding history item:', error);
    }
  }

  getHistory(limit?: number): HistoryItem[] {
    const sortedHistory = [...this.history].sort((a, b) => b.visitTime - a.visitTime);
    return limit ? sortedHistory.slice(0, limit) : sortedHistory;
  }

  searchHistory(query: string, limit: number = 50): HistoryItem[] {
    if (!query.trim()) {
      return this.getHistory(limit);
    }

    const searchTerm = query.toLowerCase();
    const matches = this.history.filter(item => 
      item.title.toLowerCase().includes(searchTerm) ||
      item.url.toLowerCase().includes(searchTerm)
    );

    return matches.sort((a, b) => b.visitTime - a.visitTime).slice(0, limit);
  }

  deleteHistoryItem(itemId: string): boolean {
    try {
      const index = this.history.findIndex(item => item.id === itemId);
      if (index !== -1) {
        this.history.splice(index, 1);
        this.saveHistory();
        console.log('Deleted history item:', itemId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting history item:', error);
      return false;
    }
  }

  clearHistory(): void {
    try {
      this.history = [];
      this.saveHistory();
      console.log('History cleared');
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }

  clearHistoryOlderThan(days: number): number {
    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      const originalLength = this.history.length;
      
      this.history = this.history.filter(item => item.visitTime > cutoffTime);
      
      const deletedCount = originalLength - this.history.length;
      if (deletedCount > 0) {
        this.saveHistory();
        console.log(`Cleared ${deletedCount} history items older than ${days} days`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Error clearing old history:', error);
      return 0;
    }
  }

  getHistoryByDomain(domain: string): HistoryItem[] {
    try {
      return this.history.filter(item => {
        try {
          const itemDomain = new URL(item.url).hostname;
          return itemDomain === domain;
        } catch {
          return false;
        }
      }).sort((a, b) => b.visitTime - a.visitTime);
    } catch (error) {
      console.error('Error getting history by domain:', error);
      return [];
    }
  }

  getTopDomains(limit: number = 10): Array<{ domain: string; count: number; lastVisit: number }> {
    try {
      const domainCounts = new Map<string, { count: number; lastVisit: number }>();

      this.history.forEach(item => {
        try {
          const domain = new URL(item.url).hostname;
          const existing = domainCounts.get(domain);
          
          if (existing) {
            existing.count++;
            existing.lastVisit = Math.max(existing.lastVisit, item.visitTime);
          } else {
            domainCounts.set(domain, { count: 1, lastVisit: item.visitTime });
          }
        } catch {
          // Skip invalid URLs
        }
      });

      return Array.from(domainCounts.entries())
        .map(([domain, data]) => ({ domain, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting top domains:', error);
      return [];
    }
  }

  getHistoryStats(): {
    totalItems: number;
    todayItems: number;
    weekItems: number;
    monthItems: number;
    oldestVisit: number | null;
    newestVisit: number | null;
  } {
    try {
      const now = Date.now();
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);

      const todayItems = this.history.filter(item => item.visitTime > oneDayAgo).length;
      const weekItems = this.history.filter(item => item.visitTime > oneWeekAgo).length;
      const monthItems = this.history.filter(item => item.visitTime > oneMonthAgo).length;

      const visitTimes = this.history.map(item => item.visitTime);
      const oldestVisit = visitTimes.length > 0 ? Math.min(...visitTimes) : null;
      const newestVisit = visitTimes.length > 0 ? Math.max(...visitTimes) : null;

      return {
        totalItems: this.history.length,
        todayItems,
        weekItems,
        monthItems,
        oldestVisit,
        newestVisit
      };
    } catch (error) {
      console.error('Error getting history stats:', error);
      return {
        totalItems: 0,
        todayItems: 0,
        weekItems: 0,
        monthItems: 0,
        oldestVisit: null,
        newestVisit: null
      };
    }
  }

  exportHistory(): string {
    try {
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        history: this.history
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting history:', error);
      return '';
    }
  }

  importHistory(jsonData: string): boolean {
    try {
      const importData = JSON.parse(jsonData);
      
      if (importData.history && Array.isArray(importData.history)) {
        // Merge with existing history, avoiding duplicates
        const existingUrls = new Set(this.history.map(item => item.url));
        
        const newItems = importData.history.filter((item: HistoryItem) => 
          !existingUrls.has(item.url)
        );

        this.history = [...this.history, ...newItems];
        
        // Sort by visit time (newest first)
        this.history.sort((a, b) => b.visitTime - a.visitTime);
        
        this.saveHistory();
        console.log(`Imported ${newItems.length} new history items`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error importing history:', error);
      return false;
    }
  }
} 