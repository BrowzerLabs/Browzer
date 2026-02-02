import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

import log from 'electron-log';
import psl from 'psl';

import { CryptoService } from './CryptoService';
import { SecureStorage } from './SecureStorage';

import {
  PasswordCredential,
  PasswordFormData,
  PasswordSuggestion,
} from '@/shared/types/password';

export class PasswordService extends EventEmitter {
  private storage: SecureStorage;
  private crypto: CryptoService;
  private isReady = false;

  constructor() {
    super();
    this.crypto = CryptoService.getInstance();
    this.storage = new SecureStorage();
    this.initialize().catch((error) => {
      log.error('[PasswordService] Initialization failed:', error);
    });
  }

  public async initialize(): Promise<boolean> {
    try {
      const cryptoReady = await this.crypto.initialize();
      if (!cryptoReady) {
        log.error('[PasswordService] Failed to initialize crypto service');
        return false;
      }

      this.isReady = true;
      log.info('[PasswordService] Initialized with secure encryption');
      return true;
    } catch (error) {
      log.error('[PasswordService] Initialization failed:', error);
      return false;
    }
  }

  private ensureReady(): void {
    if (!this.isReady) {
      throw new Error(
        'PasswordService not initialized. Call initialize() first.'
      );
    }
  }

  public async saveCredential(
    formData: PasswordFormData
  ): Promise<PasswordCredential> {
    this.ensureReady();

    const existingCredential = this.findExactMatch(
      formData.url,
      formData.username
    );

    if (existingCredential) {
      return this.updateCredential(existingCredential.id, {
        password: formData.password,
        usernameField: formData.usernameField,
        passwordField: formData.passwordField,
      });
    }

    const credential: PasswordCredential = {
      id: randomUUID(),
      url: formData.url,
      hostname: formData.hostname,
      username: formData.username,
      password: formData.password,
      usernameField: formData.usernameField,
      passwordField: formData.passwordField,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      timesUsed: 0,
    };

    this.storage.saveCredential(credential);
    this.emit('credential:saved', credential);

    return credential;
  }

  public updateCredential(
    id: string,
    updates: Partial<
      Pick<
        PasswordCredential,
        'password' | 'username' | 'usernameField' | 'passwordField'
      >
    >
  ): PasswordCredential {
    this.ensureReady();

    const credential = this.storage.getCredential(id);
    if (!credential) {
      throw new Error(`Credential not found: ${id}`);
    }

    const success = this.storage.updateCredential(id, updates);
    if (!success) {
      throw new Error(`Failed to update credential: ${id}`);
    }

    const updated = this.storage.getCredential(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated credential: ${id}`);
    }

    this.emit('credential:updated', updated);
    return updated;
  }

  public deleteCredential(id: string): boolean {
    this.ensureReady();

    const success = this.storage.deleteCredential(id);
    if (success) {
      this.emit('credential:deleted', id);
    }
    return success;
  }

  public getCredential(id: string): PasswordCredential | null {
    this.ensureReady();
    return this.storage.getCredential(id);
  }

  public getAllCredentials(): PasswordCredential[] {
    this.ensureReady();
    return this.storage.getAllCredentials();
  }

  public getSuggestionsForUrl(url: string): PasswordSuggestion[] {
    this.ensureReady();

    const suggestions: PasswordSuggestion[] = [];

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const domain = this.extractDomain(hostname);

      const allCredentials = this.storage.getAllCredentials();

      for (const credential of allCredentials) {
        try {
          const credHostname = credential.hostname;
          const credDomain = this.extractDomain(credHostname);

          if (credHostname === hostname) {
            suggestions.push({
              credential,
              matchType: 'exact',
            });
          } else if (
            credHostname.endsWith(`.${hostname}`) ||
            hostname.endsWith(`.${credHostname}`)
          ) {
            suggestions.push({
              credential,
              matchType: 'subdomain',
            });
          } else if (credDomain === domain && domain !== '') {
            suggestions.push({
              credential,
              matchType: 'domain',
            });
          }
        } catch (error) {
          log.error(
            `[PasswordService] Failed to process credential ${credential.id} in suggestions:`,
            error
          );
        }
      }

      suggestions.sort((a, b) => {
        const matchOrder = { exact: 0, subdomain: 1, domain: 2 };
        const matchDiff = matchOrder[a.matchType] - matchOrder[b.matchType];
        if (matchDiff !== 0) return matchDiff;

        return (b.credential.lastUsed || 0) - (a.credential.lastUsed || 0);
      });

      return suggestions;
    } catch (error) {
      log.error('[PasswordService] Error getting suggestions:', error);
      return [];
    }
  }

  public markCredentialUsed(id: string): void {
    this.ensureReady();
    this.storage.markCredentialUsed(id);
  }

  private findExactMatch(
    url: string,
    username: string
  ): PasswordCredential | null {
    this.ensureReady();

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      return this.storage.findExactMatch(hostname, username);
    } catch (error) {
      log.error('[PasswordService] Error finding exact match:', error);
      return null;
    }
  }

  private extractDomain(hostname: string): string {
    const parsed = psl.parse(hostname);
    if (parsed.error) {
      log.error('Error parsing domain:', parsed.error);
      return hostname;
    }
    return parsed.domain || hostname;
  }

  public searchCredentials(query: string): PasswordCredential[] {
    this.ensureReady();
    return this.storage.searchCredentials(query);
  }

  public exportCredentials(): PasswordCredential[] {
    this.ensureReady();
    return this.getAllCredentials();
  }

  public async importCredentials(
    credentials: PasswordCredential[]
  ): Promise<number> {
    this.ensureReady();

    let imported = 0;

    for (const cred of credentials) {
      try {
        await this.saveCredential({
          url: cred.url,
          hostname: cred.hostname,
          username: cred.username,
          password: cred.password,
          usernameField: cred.usernameField,
          passwordField: cred.passwordField,
        });
        imported++;
      } catch (error) {
        log.error('[PasswordService] Error importing credential:', error);
      }
    }

    return imported;
  }

  public clearAllCredentials(): void {
    this.ensureReady();
    this.storage.clearAllCredentials();
    this.emit('credentials:cleared');
  }

  public async reEncryptAllCredentials(): Promise<number> {
    this.ensureReady();

    try {
      const count = await this.storage.reEncryptAllCredentials();
      log.info(`[PasswordService] Re-encrypted ${count} credentials`);
      return count;
    } catch (error) {
      log.error('[PasswordService] Failed to re-encrypt credentials:', error);
      throw error;
    }
  }

  public close(): void {
    this.storage.close();
  }
}
