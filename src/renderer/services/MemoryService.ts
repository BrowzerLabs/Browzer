import { Memory } from '../../shared/types';
import { TextProcessing } from '../utils/textProcessing';
import { URLUtils } from '../utils/urlUtils';

export class MemoryService {
  private readonly MEMORY_STORAGE_KEY = 'browser_memories';
  private readonly MAX_MEMORIES = 1000;
  private memories: Memory[] = [];

  constructor() {
    this.loadMemories();
  }

  private loadMemories(): void {
    try {
      const memoriesData = localStorage.getItem(this.MEMORY_STORAGE_KEY);
      if (memoriesData) {
        this.memories = JSON.parse(memoriesData);
        console.log(`Loaded ${this.memories.length} memories`);
      }
    } catch (error) {
      console.error('Error loading memories:', error);
      this.memories = [];
    }
  }

  private saveMemories(): void {
    try {
      localStorage.setItem(this.MEMORY_STORAGE_KEY, JSON.stringify(this.memories));
    } catch (error) {
      console.error('Error saving memories:', error);
    }
  }

  storeMemory(url: string, question: string, answer: string, title: string = ''): void {
    try {
      const now = Date.now();
      const id = `memory_${now}_${Math.random().toString(36).substr(2, 9)}`;

      // Extract keywords and topic
      const keywords = TextProcessing.extractKeywords(question + ' ' + answer);
      const topic = TextProcessing.extractTopic({ question, answer, title });

      const memory: Memory = {
        id,
        url,
        question,
        answer,
        title,
        timestamp: now,
        keywords,
        topic
      };

      // Add to beginning of array (most recent first)
      this.memories.unshift(memory);

      // Limit memories and deduplicate
      this.memories = this.deduplicateMemories(this.memories);
      
      if (this.memories.length > this.MAX_MEMORIES) {
        this.memories = this.memories.slice(0, this.MAX_MEMORIES);
      }

      this.saveMemories();
      console.log('Stored memory:', { url, question: question.substring(0, 50), topic });
    } catch (error) {
      console.error('Error storing memory:', error);
    }
  }



  private deduplicateMemories(memories: Memory[]): Memory[] {
    try {
      const seen = new Set<string>();
      return memories.filter(memory => {
        // Create a key based on URL and question to identify duplicates
        const key = `${memory.url}:${memory.question.toLowerCase().trim()}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    } catch (error) {
      console.error('Error deduplicating memories:', error);
      return memories;
    }
  }

  getRelevantMemories(url: string, query: string, limit: number = 5): Memory[] {
    try {
      const queryLower = query.toLowerCase();
      const queryKeywords = TextProcessing.extractKeywords(query);
      
      // Score memories based on relevance
      const scoredMemories = this.memories.map(memory => {
        let score = 0;
        
        // URL match gets highest score
        if (memory.url === url) {
          score += 10;
        } else {
          // Same domain gets partial score
          try {
            const memoryDomain = new URL(memory.url).hostname;
            const queryDomain = new URL(url).hostname;
            if (memoryDomain === queryDomain) {
              score += 5;
            }
          } catch {
            // Invalid URLs, skip domain matching
          }
        }
        
        // Question similarity
        if (memory.question.toLowerCase().includes(queryLower)) {
          score += 8;
        }
        
        // Keyword overlap
        const keywordOverlap = memory.keywords.filter(keyword => 
          queryKeywords.includes(keyword)
        ).length;
        score += keywordOverlap * 2;
        
        // Answer relevance
        if (memory.answer.toLowerCase().includes(queryLower)) {
          score += 3;
        }
        
        // Title relevance
        if (memory.title.toLowerCase().includes(queryLower)) {
          score += 2;
        }
        
        // Recency bonus (more recent = higher score)
        const ageInDays = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0, 5 - ageInDays / 7); // Decay over weeks
        score += recencyScore;
        
        return { memory, score };
      });

      // Filter out memories with score 0 and sort by score
      return scoredMemories
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ memory }) => memory);
    } catch (error) {
      console.error('Error getting relevant memories:', error);
      return [];
    }
  }

  searchMemories(query: string, limit: number = 20): Memory[] {
    try {
      if (!query.trim()) {
        return this.memories.slice(0, limit);
      }

      const queryLower = query.toLowerCase();
      const matches = this.memories.filter(memory =>
        memory.question.toLowerCase().includes(queryLower) ||
        memory.answer.toLowerCase().includes(queryLower) ||
        memory.title.toLowerCase().includes(queryLower) ||
        memory.keywords.some(keyword => keyword.includes(queryLower)) ||
        memory.url.toLowerCase().includes(queryLower)
      );

      return matches.slice(0, limit);
    } catch (error) {
      console.error('Error searching memories:', error);
      return [];
    }
  }

  getMemoriesByTopic(topic: string, limit: number = 20): Memory[] {
    try {
      const matches = this.memories.filter(memory => memory.topic === topic);
      return matches.slice(0, limit);
    } catch (error) {
      console.error('Error getting memories by topic:', error);
      return [];
    }
  }

  getMemoriesByUrl(url: string): Memory[] {
    try {
      return this.memories.filter(memory => memory.url === url);
    } catch (error) {
      console.error('Error getting memories by URL:', error);
      return [];
    }
  }

  deleteMemory(memoryId: string): boolean {
    try {
      const index = this.memories.findIndex(memory => memory.id === memoryId);
      if (index !== -1) {
        this.memories.splice(index, 1);
        this.saveMemories();
        console.log('Deleted memory:', memoryId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting memory:', error);
      return false;
    }
  }

  clearMemories(): void {
    try {
      this.memories = [];
      this.saveMemories();
      console.log('All memories cleared');
    } catch (error) {
      console.error('Error clearing memories:', error);
    }
  }

  clearMemoriesOlderThan(days: number): number {
    try {
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      const originalLength = this.memories.length;
      
      this.memories = this.memories.filter(memory => memory.timestamp > cutoffTime);
      
      const deletedCount = originalLength - this.memories.length;
      if (deletedCount > 0) {
        this.saveMemories();
        console.log(`Cleared ${deletedCount} memories older than ${days} days`);
      }
      
      return deletedCount;
    } catch (error) {
      console.error('Error clearing old memories:', error);
      return 0;
    }
  }

  getMemoryStats(): {
    totalMemories: number;
    topicCounts: Record<string, number>;
    averageMemoriesPerDay: number;
    oldestMemory: number | null;
    newestMemory: number | null;
  } {
    try {
      const topicCounts: Record<string, number> = {};
      
      this.memories.forEach(memory => {
        topicCounts[memory.topic] = (topicCounts[memory.topic] || 0) + 1;
      });

      const timestamps = this.memories.map(memory => memory.timestamp);
      const oldestMemory = timestamps.length > 0 ? Math.min(...timestamps) : null;
      const newestMemory = timestamps.length > 0 ? Math.max(...timestamps) : null;
      
      let averageMemoriesPerDay = 0;
      if (oldestMemory && newestMemory) {
        const daysSpan = (newestMemory - oldestMemory) / (1000 * 60 * 60 * 24);
        averageMemoriesPerDay = daysSpan > 0 ? this.memories.length / daysSpan : 0;
      }

      return {
        totalMemories: this.memories.length,
        topicCounts,
        averageMemoriesPerDay,
        oldestMemory,
        newestMemory
      };
    } catch (error) {
      console.error('Error getting memory stats:', error);
      return {
        totalMemories: 0,
        topicCounts: {},
        averageMemoriesPerDay: 0,
        oldestMemory: null,
        newestMemory: null
      };
    }
  }

  exportMemories(): string {
    try {
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        memories: this.memories
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting memories:', error);
      return '';
    }
  }

  importMemories(jsonData: string): boolean {
    try {
      const importData = JSON.parse(jsonData);
      
      if (importData.memories && Array.isArray(importData.memories)) {
        // Merge with existing memories, avoiding duplicates
        const combinedMemories = [...this.memories, ...importData.memories];
        this.memories = this.deduplicateMemories(combinedMemories);
        
        // Sort by timestamp (newest first)
        this.memories.sort((a, b) => b.timestamp - a.timestamp);
        
        // Limit to max memories
        if (this.memories.length > this.MAX_MEMORIES) {
          this.memories = this.memories.slice(0, this.MAX_MEMORIES);
        }
        
        this.saveMemories();
        console.log(`Imported memories, total count: ${this.memories.length}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error importing memories:', error);
      return false;
    }
  }

  getAllMemories(): Memory[] {
    return [...this.memories];
  }

  getMemoryCount(): number {
    return this.memories.length;
  }
} 