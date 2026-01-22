import { app } from 'electron';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
  scryptSync,
} from 'crypto';
import { EventEmitter } from 'events';

import Store from 'electron-store';
import { machineIdSync } from 'node-machine-id';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export class TokenManager extends EventEmitter {
  private static instance: TokenManager | null = null;
  private store: Store;
  private cachedTokens: TokenData | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;
  private encryptionKey: Buffer;

  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly KEY_LENGTH = 32;
  private readonly IV_LENGTH = 16;
  private readonly AUTH_TAG_LENGTH = 16;

  private readonly APP_CONTEXT = 'browzer-token-storage-v1';

  private constructor() {
    super();
    this.store = new Store({
      name: 'browzer',
      encryptionKey: 'browzer-store-encryption-key',
    });

    this.encryptionKey = this.deriveEncryptionKey();
  }

  private deriveEncryptionKey(): Buffer {
    try {
      let installationSalt = this.store.get('installation_salt') as
        | string
        | undefined;

      if (!installationSalt) {
        // Generate a cryptographically random salt on first run
        installationSalt = randomBytes(32).toString('base64');
        this.store.set('installation_salt', installationSalt);
        console.log('[TokenManager] Generated new installation salt');
      }

      // Combine multiple entropy sources
      const machineId = machineIdSync();
      const appPath = app.getAppPath();

      // Create composite key material
      // NOTE: Do NOT include app version here - it causes encryption to break during updates
      const keyMaterial = `${machineId}|${this.APP_CONTEXT}|${appPath}`;

      // Use scrypt
      const derivedKey = scryptSync(
        keyMaterial,
        installationSalt,
        this.KEY_LENGTH,
        {
          N: 16384, // CPU/memory cost (higher = more secure but slower)
          r: 8, // Block size
          p: 1, // Parallelization
        }
      );

      return derivedKey;
    } catch (error) {
      console.error('[TokenManager] Failed to derive encryption key:', error);
      // Fallback: generate random key (will lose tokens but prevents crashes)
      console.warn(
        '[TokenManager] Using fallback random key - tokens may be lost'
      );
      return randomBytes(this.KEY_LENGTH);
    }
  }

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
        authTag,
      ]);

      return combined.toString('base64');
    } catch (error) {
      console.error('[TokenManager] Encryption failed:', error);
      throw error;
    }
  }

  private decrypt(ciphertext: string): string {
    try {
      const combined = Buffer.from(ciphertext, 'base64');

      const iv = combined.subarray(0, this.IV_LENGTH);
      const authTag = combined.subarray(combined.length - this.AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(
        this.IV_LENGTH,
        combined.length - this.AUTH_TAG_LENGTH
      );

      const decipher = createDecipheriv(this.ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(
        encrypted.toString('base64'),
        'base64',
        'utf8'
      );
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('[TokenManager] Decryption failed:', error);
      throw error;
    }
  }

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  public saveTokens(
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): void {
    try {
      const tokenData: TokenData = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
      };

      const encrypted = this.encrypt(JSON.stringify(tokenData));
      this.store.set('encrypted_tokens', encrypted);

      this.store.set('token_metadata', {
        expires_at: expiresAt,
        last_updated: Date.now(),
      });

      this.cachedTokens = tokenData;
      this.scheduleTokenRefresh(expiresAt);

      console.log('[TokenManager] Tokens saved securely');
    } catch (error) {
      console.error('[TokenManager] Failed to save tokens:', error);
      throw error;
    }
  }

  private getStoredTokens(): TokenData | null {
    if (this.cachedTokens) {
      return this.cachedTokens;
    }

    try {
      const encrypted = this.store.get('encrypted_tokens') as
        | string
        | undefined;

      if (!encrypted) {
        return null;
      }

      const decrypted = this.decrypt(encrypted);
      const tokenData: TokenData = JSON.parse(decrypted);

      // Validate token structure
      if (
        !tokenData.access_token ||
        !tokenData.refresh_token ||
        !tokenData.expires_at
      ) {
        console.error('[TokenManager] Invalid token data structure');
        return null;
      }

      this.cachedTokens = tokenData;
      return tokenData;
    } catch (error) {
      console.error('[TokenManager] Failed to get tokens:', error);
      this.clearTokens();
      return null;
    }
  }

  public getAccessToken(): string | null {
    const tokens = this.getStoredTokens();
    return tokens?.access_token ?? null;
  }

  public getRefreshToken(): string | null {
    const tokens = this.getStoredTokens();
    return tokens?.refresh_token ?? null;
  }

  public getExpiresAt(): number | null {
    const tokens = this.getStoredTokens();
    return tokens?.expires_at ?? null;
  }

  public isTokenExpired(): boolean {
    const tokens = this.getStoredTokens();
    if (!tokens || !tokens.expires_at) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = tokens.expires_at - now;

    // Token is expired if it expires in less than 5 minutes OR already expired
    return expiresIn < 300;
  }

  public isTokenAlreadyExpired(): boolean {
    const tokens = this.getStoredTokens();
    if (!tokens || !tokens.expires_at) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return tokens.expires_at <= now;
  }

  public clearTokens(): void {
    this.cachedTokens = null;
    this.store.delete('encrypted_tokens');
    this.store.delete('token_metadata');
    this.cancelTokenRefresh();
    console.log('[TokenManager] Tokens cleared');
  }

  /**
   * Clears tokens and resets the installation
   * Use this for complete reset (e.g., logout + remove device trust)
   */
  public resetInstallation(): void {
    this.clearTokens();
    this.store.delete('installation_salt');
    console.log('[TokenManager] Installation reset');
  }

  async restoreTokens(): Promise<void> {
    try {
      const tokens = this.getStoredTokens();
      if (tokens) {
        if (!this.isTokenExpired()) {
          this.scheduleTokenRefresh(tokens.expires_at);
          console.log('[TokenManager] Tokens restored');
        } else {
          console.log(
            '[TokenManager] Stored tokens expired, but refresh token available - will attempt refresh'
          );
          // Don't clear yet - let the caller attempt refresh
          // Emit event to trigger refresh attempt
          this.emit('token-refresh-needed');
        }
      }
    } catch (error) {
      console.error('[TokenManager] Failed to restore tokens:', error);
      this.clearTokens();
    }
  }

  private scheduleTokenRefresh(expiresAt: number): void {
    this.cancelTokenRefresh();

    if (expiresAt) {
      const expiresIn = expiresAt * 1000 - Date.now() - 5 * 60 * 1000;

      if (expiresIn > 0) {
        console.log(
          `[TokenManager] Token refresh scheduled in ${Math.floor(expiresIn / 1000 / 60)} minutes`
        );
        this.refreshTimer = setTimeout(() => {
          console.log('[TokenManager] Token refresh triggered');
          this.emit('token-refresh-needed');
        }, expiresIn);
      } else {
        console.log('[TokenManager] Token already expired or expiring soon');
        this.emit('token-refresh-needed');
      }
    }
  }

  private cancelTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  public setRefreshing(promise: Promise<boolean>): void {
    this.isRefreshing = true;
    this.refreshPromise = promise;

    promise.finally(() => {
      this.isRefreshing = false;
      this.refreshPromise = null;
    });
  }

  public isRefreshInProgress(): boolean {
    return this.isRefreshing;
  }

  public async waitForRefresh(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    return false;
  }

  public destroy(): void {
    this.cancelTokenRefresh();
    this.cachedTokens = null;
  }
}

// Export singleton instance
export const tokenManager = TokenManager.getInstance();
