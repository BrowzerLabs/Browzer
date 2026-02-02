import { join } from 'path';
import { app } from 'electron';

import Database from 'better-sqlite3';
import log from 'electron-log';

import { CryptoService } from './CryptoService';

import { PasswordCredential } from '@/shared/types/password';

export class SecureStorage {
  private db: Database.Database;
  private crypto: CryptoService;

  constructor() {
    const dbPath = join(app.getPath('userData'), 'credentials.db');
    this.db = new Database(dbPath);
    this.crypto = CryptoService.getInstance();
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        hostname TEXT NOT NULL,
        username TEXT NOT NULL,
        encrypted_password BLOB NOT NULL,
        username_field TEXT,
        password_field TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_used INTEGER,
        times_used INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_hostname ON credentials(hostname);
      CREATE INDEX IF NOT EXISTS idx_username ON credentials(username);
      CREATE INDEX IF NOT EXISTS idx_url ON credentials(url);
      CREATE INDEX IF NOT EXISTS idx_last_used ON credentials(last_used);
    `);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.pragma('foreign_keys = ON');

    log.info('[SecureStorage] Database initialized');
  }

  public saveCredential(credential: PasswordCredential): void {
    if (!this.crypto.isReady()) {
      throw new Error('Crypto service not ready');
    }

    try {
      const encryptedPassword = this.crypto.encrypt(credential.password);

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO credentials (
          id, url, hostname, username, encrypted_password,
          username_field, password_field, created_at, updated_at,
          last_used, times_used, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      stmt.run(
        credential.id,
        credential.url,
        credential.hostname,
        credential.username,
        Buffer.from(encryptedPassword, 'base64'),
        credential.usernameField || null,
        credential.passwordField || null,
        credential.createdAt,
        credential.updatedAt,
        credential.lastUsed || null,
        credential.timesUsed
      );

      log.info(`[SecureStorage] Saved credential for ${credential.hostname}`);
    } catch (error) {
      log.error('[SecureStorage] Failed to save credential:', error);
      throw error;
    }
  }

  public getCredential(id: string): PasswordCredential | null {
    if (!this.crypto.isReady()) {
      throw new Error('Crypto service not ready');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM credentials WHERE id = ?
      `);

      const row = stmt.get(id) as any;

      if (!row) {
        return null;
      }

      return this.decryptCredential(row);
    } catch (error) {
      log.error('[SecureStorage] Failed to get credential:', error);
      return null;
    }
  }

  public getAllCredentials(): PasswordCredential[] {
    if (!this.crypto.isReady()) {
      throw new Error('Crypto service not ready');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM credentials ORDER BY last_used DESC, updated_at DESC
      `);

      const rows = stmt.all() as any[];
      const credentials: PasswordCredential[] = [];

      for (const row of rows) {
        try {
          const credential = this.decryptCredential(row);
          credentials.push(credential);
        } catch (error) {
          log.error(
            `[SecureStorage] Failed to decrypt credential ${row.id}:`,
            error
          );
        }
      }

      return credentials;
    } catch (error) {
      log.error('[SecureStorage] Failed to get all credentials:', error);
      return [];
    }
  }

  public getCredentialsByHostname(hostname: string): PasswordCredential[] {
    if (!this.crypto.isReady()) {
      throw new Error('Crypto service not ready');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM credentials 
        WHERE hostname = ? 
        ORDER BY last_used DESC, times_used DESC
      `);

      const rows = stmt.all(hostname) as any[];
      const credentials: PasswordCredential[] = [];

      for (const row of rows) {
        try {
          const credential = this.decryptCredential(row);
          credentials.push(credential);
        } catch (error) {
          log.error(
            `[SecureStorage] Failed to decrypt credential ${row.id}:`,
            error
          );
        }
      }

      return credentials;
    } catch (error) {
      log.error(
        '[SecureStorage] Failed to get credentials by hostname:',
        error
      );
      return [];
    }
  }

  public searchCredentials(query: string): PasswordCredential[] {
    if (!this.crypto.isReady()) {
      throw new Error('Crypto service not ready');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM credentials 
        WHERE hostname LIKE ? OR username LIKE ? OR url LIKE ?
        ORDER BY last_used DESC, times_used DESC
        LIMIT 50
      `);

      const searchPattern = `%${query}%`;
      const rows = stmt.all(
        searchPattern,
        searchPattern,
        searchPattern
      ) as any[];
      const credentials: PasswordCredential[] = [];

      for (const row of rows) {
        try {
          const credential = this.decryptCredential(row);
          credentials.push(credential);
        } catch (error) {
          log.error(
            `[SecureStorage] Failed to decrypt credential ${row.id}:`,
            error
          );
        }
      }

      return credentials;
    } catch (error) {
      log.error('[SecureStorage] Failed to search credentials:', error);
      return [];
    }
  }

  public updateCredential(
    id: string,
    updates: Partial<PasswordCredential>
  ): boolean {
    if (!this.crypto.isReady()) {
      throw new Error('Crypto service not ready');
    }

    try {
      const existing = this.getCredential(id);
      if (!existing) {
        return false;
      }

      const fields: string[] = [];
      const values: any[] = [];

      if (updates.password !== undefined) {
        fields.push('encrypted_password = ?');
        values.push(
          Buffer.from(this.crypto.encrypt(updates.password), 'base64')
        );
      }
      if (updates.username !== undefined) {
        fields.push('username = ?');
        values.push(updates.username);
      }
      if (updates.usernameField !== undefined) {
        fields.push('username_field = ?');
        values.push(updates.usernameField);
      }
      if (updates.passwordField !== undefined) {
        fields.push('password_field = ?');
        values.push(updates.passwordField);
      }

      fields.push('updated_at = ?');
      values.push(Date.now());

      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE credentials SET ${fields.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);
      return true;
    } catch (error) {
      log.error('[SecureStorage] Failed to update credential:', error);
      return false;
    }
  }

  public deleteCredential(id: string): boolean {
    try {
      const stmt = this.db.prepare('DELETE FROM credentials WHERE id = ?');
      const result = stmt.run(id);
      return result.changes > 0;
    } catch (error) {
      log.error('[SecureStorage] Failed to delete credential:', error);
      return false;
    }
  }

  public markCredentialUsed(id: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE credentials 
        SET last_used = ?, times_used = times_used + 1 
        WHERE id = ?
      `);
      stmt.run(Date.now(), id);
    } catch (error) {
      log.error('[SecureStorage] Failed to mark credential as used:', error);
    }
  }

  public clearAllCredentials(): void {
    try {
      this.db.exec('DELETE FROM credentials');
      log.info('[SecureStorage] All credentials cleared');
    } catch (error) {
      log.error('[SecureStorage] Failed to clear credentials:', error);
      throw error;
    }
  }

  public findExactMatch(
    hostname: string,
    username: string
  ): PasswordCredential | null {
    if (!this.crypto.isReady()) {
      throw new Error('Crypto service not ready');
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM credentials 
        WHERE hostname = ? AND username = ?
        LIMIT 1
      `);

      const row = stmt.get(hostname, username) as any;

      if (!row) {
        return null;
      }

      return this.decryptCredential(row);
    } catch (error) {
      log.error('[SecureStorage] Failed to find exact match:', error);
      return null;
    }
  }

  private decryptCredential(row: any): PasswordCredential {
    const encryptedPassword = row.encrypted_password.toString('base64');
    const decryptedPassword = this.crypto.decrypt(encryptedPassword);

    return {
      id: row.id,
      url: row.url,
      hostname: row.hostname,
      username: row.username,
      password: decryptedPassword,
      usernameField: row.username_field,
      passwordField: row.password_field,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsed: row.last_used,
      timesUsed: row.times_used,
    };
  }

  public close(): void {
    this.db.close();
  }

  public async reEncryptAllCredentials(): Promise<number> {
    if (!this.crypto.isReady()) {
      throw new Error('Crypto service not ready');
    }

    try {
      const credentials = this.getAllCredentials();
      let reEncrypted = 0;

      for (const credential of credentials) {
        try {
          const encryptedPassword = this.crypto.encrypt(credential.password);
          const stmt = this.db.prepare(`
            UPDATE credentials 
            SET encrypted_password = ?, version = version + 1 
            WHERE id = ?
          `);
          stmt.run(Buffer.from(encryptedPassword, 'base64'), credential.id);
          reEncrypted++;
        } catch (error) {
          log.error(
            `[SecureStorage] Failed to re-encrypt credential ${credential.id}:`,
            error
          );
        }
      }

      log.info(`[SecureStorage] Re-encrypted ${reEncrypted} credentials`);
      return reEncrypted;
    } catch (error) {
      log.error('[SecureStorage] Failed to re-encrypt credentials:', error);
      throw error;
    }
  }
}
