import Database from 'better-sqlite3';
import { app, dialog } from 'electron';
import path from 'path';
import { RecordingSession } from '@/shared/types';
import { unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { SystemPromptBuilder } from '../llm';

/**
 * RecordingStore - SQLite-based persistent storage for recorded sessions
 * 
 * Features:
 * - Scalable storage for thousands of recordings
 * - Fast queries with proper indexing
 * - Full-text search on recording names and descriptions
 * - Efficient statistics and aggregations
 * - Transaction support for data integrity
 * - Automatic video file cleanup
 */
export class RecordingStore {
  private db: Database.Database;

  // Prepared statements for better performance
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
    
    // Performance optimizations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 30000000000');
    this.db.pragma('page_size = 4096');
    this.db.pragma('cache_size = -64000');
    
    this.initializeDatabase();
    
    // Prepare frequently used statements
    this.stmts = {
      insert: this.db.prepare(`
        INSERT INTO recordings (
          id, name, description, created_at, duration, action_count,
          video_path, video_size, video_format, video_duration,
          start_url, actions_json, tabs_json, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getById: this.db.prepare('SELECT * FROM recordings WHERE id = ?'),
      getAll: this.db.prepare('SELECT * FROM recordings ORDER BY created_at DESC'),
      update: this.db.prepare(`
        UPDATE recordings 
        SET name = ?, description = ?, metadata_json = ?
        WHERE id = ?
      `),
      deleteById: this.db.prepare('DELETE FROM recordings WHERE id = ?'),
      clearAll: this.db.prepare('DELETE FROM recordings'),
    };
    
    console.log('RecordingStore initialized with SQLite at:', dbPath);
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    try {
      this.db.exec(`
        -- Main recordings table
        CREATE TABLE IF NOT EXISTS recordings (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          action_count INTEGER NOT NULL,
          
          -- Video metadata
          video_path TEXT,
          video_size INTEGER,
          video_format TEXT,
          video_duration INTEGER,
          
          -- Recording metadata
          start_url TEXT,
          
          -- JSON data (for complex nested structures)
          actions_json TEXT NOT NULL,
          tabs_json TEXT,
          metadata_json TEXT
        );

        -- Indexes for fast lookups
        CREATE INDEX IF NOT EXISTS idx_created_at ON recordings(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_name ON recordings(name);
        CREATE INDEX IF NOT EXISTS idx_action_count ON recordings(action_count DESC);
        CREATE INDEX IF NOT EXISTS idx_duration ON recordings(duration DESC);
        CREATE INDEX IF NOT EXISTS idx_video_path ON recordings(video_path);

        -- Full-text search virtual table
        CREATE VIRTUAL TABLE IF NOT EXISTS recordings_fts USING fts5(
          id UNINDEXED,
          name,
          description,
          content='recordings',
          content_rowid='rowid'
        );

        -- Triggers to keep FTS table in sync
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

  /**
   * Convert database row to RecordingSession
   */
  private rowToSession(row: any): RecordingSession {
    const base: RecordingSession = {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      duration: row.duration,
      actionCount: row.action_count,
      actions: JSON.parse(row.actions_json),
    };

    // Add optional fields
    if (row.video_path) base.videoPath = row.video_path;
    if (row.video_size) base.videoSize = row.video_size;
    if (row.video_format) base.videoFormat = row.video_format;
    if (row.video_duration) base.videoDuration = row.video_duration;
    if (row.start_url) base.url = row.start_url;
    if (row.tabs_json) base.tabs = JSON.parse(row.tabs_json);
    
    // Parse metadata JSON and merge into base object
    if (row.metadata_json) {
      const metadata = JSON.parse(row.metadata_json);
      Object.assign(base, metadata);
    }

    return base;
  }

  /**
   * Save a new recording session
   */
  saveRecording(session: RecordingSession): void {
    try {
      // Extract metadata fields (everything except core fields)
      const { id, name, description, actions, createdAt, duration, actionCount,
              videoPath, videoSize, videoFormat, videoDuration, url, tabs, ...metadata } = session;

      this.stmts.insert.run(
        id,
        name,
        description || null,
        createdAt,
        duration,
        actionCount,
        videoPath || null,
        videoSize || null,
        videoFormat || null,
        videoDuration || null,
        url || null,
        JSON.stringify(actions),
        tabs ? JSON.stringify(tabs) : null,
        Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null
      );

      console.log('✅ Recording saved:', name);
    } catch (error) {
      console.error('Error saving recording:', error);
      throw error;
    }
  }

  /**
   * Get all recordings
   */
  getAllRecordings(): RecordingSession[] {
    try {
      const rows = this.stmts.getAll.all();
      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      console.error('Error getting all recordings:', error);
      return [];
    }
  }

  /**
   * Get recording by ID
   */
  getRecording(id: string): RecordingSession | undefined {
    try {
      const row = this.stmts.getById.get(id);
      return row ? this.rowToSession(row) : undefined;
    } catch (error) {
      console.error('Error getting recording:', error);
      return undefined;
    }
  }

  /**
   * Search recordings by name or description
   */
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
      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      console.error('Error searching recordings:', error);
      return [];
    }
  }

  /**
   * Get recordings by date range
   */
  getRecordingsByDateRange(startTime: number, endTime: number): RecordingSession[] {
    try {
      const sql = `
        SELECT * FROM recordings 
        WHERE created_at >= ? AND created_at <= ?
        ORDER BY created_at DESC
      `;
      
      const rows = this.db.prepare(sql).all(startTime, endTime);
      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      console.error('Error getting recordings by date range:', error);
      return [];
    }
  }

  /**
   * Get recent recordings
   */
  getRecentRecordings(limit = 20): RecordingSession[] {
    try {
      const sql = `
        SELECT * FROM recordings 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      
      const rows = this.db.prepare(sql).all(limit);
      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      console.error('Error getting recent recordings:', error);
      return [];
    }
  }

  /**
   * Export recording to JSON file
   */
  async exportRecording(id: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const recording = this.getRecording(id);
      
      if (!recording) {
        return { success: false, error: 'Recording not found' };
      }

      const xmlString = SystemPromptBuilder.formatRecordedSession(recording)
      const fileName = `recording-${recording.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.xml`;

      const { filePath } = await dialog.showSaveDialog({
        title: 'Export Recording',
        defaultPath: fileName
      });

      if (filePath) {
        await writeFile(filePath, xmlString, 'utf-8');
        return { success: true, filePath };
      }

      return { success: false, error: 'Export cancelled' };
    } catch (error) {
      console.error('Error exporting recording:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Delete recording by ID (including video file)
   */
  async deleteRecording(id: string): Promise<boolean> {
    try {
      const recording = this.getRecording(id);
      
      if (!recording) {
        return false;
      }
      
      // Delete video file if it exists
      if (recording.videoPath) {
        await this.deleteVideoFile(recording.videoPath);
      }
      
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

  /**
   * Delete multiple recordings (optimized with transaction)
   */
  async deleteRecordings(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    try {
      const deleteMany = this.db.transaction((recordingIds: string[]) => {
        let count = 0;
        for (const id of recordingIds) {
          const recording = this.getRecording(id);
          if (recording?.videoPath) {
            // Note: Video deletion is async, handled outside transaction
            this.deleteVideoFile(recording.videoPath).catch(err => 
              console.error('Failed to delete video:', err)
            );
          }
          
          const result = this.stmts.deleteById.run(id);
          count += result.changes;
        }
        return count;
      });

      return deleteMany(ids);
    } catch (error) {
      console.error('Error deleting multiple recordings:', error);
      return 0;
    }
  }

  /**
   * Update recording metadata (cannot update video-related fields)
   */
  updateRecording(id: string, updates: Partial<RecordingSession>): boolean {
    try {
      const recording = this.getRecording(id);
      
      if (!recording) {
        return false;
      }

      // Only allow updating safe fields
      const name = updates.name !== undefined ? updates.name : recording.name;
      const description = updates.description !== undefined ? updates.description : recording.description;
      
      // Extract current metadata (non-core fields)
      const { id: _id, name: _name, description: _desc, actions, createdAt, duration, actionCount,
              videoPath, videoSize, videoFormat, videoDuration, url, tabs, ...currentMetadata } = recording;
      
      // Extract update metadata (non-core fields)
      const { name: _uName, description: _uDesc, ...updateMetadata } = updates;
      
      // Merge metadata
      const mergedMetadata = { ...currentMetadata, ...updateMetadata };

      this.stmts.update.run(
        name,
        description || null,
        Object.keys(mergedMetadata).length > 0 ? JSON.stringify(mergedMetadata) : null,
        id
      );

      console.log('✏️ Recording updated:', id);
      return true;
    } catch (error) {
      console.error('Error updating recording:', error);
      return false;
    }
  }

  /**
   * Clear all recordings (including video files)
   */
  async clearAll(): Promise<void> {
    try {
      const recordings = this.getAllRecordings();
      
      // Delete all video files
      for (const recording of recordings) {
        if (recording.videoPath) {
          await this.deleteVideoFile(recording.videoPath);
        }
      }
      
      this.stmts.clearAll.run();
      console.log('🗑️ All recordings cleared');
    } catch (error) {
      console.error('Error clearing all recordings:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics (optimized with SQL aggregations)
   */
  getStats(): { 
    count: number; 
    totalActions: number; 
    totalSize: number; 
    totalVideoSize: number;
    totalDuration: number;
    avgActionsPerRecording: number;
  } {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as count,
          SUM(action_count) as totalActions,
          SUM(video_size) as totalVideoSize,
          SUM(duration) as totalDuration,
          AVG(action_count) as avgActions
        FROM recordings
      `).get() as {
        count: number;
        totalActions: number | null;
        totalVideoSize: number | null;
        totalDuration: number | null;
        avgActions: number | null;
      };

      // Calculate JSON storage size (approximate)
      const recordings = this.getAllRecordings();
      const totalSize = JSON.stringify(recordings).length;

      return {
        count: stats.count || 0,
        totalActions: stats.totalActions || 0,
        totalSize,
        totalVideoSize: stats.totalVideoSize || 0,
        totalDuration: stats.totalDuration || 0,
        avgActionsPerRecording: Math.round(stats.avgActions || 0),
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        count: 0,
        totalActions: 0,
        totalSize: 0,
        totalVideoSize: 0,
        totalDuration: 0,
        avgActionsPerRecording: 0,
      };
    }
  }

  /**
   * Get recordings grouped by date
   */
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

  /**
   * Get top recordings by action count
   */
  getTopRecordingsByActions(limit = 10): RecordingSession[] {
    try {
      const sql = `
        SELECT * FROM recordings 
        ORDER BY action_count DESC 
        LIMIT ?
      `;
      
      const rows = this.db.prepare(sql).all(limit);
      return rows.map(row => this.rowToSession(row));
    } catch (error) {
      console.error('Error getting top recordings:', error);
      return [];
    }
  }

  /**
   * Delete video file from disk
   */
  private async deleteVideoFile(videoPath: string): Promise<void> {
    try {
      if (existsSync(videoPath)) {
        await unlink(videoPath);
        console.log('🎥 Video file deleted:', videoPath);
      }
    } catch (error) {
      console.error('Failed to delete video file:', videoPath, error);
    }
  }

  /**
   * Clean up orphaned video files (videos without corresponding recordings)
   */
  async cleanupOrphanedVideos(videosDirectory: string): Promise<number> {
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(videosDirectory);
      
      const recordings = this.getAllRecordings();
      const validVideoPaths = new Set(
        recordings
          .map(r => r.videoPath)
          .filter(Boolean)
          .map(p => path.basename(p!))
      );

      let deletedCount = 0;
      for (const file of files) {
        if (file.endsWith('.webm') && !validVideoPaths.has(file)) {
          const fullPath = path.join(videosDirectory, file);
          await this.deleteVideoFile(fullPath);
          deletedCount++;
        }
      }

      console.log(`🧹 Cleaned up ${deletedCount} orphaned video files`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up orphaned videos:', error);
      return 0;
    }
  }

  /**
   * Optimize database (run periodically for maintenance)
   */
  async optimize(): Promise<void> {
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

  /**
   * Close database connection
   */
  close(): void {
    try {
      this.db.close();
      console.log('Recording database connection closed');
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }

  /**
   * Get database statistics for monitoring
   */
  getDatabaseInfo(): {
    size: number;
    pageCount: number;
    pageSize: number;
    walSize: number;
  } {
    try {
      const pageCount = this.db.pragma('page_count', { simple: true }) as number;
      const pageSize = this.db.pragma('page_size', { simple: true }) as number;
      const walSize = this.db.pragma('wal_checkpoint', { simple: true }) as number;

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
