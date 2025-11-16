import Store from 'electron-store';
import { randomUUID } from 'crypto';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { machineIdSync } from 'node-machine-id';
import { app } from 'electron';

/**
 * Saved credential interface
 */
export interface SavedCredential {
  id: string;
  origin: string;
  username: string;
  encryptedPassword: string; // Changed from Buffer to string (base64)
  lastUsed: number;
  timesUsed: number;
  createdAt: number;
}

/**
 * Credential info for IPC (without encrypted buffer)
 */
export interface CredentialInfo {
  id: string;
  origin: string;
  username: string;
  lastUsed: number;
  timesUsed: number;
}

/**
 * Password manager schema
 */
interface PasswordStore {
  credentials: SavedCredential[];
  blacklistedSites: string[];
}

/**
 * PasswordManager - Secure password storage using AES-256-GCM encryption
 * No keychain dialog required - uses machine-specific key derivation
 * Follows the same pattern as TokenManager
 */
export class PasswordManager {
  private store: Store<PasswordStore>;
  private encryptionKey: Buffer;
  
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32;
  private readonly IV_LENGTH = 16;
  private readonly AUTH_TAG_LENGTH = 16;
  private readonly APP_CONTEXT = 'browzer-password-storage-v1';

  constructor() {
    this.store = new Store<PasswordStore>({
      name: 'passwords',
      defaults: {
        credentials: [],
        blacklistedSites: []
      }
    });

    this.encryptionKey = this.deriveEncryptionKey();
    console.log('[PasswordManager] Initialized with store at:', this.store.path);
  }

  /**
   * Derive encryption key from machine ID and installation salt
   * Same approach as TokenManager - no keychain dialog needed
   */
  private deriveEncryptionKey(): Buffer {
    try {
      let installationSalt = this.store.get('installation_salt') as string | undefined;
      
      if (!installationSalt) {
        // Generate a cryptographically random salt on first run
        installationSalt = randomBytes(32).toString('base64');
        this.store.set('installation_salt', installationSalt);
        console.log('[PasswordManager] Generated new installation salt');
      }

      // Combine multiple entropy sources
      const machineId = machineIdSync();
      const appPath = app.getAppPath();
      
      // Create composite key material
      // NOTE: Do NOT include app version here - it causes encryption to break during updates
      const keyMaterial = `${machineId}|${this.APP_CONTEXT}|${appPath}`;
      
      // Use scrypt for key derivation
      const derivedKey = scryptSync(
        keyMaterial,
        installationSalt,
        this.KEY_LENGTH,
        {
          N: 16384, // CPU/memory cost (higher = more secure but slower)
          r: 8,     // Block size
          p: 1,     // Parallelization
        }
      );
      
      return derivedKey;
    } catch (error) {
      console.error('[PasswordManager] Failed to derive encryption key:', error);
      // Fallback: generate random key (will lose passwords but prevents crashes)
      console.warn('[PasswordManager] Using fallback random key - passwords may be lost');
      return randomBytes(this.KEY_LENGTH);
    }
  }

  /**
   * Encrypt password using AES-256-GCM
   */
  private encrypt(plaintext: string): string {
    try {
      const iv = randomBytes(this.IV_LENGTH);
      const cipher = createCipheriv(this.ALGORITHM, this.encryptionKey, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      const authTag = cipher.getAuthTag();
      
      const combined = Buffer.concat([
        iv,
        Buffer.from(encrypted, 'base64'),
        authTag
      ]);
      
      return combined.toString('base64');
    } catch (error) {
      console.error('[PasswordManager] Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt password using AES-256-GCM
   */
  private decrypt(ciphertext: string): string {
    try {
      const combined = Buffer.from(ciphertext, 'base64');
      
      const iv = combined.subarray(0, this.IV_LENGTH);
      const authTag = combined.subarray(combined.length - this.AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(this.IV_LENGTH, combined.length - this.AUTH_TAG_LENGTH);
      
      const decipher = createDecipheriv(this.ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('[PasswordManager] Decryption failed:', error);
      throw error;
    }
  }

  /**
   * Save a new credential
   */
  public async saveCredential(origin: string, username: string, password: string): Promise<boolean> {
    try {
      const credentials = this.store.get('credentials');
      
      // Check if credential already exists
      const existingIndex = credentials.findIndex(
        c => c.origin === origin && c.username === username
      );

      if (existingIndex !== -1) {
        // Update existing credential
        const encrypted = this.encrypt(password);
        credentials[existingIndex] = {
          ...credentials[existingIndex],
          encryptedPassword: encrypted,
          lastUsed: Date.now(),
          timesUsed: credentials[existingIndex].timesUsed + 1
        };
      } else {
        // Create new credential
        const encrypted = this.encrypt(password);
        const credential: SavedCredential = {
          id: randomUUID(),
          origin,
          username,
          encryptedPassword: encrypted,
          lastUsed: Date.now(),
          timesUsed: 1,
          createdAt: Date.now()
        };
        
        credentials.push(credential);
      }

      this.store.set('credentials', credentials);
      console.log(`[PasswordManager] Saved credential for ${username} at ${origin}`);
      return true;
    } catch (error) {
      console.error('[PasswordManager] Failed to save credential:', error);
      return false;
    }
  }

  /**
   * Get credentials for a specific origin
   */
  public getCredentialsForOrigin(origin: string): CredentialInfo[] {
    const credentials = this.store.get('credentials');
    
    return credentials
      .filter(c => c.origin === origin)
      .sort((a, b) => b.lastUsed - a.lastUsed) // Most recently used first
      .map(c => ({
        id: c.id,
        origin: c.origin,
        username: c.username,
        lastUsed: c.lastUsed,
        timesUsed: c.timesUsed
      }));
  }

  /**
   * Get decrypted password for a credential
   */
  public getPassword(credentialId: string): string | null {
    try {
      const credentials = this.store.get('credentials');
      const credential = credentials.find(c => c.id === credentialId);
      
      if (!credential) {
        return null;
      }

      const decrypted = this.decrypt(credential.encryptedPassword);
      
      // Update usage stats
      const updatedCredentials = credentials.map(c => 
        c.id === credentialId 
          ? { ...c, lastUsed: Date.now(), timesUsed: c.timesUsed + 1 }
          : c
      );
      this.store.set('credentials', updatedCredentials);
      
      return decrypted;
    } catch (error) {
      console.error('[PasswordManager] Failed to decrypt password:', error);
      return null;
    }
  }

  /**
   * Delete a credential
   */
  public deleteCredential(credentialId: string): boolean {
    try {
      const credentials = this.store.get('credentials');
      const filteredCredentials = credentials.filter(c => c.id !== credentialId);
      
      if (filteredCredentials.length < credentials.length) {
        this.store.set('credentials', filteredCredentials);
        console.log(`[PasswordManager] Deleted credential ${credentialId}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[PasswordManager] Failed to delete credential:', error);
      return false;
    }
  }

  /**
   * Add origin to blacklist (user clicked "Never")
   */
  public addToBlacklist(origin: string): void {
    const blacklistedSites = this.store.get('blacklistedSites');
    if (!blacklistedSites.includes(origin)) {
      blacklistedSites.push(origin);
      this.store.set('blacklistedSites', blacklistedSites);
      console.log(`[PasswordManager] Added ${origin} to blacklist`);
    }
  }

  /**
   * Check if origin is blacklisted
   */
  public isBlacklisted(origin: string): boolean {
    const blacklistedSites = this.store.get('blacklistedSites');
    return blacklistedSites.includes(origin);
  }

  /**
   * Get all credentials (for management UI)
   */
  public getAllCredentials(): CredentialInfo[] {
    const credentials = this.store.get('credentials');
    return credentials
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .map(c => ({
        id: c.id,
        origin: c.origin,
        username: c.username,
        lastUsed: c.lastUsed,
        timesUsed: c.timesUsed
      }));
  }

  /**
   * Update an existing credential
   */
  public async updateCredential(credentialId: string, username: string, password: string): Promise<boolean> {
    try {
      const credentials = this.store.get('credentials');
      const index = credentials.findIndex(c => c.id === credentialId);
      
      if (index === -1) {
        return false;
      }

      const encrypted = this.encrypt(password);
      credentials[index] = {
        ...credentials[index],
        username,
        encryptedPassword: encrypted,
        lastUsed: Date.now()
      };

      this.store.set('credentials', credentials);
      console.log(`[PasswordManager] Updated credential ${credentialId}`);
      return true;
    } catch (error) {
      console.error('[PasswordManager] Failed to update credential:', error);
      return false;
    }
  }

  /**
   * Delete multiple credentials
   */
  public deleteMultipleCredentials(credentialIds: string[]): boolean {
    try {
      const credentials = this.store.get('credentials');
      const filteredCredentials = credentials.filter(c => !credentialIds.includes(c.id));
      
      this.store.set('credentials', filteredCredentials);
      console.log(`[PasswordManager] Deleted ${credentials.length - filteredCredentials.length} credentials`);
      return true;
    } catch (error) {
      console.error('[PasswordManager] Failed to delete credentials:', error);
      return false;
    }
  }

  /**
   * Search credentials by origin or username
   */
  public searchCredentials(query: string): CredentialInfo[] {
    const credentials = this.store.get('credentials');
    const lowerQuery = query.toLowerCase();
    
    return credentials
      .filter(c => 
        c.origin.toLowerCase().includes(lowerQuery) ||
        c.username.toLowerCase().includes(lowerQuery)
      )
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .map(c => ({
        id: c.id,
        origin: c.origin,
        username: c.username,
        lastUsed: c.lastUsed,
        timesUsed: c.timesUsed
      }));
  }

  /**
   * Get blacklist
   */
  public getBlacklist(): string[] {
    return this.store.get('blacklistedSites');
  }

  /**
   * Remove origin from blacklist
   */
  public removeFromBlacklist(origin: string): void {
    const blacklistedSites = this.store.get('blacklistedSites');
    const filtered = blacklistedSites.filter(site => site !== origin);
    this.store.set('blacklistedSites', filtered);
    console.log(`[PasswordManager] Removed ${origin} from blacklist`);
  }

  /**
   * Export passwords (without decryption - for backup)
   */
  public exportPasswords(): { credentials: CredentialInfo[]; blacklist: string[] } {
    const credentials = this.getAllCredentials();
    const blacklist = this.getBlacklist();
    
    return {
      credentials,
      blacklist
    };
  }

  /**
   * Import passwords
   */
  public async importPasswords(data: string): Promise<{ success: boolean; imported: number; errors: number }> {
    try {
      const parsed = JSON.parse(data);
      let imported = 0;
      let errors = 0;

      if (parsed.credentials && Array.isArray(parsed.credentials)) {
        for (const cred of parsed.credentials) {
          try {
            // Note: This assumes the import data has plain passwords
            // In a real scenario, you'd need to handle this differently
            if (cred.origin && cred.username && cred.password) {
              await this.saveCredential(cred.origin, cred.username, cred.password);
              imported++;
            }
          } catch (error) {
            errors++;
            console.error('[PasswordManager] Failed to import credential:', error);
          }
        }
      }

      if (parsed.blacklist && Array.isArray(parsed.blacklist)) {
        const currentBlacklist = this.getBlacklist();
        const newBlacklist = [...new Set([...currentBlacklist, ...parsed.blacklist])];
        this.store.set('blacklistedSites', newBlacklist);
      }

      return { success: true, imported, errors };
    } catch (error) {
      console.error('[PasswordManager] Failed to import passwords:', error);
      return { success: false, imported: 0, errors: 1 };
    }
  }

  /**
   * Get password manager statistics
   */
  public getStats(): {
    totalPasswords: number;
    blacklistedSites: number;
    mostUsedSites: Array<{ origin: string; count: number }>;
  } {
    const credentials = this.store.get('credentials');
    const blacklistedSites = this.store.get('blacklistedSites');

    // Calculate most used sites
    const siteUsage = new Map<string, number>();
    credentials.forEach(cred => {
      const current = siteUsage.get(cred.origin) || 0;
      siteUsage.set(cred.origin, current + cred.timesUsed);
    });

    const mostUsedSites = Array.from(siteUsage.entries())
      .map(([origin, count]) => ({ origin, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalPasswords: credentials.length,
      blacklistedSites: blacklistedSites.length,
      mostUsedSites
    };
  }

  /**
   * Get storage path for debugging
   */
  public getStorePath(): string {
    return this.store.path;
  }
}
