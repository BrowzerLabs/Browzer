import Database from 'better-sqlite3';

import { Migration } from '../recording/MigrationService';

export const auditMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_audit_schema',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          recording_id TEXT,
          user_email TEXT NOT NULL,
          agent_mode TEXT NOT NULL,
          user_goal TEXT NOT NULL,
          start_url TEXT,
          status TEXT NOT NULL DEFAULT 'running',
          started_at INTEGER NOT NULL,
          ended_at INTEGER,
          total_steps INTEGER DEFAULT 0,
          result_message TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY,
          audit_log_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_data_json TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          FOREIGN KEY (audit_log_id) REFERENCES audit_logs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs(user_email);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_started_at ON audit_logs(started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_agent_mode ON audit_logs(agent_mode);

        CREATE INDEX IF NOT EXISTS idx_audit_events_audit_log_id ON audit_events(audit_log_id);
        CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);

        CREATE VIRTUAL TABLE IF NOT EXISTS audit_logs_fts USING fts5(
          id UNINDEXED,
          user_goal,
          user_email,
          result_message,
          content='audit_logs',
          content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS audit_logs_fts_insert AFTER INSERT ON audit_logs BEGIN
          INSERT INTO audit_logs_fts(rowid, id, user_goal, user_email, result_message)
          VALUES (new.rowid, new.id, new.user_goal, new.user_email, COALESCE(new.result_message, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS audit_logs_fts_delete AFTER DELETE ON audit_logs BEGIN
          DELETE FROM audit_logs_fts WHERE rowid = old.rowid;
        END;

        CREATE TRIGGER IF NOT EXISTS audit_logs_fts_update AFTER UPDATE ON audit_logs BEGIN
          DELETE FROM audit_logs_fts WHERE rowid = old.rowid;
          INSERT INTO audit_logs_fts(rowid, id, user_goal, user_email, result_message)
          VALUES (new.rowid, new.id, new.user_goal, new.user_email, COALESCE(new.result_message, ''));
        END;
      `);
    },
    down: (db: Database.Database) => {
      db.exec(`
        DROP TRIGGER IF EXISTS audit_logs_fts_update;
        DROP TRIGGER IF EXISTS audit_logs_fts_delete;
        DROP TRIGGER IF EXISTS audit_logs_fts_insert;
        DROP TABLE IF EXISTS audit_logs_fts;
        DROP INDEX IF EXISTS idx_audit_events_type;
        DROP INDEX IF EXISTS idx_audit_events_timestamp;
        DROP INDEX IF EXISTS idx_audit_events_audit_log_id;
        DROP INDEX IF EXISTS idx_audit_logs_agent_mode;
        DROP INDEX IF EXISTS idx_audit_logs_status;
        DROP INDEX IF EXISTS idx_audit_logs_started_at;
        DROP INDEX IF EXISTS idx_audit_logs_user_email;
        DROP INDEX IF EXISTS idx_audit_logs_session_id;
        DROP TABLE IF EXISTS audit_events;
        DROP TABLE IF EXISTS audit_logs;
      `);
    },
  },
  {
    version: 2,
    name: 'add_video_path_column',
    up: (db: Database.Database) => {
      db.exec(`
        ALTER TABLE audit_logs ADD COLUMN video_path TEXT;
      `);
    },
    down: (db: Database.Database) => {
      // SQLite doesn't support DROP COLUMN directly
      // This would require table recreation for a full rollback
      console.warn('Rollback for video_path column not implemented');
    },
  },
];
