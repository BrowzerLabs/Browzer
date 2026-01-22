import { app } from 'electron';
import path from 'path';
import { randomUUID } from 'crypto';

import Database from 'better-sqlite3';

import {
  HistoryEntry,
  HistoryTransition,
  HistoryQuery,
  HistoryStats,
} from '@/shared/types';

export class HistoryService {
  private db: Database.Database;

  private stmts: {
    getByUrl: Database.Statement;
    insert: Database.Statement;
    update: Database.Statement;
    getById: Database.Statement;
    deleteById: Database.Statement;
    clearAll: Database.Statement;
    getAutocompleteSuggestions: Database.Statement;
  };

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'history.db');

    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 30000000000');
    this.db.pragma('page_size = 4096'); // Optimal page size
    this.db.pragma('cache_size = -64000'); // 64MB cache

    this.initializeDatabase();

    // Prepare frequently used statements
    this.stmts = {
      getByUrl: this.db.prepare('SELECT * FROM history_entries WHERE url = ?'),
      insert: this.db.prepare(`
        INSERT INTO history_entries (id, url, title, visit_time, visit_count, last_visit_time, favicon, typed_count, transition)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      update: this.db.prepare(`
        UPDATE history_entries 
        SET visit_count = visit_count + 1,
            last_visit_time = ?,
            title = ?,
            favicon = COALESCE(?, favicon),
            typed_count = typed_count + ?,
            transition = ?
        WHERE url = ?
      `),
      getById: this.db.prepare('SELECT * FROM history_entries WHERE id = ?'),
      deleteById: this.db.prepare('DELETE FROM history_entries WHERE id = ?'),
      clearAll: this.db.prepare('DELETE FROM history_entries'),
      getAutocompleteSuggestions: this.db.prepare(`
        SELECT *
        FROM history_entries
        WHERE 
          LOWER(url) LIKE ? OR 
          LOWER(title) LIKE ?
        ORDER BY 
          typed_count DESC,
          visit_count DESC,
          last_visit_time DESC
        LIMIT ?
      `),
    };

    console.log('HistoryService initialized with SQLite at:', dbPath);
  }

  private initializeDatabase(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS history_entries (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          visit_time INTEGER NOT NULL,
          visit_count INTEGER NOT NULL DEFAULT 1,
          last_visit_time INTEGER NOT NULL,
          favicon TEXT,
          typed_count INTEGER NOT NULL DEFAULT 0,
          transition TEXT NOT NULL
        );

        -- Indexes for fast lookups
        CREATE INDEX IF NOT EXISTS idx_url ON history_entries(url);
        CREATE INDEX IF NOT EXISTS idx_last_visit_time ON history_entries(last_visit_time DESC);
        CREATE INDEX IF NOT EXISTS idx_visit_count ON history_entries(visit_count DESC);
        CREATE INDEX IF NOT EXISTS idx_title ON history_entries(title);
        CREATE INDEX IF NOT EXISTS idx_visit_time ON history_entries(visit_time DESC);

        -- Full-text search virtual table
        CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
          id UNINDEXED,
          url,
          title,
          content='history_entries',
          content_rowid='rowid'
        );

        -- Triggers to keep FTS table in sync
        CREATE TRIGGER IF NOT EXISTS history_fts_insert AFTER INSERT ON history_entries BEGIN
          INSERT INTO history_fts(rowid, id, url, title)
          VALUES (new.rowid, new.id, new.url, new.title);
        END;

        CREATE TRIGGER IF NOT EXISTS history_fts_delete AFTER DELETE ON history_entries BEGIN
          DELETE FROM history_fts WHERE rowid = old.rowid;
        END;

        CREATE TRIGGER IF NOT EXISTS history_fts_update AFTER UPDATE ON history_entries BEGIN
          DELETE FROM history_fts WHERE rowid = old.rowid;
          INSERT INTO history_fts(rowid, id, url, title)
          VALUES (new.rowid, new.id, new.url, new.title);
        END;
      `);

      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Error initializing database schema:', error);
      throw error;
    }
  }

  private rowToEntry(row: any): HistoryEntry {
    return {
      id: row.id,
      url: row.url,
      title: row.title,
      visitTime: row.visit_time,
      visitCount: row.visit_count,
      lastVisitTime: row.last_visit_time,
      favicon: row.favicon,
      typedCount: row.typed_count,
      transition: row.transition as HistoryTransition,
    };
  }

  public async addEntry(
    url: string,
    title: string,
    transition: HistoryTransition = HistoryTransition.LINK,
    favicon?: string
  ): Promise<HistoryEntry | null> {
    if (
      url.startsWith('browzer://') ||
      url.startsWith('chrome://') ||
      url.startsWith('about:')
    ) {
      return null;
    }

    const now = Date.now();

    try {
      const existing = this.stmts.getByUrl.get(url) as any;

      if (existing) {
        const typedIncrement = transition === HistoryTransition.TYPED ? 1 : 0;

        this.stmts.update.run(
          now,
          title || existing.title,
          favicon,
          typedIncrement,
          transition,
          url
        );

        const updated = this.stmts.getByUrl.get(url) as any;
        return this.rowToEntry(updated);
      } else {
        const id = randomUUID();
        const typedCount = transition === HistoryTransition.TYPED ? 1 : 0;

        this.stmts.insert.run(
          id,
          url,
          title || url,
          now,
          1,
          now,
          favicon || null,
          typedCount,
          transition
        );

        return {
          id,
          url,
          title: title || url,
          visitTime: now,
          visitCount: 1,
          lastVisitTime: now,
          favicon,
          typedCount,
          transition,
        };
      }
    } catch (error) {
      console.error('Error adding history entry:', error);
      return null;
    }
  }

  public async getAll(limit?: number): Promise<HistoryEntry[]> {
    try {
      let query = 'SELECT * FROM history_entries ORDER BY last_visit_time DESC';

      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      const rows = this.db.prepare(query).all();
      return rows.map((row) => this.rowToEntry(row));
    } catch (error) {
      console.error('Error getting all history:', error);
      return [];
    }
  }

  public async search(query: HistoryQuery): Promise<HistoryEntry[]> {
    try {
      let sql = 'SELECT * FROM history_entries WHERE 1=1';
      const params: any[] = [];

      // Use full-text search if text query provided
      if (query.text) {
        sql = `
          SELECT h.* FROM history_entries h
          INNER JOIN history_fts f ON h.rowid = f.rowid
          WHERE history_fts MATCH ?
        `;
        params.push(query.text);
      }

      // Filter by time range
      if (query.startTime !== undefined) {
        sql += ` AND last_visit_time >= ?`;
        params.push(query.startTime);
      }

      if (query.endTime !== undefined) {
        sql += ` AND last_visit_time <= ?`;
        params.push(query.endTime);
      }

      // Sort by last visit time
      sql += ' ORDER BY last_visit_time DESC';

      // Limit results
      if (query.maxResults) {
        sql += ` LIMIT ${query.maxResults}`;
      }

      const rows = this.db.prepare(sql).all(...params);
      return rows.map((row) => this.rowToEntry(row));
    } catch (error) {
      console.error('Error searching history:', error);
      return [];
    }
  }

  public async getByDateRange(
    startTime: number,
    endTime: number
  ): Promise<HistoryEntry[]> {
    return this.search({ startTime, endTime });
  }

  public async getToday(): Promise<HistoryEntry[]> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    return this.getByDateRange(startOfDay, endOfDay);
  }

  public async getLastNDays(days: number): Promise<HistoryEntry[]> {
    const now = Date.now();
    const startTime = now - days * 24 * 60 * 60 * 1000;

    return this.getByDateRange(startTime, now);
  }

  public async deleteEntry(id: string): Promise<boolean> {
    try {
      const result = this.stmts.deleteById.run(id);
      const deleted = result.changes > 0;

      if (deleted) {
        console.log(`Deleted history entry with id: ${id}`);
      }

      return deleted;
    } catch (error) {
      console.error('Error deleting history entry:', error);
      return false;
    }
  }

  public async deleteEntries(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    try {
      const deleteMany = this.db.transaction((entryIds: string[]) => {
        let count = 0;
        for (const id of entryIds) {
          const result = this.stmts.deleteById.run(id);
          count += result.changes;
        }
        return count;
      });

      return deleteMany(ids);
    } catch (error) {
      console.error('Error deleting multiple entries:', error);
      return 0;
    }
  }

  public async deleteByDateRange(
    startTime: number,
    endTime: number
  ): Promise<number> {
    try {
      const result = this.db
        .prepare(
          `
        DELETE FROM history_entries 
        WHERE last_visit_time >= ? AND last_visit_time <= ?
      `
        )
        .run(startTime, endTime);

      console.log(`Deleted ${result.changes} entries from date range`);
      return result.changes;
    } catch (error) {
      console.error('Error deleting by date range:', error);
      return 0;
    }
  }

  public async clearAll(): Promise<boolean> {
    try {
      this.stmts.clearAll.run();
      console.log('Cleared all history');
      return true;
    } catch (error) {
      console.error('Error clearing history:', error);
      return false;
    }
  }

  public async getStats(): Promise<HistoryStats> {
    try {
      const totals = this.db
        .prepare(
          `
        SELECT 
          COUNT(*) as totalEntries,
          SUM(visit_count) as totalVisits
        FROM history_entries
      `
        )
        .get() as { totalEntries: number; totalVisits: number };

      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      ).getTime();
      const todayStats = this.db
        .prepare(
          `
        SELECT SUM(visit_count) as todayVisits
        FROM history_entries
        WHERE last_visit_time >= ?
      `
        )
        .get(startOfDay) as { todayVisits: number | null };

      const startOfWeek = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      const weekStats = this.db
        .prepare(
          `
        SELECT SUM(visit_count) as weekVisits
        FROM history_entries
        WHERE last_visit_time >= ?
      `
        )
        .get(startOfWeek) as { weekVisits: number | null };

      const topDomainsRaw = this.db
        .prepare(
          `
        SELECT 
          SUBSTR(url, INSTR(url, '://') + 3, 
                 CASE 
                   WHEN INSTR(SUBSTR(url, INSTR(url, '://') + 3), '/') > 0 
                   THEN INSTR(SUBSTR(url, INSTR(url, '://') + 3), '/') - 1
                   ELSE LENGTH(url)
                 END
          ) as domain,
          SUM(visit_count) as count
        FROM history_entries
        WHERE url LIKE 'http%'
        GROUP BY domain
        ORDER BY count DESC
        LIMIT 10
      `
        )
        .all() as Array<{ domain: string; count: number }>;

      return {
        totalEntries: totals.totalEntries || 0,
        totalVisits: totals.totalVisits || 0,
        topDomains: topDomainsRaw,
        todayVisits: todayStats.todayVisits || 0,
        weekVisits: weekStats.weekVisits || 0,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        totalEntries: 0,
        totalVisits: 0,
        topDomains: [],
        todayVisits: 0,
        weekVisits: 0,
      };
    }
  }

  public async getMostVisited(limit = 10): Promise<HistoryEntry[]> {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT * FROM history_entries 
        ORDER BY visit_count DESC 
        LIMIT ?
      `
        )
        .all(limit);

      return rows.map((row) => this.rowToEntry(row));
    } catch (error) {
      console.error('Error getting most visited:', error);
      return [];
    }
  }

  public async getRecentlyVisited(limit = 20): Promise<HistoryEntry[]> {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    try {
      const rows = this.db
        .prepare(
          `
        SELECT * FROM history_entries 
        WHERE last_visit_time >= ?
        ORDER BY last_visit_time DESC 
        LIMIT ?
      `
        )
        .all(oneDayAgo, limit);

      return rows.map((row) => this.rowToEntry(row));
    } catch (error) {
      console.error('Error getting recently visited:', error);
      return [];
    }
  }

  public async hasUrl(url: string): Promise<boolean> {
    try {
      const result = this.stmts.getByUrl.get(url);
      return !!result;
    } catch (error) {
      console.error('Error checking URL existence:', error);
      return false;
    }
  }

  public async getByUrl(url: string): Promise<HistoryEntry | null> {
    try {
      const row = this.stmts.getByUrl.get(url);
      return row ? this.rowToEntry(row) : null;
    } catch (error) {
      console.error('Error getting entry by URL:', error);
      return null;
    }
  }

  public close(): void {
    try {
      this.db.close();
      console.log('History database connection closed');
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }

  public async getAutocompleteSuggestions(
    query: string,
    limit = 8
  ): Promise<HistoryEntry[]> {
    if (!query || query.trim().length === 0) {
      return this.getMostVisited(limit);
    }

    const searchQuery = query.trim().toLowerCase();

    try {
      const rows = this.db
        .prepare(
          `
        SELECT *,
          CASE
            WHEN LOWER(url) LIKE ? THEN 100
            WHEN LOWER(url) LIKE ? THEN 80
            WHEN LOWER(title) LIKE ? THEN 60
            WHEN LOWER(url) LIKE ? THEN 40
            WHEN LOWER(title) LIKE ? THEN 20
            ELSE 0
          END as match_score
        FROM history_entries
        WHERE 
          LOWER(url) LIKE ? OR 
          LOWER(title) LIKE ?
        ORDER BY 
          match_score DESC,
          typed_count DESC,
          visit_count DESC,
          last_visit_time DESC
        LIMIT ?
      `
        )
        .all(
          `%://${searchQuery}%`, // URL starts with query after protocol
          `%://%${searchQuery}%`, // URL contains query
          `${searchQuery}%`, // Title starts with query
          `%${searchQuery}%`, // URL contains query anywhere
          `%${searchQuery}%`, // Title contains query anywhere
          `%${searchQuery}%`, // WHERE: URL contains
          `%${searchQuery}%`, // WHERE: Title contains
          limit
        );

      return rows.map((row) => this.rowToEntry(row));
    } catch (error) {
      console.error('Error getting autocomplete suggestions:', error);
      return [];
    }
  }
}
