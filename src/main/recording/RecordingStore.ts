import { app } from 'electron';
import path from 'path';
import Database from 'better-sqlite3';

import { RecordingSession } from '@/shared/types';

export class RecordingStore {
  private db: Database.Database;

  private stmts: {
    insert: Database.Statement;
    getById: Database.Statement;
    getAll: Database.Statement;
    update: Database.Statement;
    deleteById: Database.Statement;
    clearAll: Database.Statement;
  };

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'recordings.db');

    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 30000000000');
    this.db.pragma('page_size = 4096');
    this.db.pragma('cache_size = -64000');

    this.initializeDatabase();

    this.stmts = {
      insert: this.db.prepare(`
        INSERT INTO recordings (
          id, name, description, created_at, duration, start_url, actions_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
      getById: this.db.prepare('SELECT * FROM recordings WHERE id = ?'),
      getAll: this.db.prepare(
        'SELECT * FROM recordings ORDER BY created_at DESC'
      ),
      update: this.db.prepare(`
        UPDATE recordings 
        SET name = ?, description = ?
        WHERE id = ?
      `),
      deleteById: this.db.prepare('DELETE FROM recordings WHERE id = ?'),
      clearAll: this.db.prepare('DELETE FROM recordings'),
    };

    console.log('RecordingStore initialized with SQLite at:', dbPath);
  }

  private initializeDatabase(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS recordings (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          start_url TEXT,
          actions_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_created_at ON recordings(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_name ON recordings(name);
        CREATE INDEX IF NOT EXISTS idx_duration ON recordings(duration DESC);

        CREATE VIRTUAL TABLE IF NOT EXISTS recordings_fts USING fts5(
          id UNINDEXED,
          name,
          description,
          content='recordings',
          content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS recordings_fts_insert AFTER INSERT ON recordings BEGIN
          INSERT INTO recordings_fts(rowid, id, name, description)
          VALUES (new.rowid, new.id, new.name, COALESCE(new.description, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS recordings_fts_delete AFTER DELETE ON recordings BEGIN
          DELETE FROM recordings_fts WHERE rowid = old.rowid;
        END;

        CREATE TRIGGER IF NOT EXISTS recordings_fts_update AFTER UPDATE ON recordings BEGIN
          DELETE FROM recordings_fts WHERE rowid = old.rowid;
          INSERT INTO recordings_fts(rowid, id, name, description)
          VALUES (new.rowid, new.id, new.name, COALESCE(new.description, ''));
        END;
      `);

      console.log('Recording database schema initialized successfully');
    } catch (error) {
      console.error('Error initializing recording database schema:', error);
      throw error;
    }
  }

  private rowToSession(row: any): RecordingSession {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      createdAt: row.created_at,
      duration: row.duration,
      startUrl: row.start_url || undefined,
      actions: JSON.parse(row.actions_json),
    };
  }

  saveRecording(session: RecordingSession): void {
    try {
      this.stmts.insert.run(
        session.id,
        session.name,
        session.description || null,
        session.createdAt,
        session.duration,
        session.startUrl || null,
        JSON.stringify(session.actions)
      );

      console.log('✅ Recording saved:', session.name);
    } catch (error) {
      console.error('Error saving recording:', error);
      throw error;
    }
  }

  getAllRecordings(): RecordingSession[] {
    try {
      const rows = this.stmts.getAll.all();
      return rows.map((row) => this.rowToSession(row));
    } catch (error) {
      console.error('Error getting all recordings:', error);
      return [];
    }
  }

  getRecording(id: string): RecordingSession | undefined {
    try {
      const row = this.stmts.getById.get(id);
      return row ? this.rowToSession(row) : undefined;
    } catch (error) {
      console.error('Error getting recording:', error);
      return undefined;
    }
  }

  searchRecordings(query: string, limit = 50): RecordingSession[] {
    try {
      const sql = `
        SELECT r.* FROM recordings r
        INNER JOIN recordings_fts f ON r.rowid = f.rowid
        WHERE recordings_fts MATCH ?
        ORDER BY r.created_at DESC
        LIMIT ?
      `;

      const rows = this.db.prepare(sql).all(query, limit);
      return rows.map((row) => this.rowToSession(row));
    } catch (error) {
      console.error('Error searching recordings:', error);
      return [];
    }
  }

  getRecordingsByDateRange(
    startTime: number,
    endTime: number
  ): RecordingSession[] {
    try {
      const sql = `
        SELECT * FROM recordings 
        WHERE created_at >= ? AND created_at <= ?
        ORDER BY created_at DESC
      `;

      const rows = this.db.prepare(sql).all(startTime, endTime);
      return rows.map((row) => this.rowToSession(row));
    } catch (error) {
      console.error('Error getting recordings by date range:', error);
      return [];
    }
  }

  getRecentRecordings(limit = 20): RecordingSession[] {
    try {
      const sql = `
        SELECT * FROM recordings 
        ORDER BY created_at DESC 
        LIMIT ?
      `;

      const rows = this.db.prepare(sql).all(limit);
      return rows.map((row) => this.rowToSession(row));
    } catch (error) {
      console.error('Error getting recent recordings:', error);
      return [];
    }
  }

  deleteRecording(id: string): boolean {
    try {
      const result = this.stmts.deleteById.run(id);
      const deleted = result.changes > 0;

      if (deleted) {
        console.log('🗑️ Recording deleted:', id);
      }

      return deleted;
    } catch (error) {
      console.error('Error deleting recording:', error);
      return false;
    }
  }

  deleteRecordings(ids: string[]): number {
    if (ids.length === 0) return 0;

    try {
      const deleteMany = this.db.transaction((recordingIds: string[]) => {
        let count = 0;
        for (const id of recordingIds) {
          const result = this.stmts.deleteById.run(id);
          count += result.changes;
        }
        return count;
      });

      const deletedCount = deleteMany(ids);
      console.log(`🗑️ Deleted ${deletedCount} recordings`);
      return deletedCount;
    } catch (error) {
      console.error('Error deleting multiple recordings:', error);
      return 0;
    }
  }

  updateRecording(id: string, updates: Partial<RecordingSession>): boolean {
    try {
      const recording = this.getRecording(id);

      if (!recording) {
        return false;
      }

      const name = updates.name !== undefined ? updates.name : recording.name;
      const description =
        updates.description !== undefined
          ? updates.description
          : recording.description;

      this.stmts.update.run(name, description || null, id);

      console.log('✏️ Recording updated:', id);
      return true;
    } catch (error) {
      console.error('Error updating recording:', error);
      return false;
    }
  }

  clearAll(): void {
    try {
      this.stmts.clearAll.run();
      console.log('🗑️ All recordings cleared');
    } catch (error) {
      console.error('Error clearing all recordings:', error);
      throw error;
    }
  }

  getStats(): {
    count: number;
    totalActions: number;
    totalDuration: number;
    avgActionsPerRecording: number;
    avgDuration: number;
  } {
    try {
      const recordings = this.getAllRecordings();
      const count = recordings.length;
      const totalActions = recordings.reduce(
        (sum, r) => sum + r.actions.length,
        0
      );
      const totalDuration = recordings.reduce((sum, r) => sum + r.duration, 0);

      return {
        count,
        totalActions,
        totalDuration,
        avgActionsPerRecording:
          count > 0 ? Math.round(totalActions / count) : 0,
        avgDuration: count > 0 ? Math.round(totalDuration / count) : 0,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        count: 0,
        totalActions: 0,
        totalDuration: 0,
        avgActionsPerRecording: 0,
        avgDuration: 0,
      };
    }
  }

  getRecordingsByDate(): Map<string, RecordingSession[]> {
    try {
      const recordings = this.getAllRecordings();
      const grouped = new Map<string, RecordingSession[]>();

      for (const recording of recordings) {
        const date = new Date(recording.createdAt).toLocaleDateString();
        if (!grouped.has(date)) {
          grouped.set(date, []);
        }
        grouped.get(date)!.push(recording);
      }

      return grouped;
    } catch (error) {
      console.error('Error grouping recordings by date:', error);
      return new Map();
    }
  }

  getTopRecordingsByActions(limit = 10): RecordingSession[] {
    try {
      const recordings = this.getAllRecordings();
      return recordings
        .sort((a, b) => b.actions.length - a.actions.length)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting top recordings:', error);
      return [];
    }
  }

  optimize(): void {
    try {
      console.log('Optimizing recordings database...');
      this.db.pragma('optimize');
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      this.db.exec('VACUUM');
      console.log('Database optimization completed');
    } catch (error) {
      console.error('Error optimizing database:', error);
    }
  }

  close(): void {
    try {
      this.db.close();
      console.log('Recording database connection closed');
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }

  getDatabaseInfo(): {
    size: number;
    pageCount: number;
    pageSize: number;
    walSize: number;
  } {
    try {
      const pageCount = this.db.pragma('page_count', {
        simple: true,
      }) as number;
      const pageSize = this.db.pragma('page_size', { simple: true }) as number;
      const walSize = this.db.pragma('wal_checkpoint', {
        simple: true,
      }) as number;

      return {
        size: pageCount * pageSize,
        pageCount,
        pageSize,
        walSize,
      };
    } catch (error) {
      console.error('Error getting database info:', error);
      return { size: 0, pageCount: 0, pageSize: 0, walSize: 0 };
    }
  }
}
