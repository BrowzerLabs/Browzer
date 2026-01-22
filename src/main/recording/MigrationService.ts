import { copyFileSync } from 'fs';

import Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
  down?: (db: Database.Database) => void;
}

export class MigrationService {
  private db: Database.Database;
  private dbPath: string;

  constructor(db: Database.Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
    this.initializeMigrationTable();
  }

  private initializeMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);
  }

  private getCurrentVersion(): number {
    const row = this.db
      .prepare('SELECT MAX(version) as version FROM schema_migrations')
      .get() as { version: number | null };
    return row.version || 0;
  }

  private setVersion(version: number, name: string): void {
    this.db
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
      )
      .run(version, name, Date.now());
  }

  private createBackup(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = this.dbPath.replace('.db', `.backup-${timestamp}.db`);

    try {
      copyFileSync(this.dbPath, backupPath);
      console.log(`✅ Database backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw new Error('Failed to create database backup');
    }
  }

  migrateSync(migrations: Migration[]): void {
    const currentVersion = this.getCurrentVersion();
    const pendingMigrations = migrations
      .filter((m) => m.version > currentVersion)
      .sort((a, b) => a.version - b.version);

    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date (version:', currentVersion + ')');
      return;
    }

    console.log(
      `📦 Found ${pendingMigrations.length} pending migration(s) from version ${currentVersion}`
    );

    const backupPath = this.createBackup();

    const migrate = this.db.transaction(() => {
      for (const migration of pendingMigrations) {
        try {
          console.log(
            `⬆️  Applying migration ${migration.version}: ${migration.name}`
          );
          migration.up(this.db);
          this.setVersion(migration.version, migration.name);
          console.log(`✅ Migration ${migration.version} applied successfully`);
        } catch (error) {
          console.error(`❌ Migration ${migration.version} failed:`, error);
          throw error;
        }
      }
    });

    try {
      migrate();
      console.log(
        `✅ All migrations completed successfully. Current version: ${this.getCurrentVersion()}`
      );
    } catch (error) {
      console.error(
        '❌ Migration failed. Database backup available at:',
        backupPath
      );
      throw error;
    }
  }

  async migrate(migrations: Migration[]): Promise<void> {
    return Promise.resolve(this.migrateSync(migrations));
  }

  rollback(migrations: Migration[], targetVersion?: number): void {
    const currentVersion = this.getCurrentVersion();
    const target = targetVersion ?? currentVersion - 1;

    if (target >= currentVersion) {
      console.log('No rollback needed');
      return;
    }

    const migrationsToRollback = migrations
      .filter((m) => m.version > target && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version);

    if (migrationsToRollback.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    console.log(
      `Rolling back ${migrationsToRollback.length} migration(s) to version ${target}`
    );

    const backupPath = this.createBackup();

    const rollback = this.db.transaction(() => {
      for (const migration of migrationsToRollback) {
        if (!migration.down) {
          throw new Error(
            `Migration ${migration.version} does not have a down function`
          );
        }

        try {
          console.log(
            `⬇️  Rolling back migration ${migration.version}: ${migration.name}`
          );
          migration.down(this.db);
          this.db
            .prepare('DELETE FROM schema_migrations WHERE version = ?')
            .run(migration.version);
          console.log(
            `✅ Migration ${migration.version} rolled back successfully`
          );
        } catch (error) {
          console.error(
            `❌ Rollback of migration ${migration.version} failed:`,
            error
          );
          throw error;
        }
      }
    });

    try {
      rollback();
      console.log(
        `✅ Rollback completed successfully. Current version: ${this.getCurrentVersion()}`
      );
    } catch (error) {
      console.error(
        '❌ Rollback failed. Database backup available at:',
        backupPath
      );
      throw error;
    }
  }
}
