import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

import { MigrationService } from '../recording/MigrationService';

import { auditMigrations } from './migrations';

import {
  AuditLog,
  AuditLogWithEvents,
  AuditEvent,
  AuditStatus,
  AuditStats,
  AuditFilters,
  AuditAgentMode,
} from '@/shared/types/audit';
import { AutomationEventType } from '@/shared/types/automation';

interface AuditLogRow {
  id: string;
  session_id: string;
  recording_id: string | null;
  user_email: string;
  agent_mode: string;
  user_goal: string;
  start_url: string | null;
  status: string;
  started_at: number;
  ended_at: number | null;
  total_steps: number;
  result_message: string | null;
  video_path: string | null;
}

interface AuditEventRow {
  id: string;
  audit_log_id: string;
  event_type: string;
  event_data_json: string;
  timestamp: number;
}

export class AuditStore {
  private db: Database.Database;
  private dbPath: string;

  private stmts!: {
    insertLog: Database.Statement;
    updateLog: Database.Statement;
    insertEvent: Database.Statement;
    getLogById: Database.Statement;
    getAllLogs: Database.Statement;
    getEventsByLogId: Database.Statement;
    deleteLog: Database.Statement;
    clearAll: Database.Statement;
    incrementSteps: Database.Statement;
  };

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'audit.db');

    this.db = new Database(this.dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 30000000000');
    this.db.pragma('page_size = 4096');
    this.db.pragma('cache_size = -64000');

    const migrationManager = new MigrationService(this.db, this.dbPath);
    try {
      migrationManager.migrateSync(auditMigrations);
    } catch (error) {
      console.error('Audit migration failed:', error);
    }

    this.initializeStatements();

    console.log('AuditStore initialized with SQLite at:', this.dbPath);

    // Check and repair FTS5 if needed on startup
    this.checkAndRepairFTS5();
  }

  /**
   * Check FTS5 integrity and rebuild if corrupted
   */
  private checkAndRepairFTS5(): void {
    try {
      // Try a simple FTS5 query to check if it's working
      this.db.prepare('SELECT * FROM audit_logs_fts LIMIT 1').get();
    } catch (error: any) {
      if (
        error?.code === 'SQLITE_CORRUPT_VTAB' ||
        error?.message?.includes('malformed')
      ) {
        console.warn('[AuditStore] FTS5 index corrupted, rebuilding...');
        this.rebuildFTS5();

        // Verify rebuild worked
        try {
          this.db.prepare('SELECT * FROM audit_logs_fts LIMIT 1').get();
        } catch (retryError: any) {
          if (
            retryError?.code === 'SQLITE_CORRUPT_VTAB' ||
            retryError?.message?.includes('malformed')
          ) {
            console.error(
              '[AuditStore] Database corruption persists after rebuild, resetting...'
            );
            this.resetDatabase();
          }
        }
      }
    }
  }

  /**
   * Rebuild the FTS5 index from scratch
   */
  private rebuildFTS5(): void {
    try {
      // Drop and recreate FTS5 table
      this.db.exec(`
        DROP TRIGGER IF EXISTS audit_logs_fts_update;
        DROP TRIGGER IF EXISTS audit_logs_fts_delete;
        DROP TRIGGER IF EXISTS audit_logs_fts_insert;
        DROP TABLE IF EXISTS audit_logs_fts;

        CREATE VIRTUAL TABLE audit_logs_fts USING fts5(
          id UNINDEXED,
          user_goal,
          user_email,
          result_message,
          content='audit_logs',
          content_rowid='rowid'
        );

        CREATE TRIGGER audit_logs_fts_insert AFTER INSERT ON audit_logs BEGIN
          INSERT INTO audit_logs_fts(rowid, id, user_goal, user_email, result_message)
          VALUES (new.rowid, new.id, new.user_goal, new.user_email, COALESCE(new.result_message, ''));
        END;

        CREATE TRIGGER audit_logs_fts_delete AFTER DELETE ON audit_logs BEGIN
          DELETE FROM audit_logs_fts WHERE rowid = old.rowid;
        END;

        CREATE TRIGGER audit_logs_fts_update AFTER UPDATE ON audit_logs BEGIN
          DELETE FROM audit_logs_fts WHERE rowid = old.rowid;
          INSERT INTO audit_logs_fts(rowid, id, user_goal, user_email, result_message)
          VALUES (new.rowid, new.id, new.user_goal, new.user_email, COALESCE(new.result_message, ''));
        END;

        -- Repopulate FTS5 from existing data
        INSERT INTO audit_logs_fts(rowid, id, user_goal, user_email, result_message)
        SELECT rowid, id, user_goal, user_email, COALESCE(result_message, '') FROM audit_logs;
      `);

      // Run VACUUM to try to fix any remaining corruption
      this.db.exec('VACUUM');

      console.log('[AuditStore] FTS5 index rebuilt successfully');
    } catch (error) {
      console.error('[AuditStore] Failed to rebuild FTS5 index:', error);
    }
  }

  /**
   * Perform update without FTS5 triggers (fallback for corrupted DB)
   */
  private updateLogDirect(
    id: string,
    updates: {
      status?: AuditStatus;
      endedAt?: number;
      totalSteps?: number;
      resultMessage?: string;
    }
  ): boolean {
    try {
      const existing = this.getLog(id);
      if (!existing) return false;

      const newStatus = updates.status ?? existing.status;
      const newEndedAt = updates.endedAt ?? existing.endedAt ?? null;
      const newTotalSteps = updates.totalSteps ?? existing.totalSteps;
      const newResultMessage =
        updates.resultMessage ?? existing.resultMessage ?? null;

      // Disable FTS5 trigger temporarily
      this.db.exec('DROP TRIGGER IF EXISTS audit_logs_fts_update');

      // Perform the update
      this.stmts.updateLog.run(
        newStatus,
        newEndedAt,
        newTotalSteps,
        newResultMessage,
        id
      );

      // Re-enable trigger
      this.db.exec(`
        CREATE TRIGGER audit_logs_fts_update AFTER UPDATE ON audit_logs BEGIN
          DELETE FROM audit_logs_fts WHERE rowid = old.rowid;
          INSERT INTO audit_logs_fts(rowid, id, user_goal, user_email, result_message)
          VALUES (new.rowid, new.id, new.user_goal, new.user_email, COALESCE(new.result_message, ''));
        END;
      `);

      console.log(`[AuditStore] updateLogDirect succeeded for id=${id}`);
      return true;
    } catch (error) {
      console.error('[AuditStore] updateLogDirect failed:', error);
      return false;
    }
  }

  /**
   * Reset the database by deleting corrupted files and reinitializing
   * This is a last resort when the database is corrupted beyond repair
   */
  private resetDatabase(): void {
    console.warn('[AuditStore] Resetting corrupted database...');

    try {
      // Close the current connection
      this.db.close();
    } catch {
      // Ignore close errors
    }

    // Delete the corrupted database files
    const filesToDelete = [
      this.dbPath,
      `${this.dbPath}-wal`,
      `${this.dbPath}-shm`,
    ];

    for (const file of filesToDelete) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`[AuditStore] Deleted: ${file}`);
        }
      } catch (err) {
        console.error(`[AuditStore] Failed to delete ${file}:`, err);
      }
    }

    // Reinitialize the database
    this.db = new Database(this.dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('temp_store = MEMORY');
    this.db.pragma('mmap_size = 30000000000');
    this.db.pragma('page_size = 4096');
    this.db.pragma('cache_size = -64000');

    const migrationManager = new MigrationService(this.db, this.dbPath);
    migrationManager.migrateSync(auditMigrations);

    // Reinitialize prepared statements
    this.initializeStatements();

    console.log('[AuditStore] Database reset complete');
  }

  /**
   * Initialize prepared statements (extracted for reuse after reset)
   */
  private initializeStatements(): void {
    this.stmts = {
      insertLog: this.db.prepare(`
        INSERT INTO audit_logs (
          id, session_id, recording_id, user_email, agent_mode, user_goal,
          start_url, status, started_at, ended_at, total_steps, result_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateLog: this.db.prepare(`
        UPDATE audit_logs
        SET status = ?, ended_at = ?, total_steps = ?, result_message = ?
        WHERE id = ?
      `),
      insertEvent: this.db.prepare(`
        INSERT INTO audit_events (id, audit_log_id, event_type, event_data_json, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `),
      getLogById: this.db.prepare('SELECT * FROM audit_logs WHERE id = ?'),
      getAllLogs: this.db.prepare(
        'SELECT * FROM audit_logs ORDER BY started_at DESC'
      ),
      getEventsByLogId: this.db.prepare(
        'SELECT * FROM audit_events WHERE audit_log_id = ? ORDER BY timestamp ASC'
      ),
      deleteLog: this.db.prepare('DELETE FROM audit_logs WHERE id = ?'),
      clearAll: this.db.prepare('DELETE FROM audit_logs'),
      incrementSteps: this.db.prepare(
        'UPDATE audit_logs SET total_steps = total_steps + 1 WHERE id = ?'
      ),
    };
  }

  private rowToAuditLog(row: AuditLogRow): AuditLog {
    return {
      id: row.id,
      sessionId: row.session_id,
      recordingId: row.recording_id,
      userEmail: row.user_email,
      agentMode: row.agent_mode as AuditAgentMode,
      userGoal: row.user_goal,
      startUrl: row.start_url || undefined,
      status: row.status as AuditStatus,
      startedAt: row.started_at,
      endedAt: row.ended_at || undefined,
      totalSteps: row.total_steps,
      resultMessage: row.result_message || undefined,
      videoPath: row.video_path || undefined,
    };
  }

  private rowToAuditEvent(row: AuditEventRow): AuditEvent {
    return {
      id: row.id,
      auditLogId: row.audit_log_id,
      eventType: row.event_type as AutomationEventType,
      eventData: JSON.parse(row.event_data_json),
      timestamp: row.timestamp,
    };
  }

  createLog(
    params: {
      sessionId: string;
      recordingId: string | null;
      userEmail: string;
      agentMode: AuditAgentMode;
      userGoal: string;
      startUrl?: string;
    },
    retryAfterRepair = true
  ): string {
    const id = uuidv4();
    const now = Date.now();

    try {
      this.stmts.insertLog.run(
        id,
        params.sessionId,
        params.recordingId,
        params.userEmail,
        params.agentMode,
        params.userGoal,
        params.startUrl || null,
        'running',
        now,
        null,
        0,
        null
      );

      console.log('Audit log created:', id);
      return id;
    } catch (error: any) {
      // Check for FTS5 corruption and auto-repair
      if (
        retryAfterRepair &&
        (error?.code === 'SQLITE_CORRUPT_VTAB' ||
          error?.message?.includes('malformed'))
      ) {
        console.warn(
          '[AuditStore] FTS5 corruption detected during createLog, rebuilding...'
        );
        this.rebuildFTS5();
        // Retry once after repair
        return this.createLog(params, false);
      }
      console.error('Error creating audit log:', error);
      throw error;
    }
  }

  updateLog(
    id: string,
    updates: {
      status?: AuditStatus;
      endedAt?: number;
      totalSteps?: number;
      resultMessage?: string;
    },
    retryAfterRepair = true
  ): boolean {
    try {
      const existing = this.getLog(id);
      if (!existing) {
        console.warn(`[AuditStore] updateLog: log not found for id=${id}`);
        return false;
      }

      const newStatus = updates.status ?? existing.status;
      const newEndedAt = updates.endedAt ?? existing.endedAt ?? null;
      const newTotalSteps = updates.totalSteps ?? existing.totalSteps;
      const newResultMessage =
        updates.resultMessage ?? existing.resultMessage ?? null;

      console.log(
        `[AuditStore] updateLog: id=${id}, status=${existing.status} -> ${newStatus}`
      );

      this.stmts.updateLog.run(
        newStatus,
        newEndedAt,
        newTotalSteps,
        newResultMessage,
        id
      );

      // Verify the update
      const updated = this.getLog(id);
      console.log(`[AuditStore] updateLog verified: status=${updated?.status}`);

      return true;
    } catch (error: any) {
      // Check for FTS5 corruption and auto-repair
      if (
        retryAfterRepair &&
        (error?.code === 'SQLITE_CORRUPT_VTAB' ||
          error?.message?.includes('malformed'))
      ) {
        console.warn(
          '[AuditStore] FTS5 corruption detected during updateLog, rebuilding...'
        );
        this.rebuildFTS5();
        // Retry once after repair
        const retryResult = this.updateLog(id, updates, false);
        if (retryResult) return true;

        // If still failing, try direct update without FTS5 trigger
        console.warn(
          '[AuditStore] Rebuild failed, attempting direct update without FTS5...'
        );
        const directResult = this.updateLogDirect(id, updates);
        if (directResult) return true;

        // Last resort: reset the database entirely
        console.error(
          '[AuditStore] All repair attempts failed, resetting database...'
        );
        this.resetDatabase();
        // Can't recover the original update, but database is now clean for future operations
        return false;
      }
      console.error('Error updating audit log:', error);
      return false;
    }
  }

  updateVideoPath(id: string, videoPath: string): boolean {
    try {
      const stmt = this.db.prepare(
        'UPDATE audit_logs SET video_path = ? WHERE id = ?'
      );
      const result = stmt.run(videoPath, id);
      const updated = result.changes > 0;

      if (updated) {
        console.log(`[AuditStore] Video path updated for audit log: ${id}`);
      }

      return updated;
    } catch (error) {
      console.error('[AuditStore] Error updating video path:', error);
      return false;
    }
  }

  addEvent(
    auditLogId: string,
    eventType: AutomationEventType,
    eventData: Record<string, unknown>
  ): string {
    const id = uuidv4();
    const now = Date.now();

    try {
      this.stmts.insertEvent.run(
        id,
        auditLogId,
        eventType,
        JSON.stringify(eventData),
        now
      );

      // Only count completed steps to avoid double-counting
      if (eventType === 'step_complete') {
        this.stmts.incrementSteps.run(auditLogId);
      }

      return id;
    } catch (error) {
      console.error('Error adding audit event:', error);
      throw error;
    }
  }

  getLog(id: string): AuditLog | undefined {
    try {
      const row = this.stmts.getLogById.get(id) as AuditLogRow | undefined;
      return row ? this.rowToAuditLog(row) : undefined;
    } catch (error) {
      console.error('Error getting audit log:', error);
      return undefined;
    }
  }

  getLogWithEvents(id: string): AuditLogWithEvents | undefined {
    try {
      const log = this.getLog(id);
      if (!log) {
        return undefined;
      }

      const eventRows = this.stmts.getEventsByLogId.all(id) as AuditEventRow[];
      const events = eventRows.map((row) => this.rowToAuditEvent(row));

      return {
        ...log,
        events,
      };
    } catch (error) {
      console.error('Error getting audit log with events:', error);
      return undefined;
    }
  }

  getAllLogs(limit?: number, offset?: number): AuditLog[] {
    try {
      let sql = 'SELECT * FROM audit_logs ORDER BY started_at DESC';
      const params: (number | undefined)[] = [];

      if (limit !== undefined) {
        sql += ' LIMIT ?';
        params.push(limit);
      }
      if (offset !== undefined) {
        sql += ' OFFSET ?';
        params.push(offset);
      }

      const rows = this.db.prepare(sql).all(...params) as AuditLogRow[];
      return rows.map((row) => this.rowToAuditLog(row));
    } catch (error) {
      console.error('Error getting all audit logs:', error);
      return [];
    }
  }

  getFilteredLogs(filters: AuditFilters): AuditLog[] {
    try {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (filters.userEmail) {
        conditions.push('user_email = ?');
        params.push(filters.userEmail);
      }

      if (filters.agentMode) {
        conditions.push('agent_mode = ?');
        params.push(filters.agentMode);
      }

      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      if (filters.startDate) {
        conditions.push('started_at >= ?');
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push('started_at <= ?');
        params.push(filters.endDate);
      }

      let sql = 'SELECT * FROM audit_logs';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY started_at DESC';

      const rows = this.db.prepare(sql).all(...params) as AuditLogRow[];
      return rows.map((row) => this.rowToAuditLog(row));
    } catch (error) {
      console.error('Error filtering audit logs:', error);
      return [];
    }
  }

  searchLogs(query: string, limit = 50, retryAfterRepair = true): AuditLog[] {
    try {
      const sql = `
        SELECT a.* FROM audit_logs a
        INNER JOIN audit_logs_fts f ON a.rowid = f.rowid
        WHERE audit_logs_fts MATCH ?
        ORDER BY a.started_at DESC
        LIMIT ?
      `;

      const rows = this.db.prepare(sql).all(query, limit) as AuditLogRow[];
      return rows.map((row) => this.rowToAuditLog(row));
    } catch (error: any) {
      // Check for FTS5 corruption and auto-repair
      if (
        retryAfterRepair &&
        (error?.code === 'SQLITE_CORRUPT_VTAB' ||
          error?.message?.includes('malformed'))
      ) {
        console.warn(
          '[AuditStore] FTS5 corruption detected during searchLogs, rebuilding...'
        );
        this.rebuildFTS5();
        // Retry once after repair
        return this.searchLogs(query, limit, false);
      }
      console.error('Error searching audit logs:', error);
      return [];
    }
  }

  deleteLog(id: string, retryAfterRepair = true): boolean {
    try {
      const result = this.stmts.deleteLog.run(id);
      const deleted = result.changes > 0;

      if (deleted) {
        console.log('Audit log deleted:', id);
      }

      return deleted;
    } catch (error: any) {
      // Check for FTS5 corruption and auto-repair
      if (
        retryAfterRepair &&
        (error?.code === 'SQLITE_CORRUPT_VTAB' ||
          error?.message?.includes('malformed'))
      ) {
        console.warn(
          '[AuditStore] FTS5 corruption detected during deleteLog, rebuilding...'
        );
        this.rebuildFTS5();
        // Retry once after repair
        return this.deleteLog(id, false);
      }
      console.error('Error deleting audit log:', error);
      return false;
    }
  }

  clearAll(): void {
    try {
      this.stmts.clearAll.run();
      console.log('All audit logs cleared');
    } catch (error) {
      console.error('Error clearing audit logs:', error);
      throw error;
    }
  }

  getStats(): AuditStats {
    try {
      const totalRow = this.db
        .prepare('SELECT COUNT(*) as count FROM audit_logs')
        .get() as { count: number };

      const statusRows = this.db
        .prepare(
          'SELECT status, COUNT(*) as count FROM audit_logs GROUP BY status'
        )
        .all() as { status: string; count: number }[];

      const modeRows = this.db
        .prepare(
          'SELECT agent_mode, COUNT(*) as count FROM audit_logs GROUP BY agent_mode'
        )
        .all() as { agent_mode: string; count: number }[];

      const avgRow = this.db
        .prepare('SELECT AVG(total_steps) as avg FROM audit_logs')
        .get() as { avg: number | null };

      const statusCounts: Record<string, number> = {};
      for (const row of statusRows) {
        statusCounts[row.status] = row.count;
      }

      const modeCounts: Record<string, number> = {};
      for (const row of modeRows) {
        modeCounts[row.agent_mode] = row.count;
      }

      return {
        totalLogs: totalRow.count,
        completedCount: statusCounts['completed'] || 0,
        failedCount: statusCounts['failed'] || 0,
        stoppedCount: statusCounts['stopped'] || 0,
        runningCount: statusCounts['running'] || 0,
        automateCount: modeCounts['automate'] || 0,
        autopilotCount: modeCounts['autopilot'] || 0,
        averageSteps: Math.round(avgRow.avg || 0),
      };
    } catch (error) {
      console.error('Error getting audit stats:', error);
      return {
        totalLogs: 0,
        completedCount: 0,
        failedCount: 0,
        stoppedCount: 0,
        runningCount: 0,
        automateCount: 0,
        autopilotCount: 0,
        averageSteps: 0,
      };
    }
  }

  getLogBySessionId(sessionId: string): AuditLog | undefined {
    try {
      const row = this.db
        .prepare('SELECT * FROM audit_logs WHERE session_id = ?')
        .get(sessionId) as AuditLogRow | undefined;
      return row ? this.rowToAuditLog(row) : undefined;
    } catch (error) {
      console.error('Error getting audit log by session ID:', error);
      return undefined;
    }
  }

  optimize(): void {
    try {
      console.log('Optimizing audit database...');
      this.db.pragma('optimize');
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      this.db.exec('VACUUM');
      console.log('Audit database optimization completed');
    } catch (error) {
      console.error('Error optimizing audit database:', error);
    }
  }

  close(): void {
    try {
      this.db.close();
      console.log('Audit database connection closed');
    } catch (error) {
      console.error('Error closing audit database:', error);
    }
  }
}
