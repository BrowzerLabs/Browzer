/**
 * TokenManager - Centralized secure token storage and management
 * 
 * Uses Electron's safeStorage API for OS-level encryption:
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: libsecret
 * 
 * Provides singleton access to tokens without callback dependencies
 * Stores only tokens securely, not the full session with user data
 */

import { safeStorage, app } from 'electron';
import Store from 'electron-store';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export class TokenManager {
  private static instance: TokenManager | null = null;
  private store: Store;
  private cachedTokens: TokenData | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<boolean> | null = null;

  private constructor() {
    // Use electron-store only for non-sensitive metadata
    this.store = new Store({
      name: 'auth-metadata',
    });
  }

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  /**
   * Save tokens securely using safeStorage
   */
  public saveTokens(accessToken: string, refreshToken: string, expiresAt: number): void {
    if (!safeStorage.isEncryptionAvailable()) {
      console.error('[TokenManager] Encryption not available, falling back to unencrypted storage');
      // Fallback: store in plain text (not recommended for production)
      const tokenData: TokenData = { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt };
      this.store.set('tokens_fallback', tokenData);
      this.cachedTokens = tokenData;
      this.scheduleTokenRefresh(expiresAt);
      return;
    }

    try {
      const tokenData: TokenData = {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
      };

      // Encrypt and store tokens
      const encrypted = safeStorage.encryptString(JSON.stringify(tokenData));
      this.store.set('encrypted_tokens', encrypted.toString('base64'));

      // Store non-sensitive metadata
      this.store.set('token_metadata', {
        expires_at: expiresAt,
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
      const encryptedBase64 = this.store.get('encrypted_tokens') as string | undefined;
      
      if (!encryptedBase64) {
        const fallbackTokens = this.store.get('tokens_fallback') as TokenData | undefined;
        if (fallbackTokens) {
          this.cachedTokens = fallbackTokens;
          return fallbackTokens;
        }
        return null;
      }

      if (!safeStorage.isEncryptionAvailable()) {
        console.error('[TokenManager] Cannot decrypt: encryption not available');
        return null;
      }

      const encrypted = Buffer.from(encryptedBase64, 'base64');
      const decrypted = safeStorage.decryptString(encrypted);
      const tokenData: TokenData = JSON.parse(decrypted);

      this.cachedTokens = tokenData;
      return tokenData;
    } catch (error) {
      console.error('[TokenManager] Failed to get tokens:', error);
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
    
    return expiresIn < 300;
  }

  public clearTokens(): void {
    this.cachedTokens = null;
    this.store.delete('encrypted_tokens');
    this.store.delete('token_metadata');
    this.store.delete('tokens_fallback');
    this.cancelTokenRefresh();
    console.log('[TokenManager] Tokens cleared');
  }

  async restoreTokens(): Promise<void> {
    try {
      const tokens = this.getStoredTokens();
      if (tokens) {
        if (!this.isTokenExpired()) {
          this.scheduleTokenRefresh(tokens.expires_at);
          console.log('[TokenManager] Tokens restored');
        } else {
          console.log('[TokenManager] Stored tokens expired');
          this.clearTokens();
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
        console.log(`[TokenManager] Token refresh scheduled in ${Math.floor(expiresIn / 1000 / 60)} minutes`);
        this.refreshTimer = setTimeout(() => {
          console.log('[TokenManager] Token refresh triggered');
          app.emit('token-refresh-needed');
        }, expiresIn);
      } else {
        console.log('[TokenManager] Token already expired or expiring soon');
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
  }
}

// Export singleton instance
export const tokenManager = TokenManager.getInstance();
