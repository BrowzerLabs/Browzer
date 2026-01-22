import Database from 'better-sqlite3';

import { Migration } from './MigrationService';

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS recordings (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          action_count INTEGER NOT NULL,
          
          video_path TEXT,
          video_size INTEGER,
          video_format TEXT,
          video_duration INTEGER,
          
          start_url TEXT,
          
          actions_json TEXT NOT NULL,
          tabs_json TEXT,
          metadata_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_created_at ON recordings(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_name ON recordings(name);
        CREATE INDEX IF NOT EXISTS idx_action_count ON recordings(action_count DESC);
        CREATE INDEX IF NOT EXISTS idx_duration ON recordings(duration DESC);
        CREATE INDEX IF NOT EXISTS idx_video_path ON recordings(video_path);

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
    },
    down: (db: Database.Database) => {
      db.exec(`
        DROP TRIGGER IF EXISTS recordings_fts_update;
        DROP TRIGGER IF EXISTS recordings_fts_delete;
        DROP TRIGGER IF EXISTS recordings_fts_insert;
        DROP TABLE IF EXISTS recordings_fts;
        DROP INDEX IF EXISTS idx_video_path;
        DROP INDEX IF EXISTS idx_duration;
        DROP INDEX IF EXISTS idx_action_count;
        DROP INDEX IF EXISTS idx_name;
        DROP INDEX IF EXISTS idx_created_at;
        DROP TABLE IF EXISTS recordings;
      `);
    },
  },
  {
    version: 2,
    name: 'remove_action_count_and_metadata_columns',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE recordings_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          start_url TEXT,
          actions_json TEXT NOT NULL,
          video_path TEXT
        );

        INSERT INTO recordings_new (
          id, name, description, created_at, duration, start_url, actions_json, video_path
        )
        SELECT 
          id, 
          name, 
          description, 
          created_at, 
          duration, 
          start_url, 
          actions_json, 
          video_path
        FROM recordings;

        DROP TRIGGER IF EXISTS recordings_fts_update;
        DROP TRIGGER IF EXISTS recordings_fts_delete;
        DROP TRIGGER IF EXISTS recordings_fts_insert;
        
        DROP TABLE recordings;
        
        ALTER TABLE recordings_new RENAME TO recordings;

        CREATE INDEX IF NOT EXISTS idx_created_at ON recordings(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_name ON recordings(name);
        CREATE INDEX IF NOT EXISTS idx_duration ON recordings(duration DESC);

        DROP TABLE IF EXISTS recordings_fts;
        
        CREATE VIRTUAL TABLE recordings_fts USING fts5(
          id UNINDEXED,
          name,
          description,
          content='recordings',
          content_rowid='rowid'
        );

        INSERT INTO recordings_fts(rowid, id, name, description)
        SELECT rowid, id, name, COALESCE(description, '') FROM recordings;

        CREATE TRIGGER recordings_fts_insert AFTER INSERT ON recordings BEGIN
          INSERT INTO recordings_fts(rowid, id, name, description)
          VALUES (new.rowid, new.id, new.name, COALESCE(new.description, ''));
        END;

        CREATE TRIGGER recordings_fts_delete AFTER DELETE ON recordings BEGIN
          DELETE FROM recordings_fts WHERE rowid = old.rowid;
        END;

        CREATE TRIGGER recordings_fts_update AFTER UPDATE ON recordings BEGIN
          DELETE FROM recordings_fts WHERE rowid = old.rowid;
          INSERT INTO recordings_fts(rowid, id, name, description)
          VALUES (new.rowid, new.id, new.name, COALESCE(new.description, ''));
        END;
      `);

      console.log(
        '✅ Migrated to simplified schema (removed action_count, video_size, video_format, video_duration, tabs_json, metadata_json)'
      );
    },
    down: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE recordings_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at INTEGER NOT NULL,
          duration INTEGER NOT NULL,
          action_count INTEGER NOT NULL DEFAULT 0,
          
          video_path TEXT,
          video_size INTEGER,
          video_format TEXT,
          video_duration INTEGER,
          
          start_url TEXT,
          
          actions_json TEXT NOT NULL,
          tabs_json TEXT,
          metadata_json TEXT
        );

        INSERT INTO recordings_new (
          id, name, description, created_at, duration, action_count,
          video_path, start_url, actions_json
        )
        SELECT 
          id, 
          name, 
          description, 
          created_at, 
          duration,
          json_array_length(actions_json) as action_count,
          video_path,
          start_url,
          actions_json
        FROM recordings;

        DROP TRIGGER IF EXISTS recordings_fts_update;
        DROP TRIGGER IF EXISTS recordings_fts_delete;
        DROP TRIGGER IF EXISTS recordings_fts_insert;
        
        DROP TABLE recordings;
        
        ALTER TABLE recordings_new RENAME TO recordings;

        CREATE INDEX IF NOT EXISTS idx_created_at ON recordings(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_name ON recordings(name);
        CREATE INDEX IF NOT EXISTS idx_action_count ON recordings(action_count DESC);
        CREATE INDEX IF NOT EXISTS idx_duration ON recordings(duration DESC);
        CREATE INDEX IF NOT EXISTS idx_video_path ON recordings(video_path);

        DROP TABLE IF EXISTS recordings_fts;
        
        CREATE VIRTUAL TABLE recordings_fts USING fts5(
          id UNINDEXED,
          name,
          description,
          content='recordings',
          content_rowid='rowid'
        );

        INSERT INTO recordings_fts(rowid, id, name, description)
        SELECT rowid, id, name, COALESCE(description, '') FROM recordings;

        CREATE TRIGGER recordings_fts_insert AFTER INSERT ON recordings BEGIN
          INSERT INTO recordings_fts(rowid, id, name, description)
          VALUES (new.rowid, new.id, new.name, COALESCE(new.description, ''));
        END;

        CREATE TRIGGER recordings_fts_delete AFTER DELETE ON recordings BEGIN
          DELETE FROM recordings_fts WHERE rowid = old.rowid;
        END;

        CREATE TRIGGER recordings_fts_update AFTER UPDATE ON recordings BEGIN
          DELETE FROM recordings_fts WHERE rowid = old.rowid;
          INSERT INTO recordings_fts(rowid, id, name, description)
          VALUES (new.rowid, new.id, new.name, COALESCE(new.description, ''));
        END;
      `);
    },
  },
];
