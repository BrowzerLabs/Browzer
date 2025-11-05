import { BrowserWindow, app } from 'electron';
import {
  User,
  AuthSession,
  AuthResponse,
  SignUpCredentials,
  SignInCredentials,
  UpdateProfileRequest,
  SimpleResponse,
} from '@/shared/types';
import { BrowserManager } from '@/main/BrowserManager';
import { api } from '@/main/api';
import { tokenManager } from './TokenManager';
import { ConnectionManager } from '@/main/api';

export class AuthService {
  private currentUser: User | null = null;
  private authWindow: BrowserWindow | null = null;
  private readonly browserManager: BrowserManager;
  private readonly connectionManager: ConnectionManager;

  constructor(
    browserManager: BrowserManager,
    connectionManager: ConnectionManager,
  ) {
    this.browserManager = browserManager;
    this.connectionManager = connectionManager;
    
    app.on('token-refresh-needed' as any, () => {
      this.handleTokenRefresh();
    });
  }

  async signUp(credentials: SignUpCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>(
        '/auth/signup',
        {
          email: credentials.email,
          password: credentials.password,
          display_name: credentials.display_name || null,
        }
      );

      if (!response.success) {
        return {
          success: false,
          error: {
            code: 'SIGNUP_FAILED',
            message: response.error || 'Sign up failed',
          },
        };
      }

      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'SIGNUP_EXCEPTION',
          message: error.message || 'An unexpected error occurred during sign up',
        },
      };
    }
  }

  async signIn(credentials: SignInCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>(
        '/auth/signin',
        {
          email: credentials.email,
          password: credentials.password,
        }
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          error: {
            code: 'SIGNIN_FAILED',
            message: response.error || 'Sign in failed',
          },
        };
      }

      const authResponse = response.data;

      // If sign in successful, persist session
      if (authResponse.success && authResponse.session) {
        await this.persistSession(authResponse.session);
      }

      return authResponse;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'SIGNIN_EXCEPTION',
          message: error.message || 'An unexpected error occurred during sign in',
        },
      };
    }
  }

  async signInWithGoogle(): Promise<AuthResponse> {
    try {
      const urlResponse = await api.post<{ success: boolean; url?: string; error?: string }>(
        '/auth/oauth/url',
        {
          provider: 'google',
          redirect_url: 'browzer://auth/callback',
        }
      );

      if (!urlResponse.success || !urlResponse.data || !urlResponse.data.url) {
        return {
          success: false,
          error: {
            code: 'OAUTH_URL_FAILED',
            message: urlResponse.error || 'Failed to get OAuth URL',
          },
        };
      }

      let oauthUrl = urlResponse.data.url;
      
      const urlObj = new URL(oauthUrl);
      urlObj.searchParams.set('prompt', 'select_account');
      oauthUrl = urlObj.toString();

      return new Promise((resolve) => {
        this.authWindow = new BrowserWindow({
          width: 500,
          height: 700,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
          title: 'Sign in with Google',
          modal: true,
          show: false,
        });

        this.authWindow.once('ready-to-show', () => {
          this.authWindow?.show();
        });

        this.authWindow.on('closed', () => {
          this.authWindow = null;
          resolve({
            success: false,
            error: {
              code: 'OAUTH_CANCELLED',
              message: 'OAuth window was closed',
            },
          });
        });

        this.authWindow.webContents.on('will-redirect', async (event, url) => {
          if (url.startsWith('browzer://')) {
            event.preventDefault(); // Prevent the redirect
            await this.handleOAuthCallback(url, resolve);
          }
        });

        this.authWindow.webContents.on('did-navigate', async (event, url) => {
          if (url.startsWith('browzer://')) {
            await this.handleOAuthCallback(url, resolve);
          }
        });
        this.authWindow.webContents.on('will-navigate', async (event, url) => {
          if (url.startsWith('browzer://')) {
            event.preventDefault();
            await this.handleOAuthCallback(url, resolve);
          }
        });

        this.authWindow.loadURL(oauthUrl);
      });
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'OAUTH_EXCEPTION',
          message: error.message || 'An unexpected error occurred during OAuth',
        },
      };
    }
  }

  private async handleOAuthCallback(
    url: string,
    resolve: (value: AuthResponse) => void
  ): Promise<void> {

    try {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      if (error) {
        this.authWindow?.close();
        this.authWindow = null;
        resolve({
          success: false,
          error: {
            code: 'OAUTH_ERROR',
            message: urlObj.searchParams.get('error_description') || error,
          },
        });
        return;
      }

      if (!code) {
        this.authWindow?.close();
        this.authWindow = null;
        resolve({
          success: false,
          error: {
            code: 'OAUTH_NO_CODE',
            message: 'No authorization code received',
          },
        });
        return;
      }

      const response = await api.post<AuthResponse>('/auth/oauth/callback', { code });

      if (!response.success || !response.data) {
        this.authWindow?.close();
        this.authWindow = null;
        resolve({
          success: false,
          error: {
            code: 'OAUTH_EXCHANGE_FAILED',
            message: response.error || 'Failed to exchange code for session',
          },
        });
        return;
      }

      const authResponse = response.data;

      if (authResponse.success && authResponse.session) {
        await this.persistSession(authResponse.session);
      }

      this.authWindow?.close();
      this.authWindow = null;
      resolve(authResponse);
    } catch (error: any) {
      this.authWindow?.close();
      this.authWindow = null;
      resolve({
        success: false,
        error: {
          code: 'OAUTH_CALLBACK_EXCEPTION',
          message: error.message || 'Error processing OAuth callback',
        },
      });
    }
  }

  async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const accessToken = tokenManager.getAccessToken();
      
      if (accessToken) {
        // Call backend signout endpoint
        await api.post<SimpleResponse>('/auth/signout');
      }

      this.clearSession();
      this.browserManager.destroy();

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'An unexpected error occurred during sign out',
      };
    }
  }

  async getCurrentSession(): Promise<AuthSession | null> {
    try {
      const accessToken = tokenManager.getAccessToken();
      
      if (!accessToken) {
        return null;
      }

      // Validate session with backend
      const user = await this.getCurrentUser();
      
      if (!user) {
        this.clearSession();
        return null;
      }

      // Reconstruct session from tokenManager and current user
      const refreshToken = tokenManager.getRefreshToken();
      const expiresAt = tokenManager.getExpiresAt();
      
      if (!refreshToken || !expiresAt) {
        return null;
      }

      return {
        user,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
      };
    } catch (error) {
      console.error('Error getting current session:', error);
      return null;
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      // Return cached user if available
      if (this.currentUser) {
        return this.currentUser;
      }

      const accessToken = tokenManager.getAccessToken();
      
      if (!accessToken) {
        return null;
      }

      const response = await api.get<AuthResponse>('/auth/user');

      if (!response.success || !response.data || !response.data.user) {
        return null;
      }

      this.currentUser = response.data.user;
      return response.data.user;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  async refreshSession(): Promise<boolean> {
    try {
      const refreshToken = tokenManager.getRefreshToken();
      
      if (!refreshToken) {
        console.error('[AuthService] No refresh token available');
        return false;
      }

      console.log('[AuthService] Refreshing session...');

      const response = await api.post<AuthResponse>(
        '/auth/refresh',
        {
          refresh_token: refreshToken,
        }
      );

      if (!response.success || !response.data) {
        console.error('[AuthService] Refresh failed:', response.error);
        this.clearSession();
        return false;
      }

      const authResponse = response.data;

      // Persist new session
      if (authResponse.success && authResponse.session) {
        await this.persistSession(authResponse.session);
        console.log('[AuthService] Session refreshed successfully');
        return true;
      }

      return false;
    } catch (error: any) {
      console.error('[AuthService] Refresh exception:', error);
      this.clearSession();
      return false;
    }
  }

  private async handleTokenRefresh(): Promise<void> {
    console.log('[AuthService] Automatic token refresh triggered');
    const success = await this.refreshSession();
    
    if (!success) {
      console.error('[AuthService] Automatic token refresh failed');
      // Optionally notify user that they need to sign in again
    }
  }

  async updateProfile(updates: UpdateProfileRequest): Promise<AuthResponse> {
    try {
      const response = await api.put<AuthResponse>(
        '/auth/profile',
        updates
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          error: {
            code: 'UPDATE_FAILED',
            message: response.error || 'Failed to update profile',
          },
        };
      }

      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'UPDATE_EXCEPTION',
          message: error.message || 'An unexpected error occurred during profile update',
        },
      };
    }
  }

  async verifyToken(tokenHash: string, type: string): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>(
        '/auth/verify-token',
        {
          token_hash: tokenHash,
          type,
        }
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          error: {
            code: 'VERIFY_FAILED',
            message: response.error || 'Verification failed',
          },
        };
      }

      const authResponse = response.data;

      // If verification successful, persist session
      if (authResponse.success && authResponse.session) {
        await this.persistSession(authResponse.session);
      }

      return authResponse;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'VERIFY_EXCEPTION',
          message: error.message || 'An unexpected error occurred during verification',
        },
      };
    }
  }

  async resendConfirmation(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await api.post<SimpleResponse>(
        '/auth/resend-confirmation',
        { email }
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to resend confirmation email',
        };
      }

      return {
        success: response.data.success,
        error: response.data.error || undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'An unexpected error occurred while resending confirmation',
      };
    }
  }

  async sendPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await api.post<SimpleResponse>(
        '/auth/password-reset',
        { email }
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          error: response.error || 'Failed to send reset link',
        };
      }

      return {
        success: response.data.success,
        error: response.data.error || undefined,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'An unexpected error occurred while sending reset link',
      };
    }
  }

  async updatePassword(
    newPassword: string,
    accessToken: string
  ): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>(
        '/auth/password-update',
        {
          new_password: newPassword,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.success || !response.data) {
        return {
          success: false,
          error: {
            code: 'UPDATE_FAILED',
            message: response.error || 'Password update failed',
          },
        };
      }

      const authResponse = response.data;

      // Note: User needs to sign in again after password reset
      // Don't persist session here

      return authResponse;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'UPDATE_EXCEPTION',
          message: error.message || 'An unexpected error occurred during password update',
        },
      };
    }
  }

  private async persistSession(session: AuthSession): Promise<void> {
    tokenManager.saveTokens(
      session.access_token,
      session.refresh_token,
      session.expires_at
    );
    
    this.currentUser = session.user;
    
    await this.connectionManager.reconnectSSEWithAuth().catch(err => {
      console.error('[AuthService] Failed to reconnect SSE:', err);
    });
  }


  public async restoreSession(): Promise<void> {
    try {
      
      await tokenManager.restoreTokens();
      const accessToken = tokenManager.getAccessToken();
      
      if (accessToken) {
        const user = await this.getCurrentUser();
        
        if (!user) {
          console.log('[AuthService] Session invalid, clearing');
          this.clearSession();
        } else {
          console.log('[AuthService] Session restored for user:', user.email);
        }
      }
    } catch (error) {
      console.error('Error restoring session:', error);
      this.clearSession();
    }
  }

  public clearSession(): void {
    tokenManager.clearTokens();
    this.currentUser = null;
  }

  destroy(): void {
    tokenManager.destroy();
    if (this.authWindow) {
      this.authWindow.close();
      this.authWindow = null;
    }
  }
}
