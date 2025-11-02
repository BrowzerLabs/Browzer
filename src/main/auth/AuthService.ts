import { BrowserWindow, session } from 'electron';
import Store from 'electron-store';
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

export class AuthService {
  private sessionStore: Store;
  private refreshTimer: NodeJS.Timeout | null = null;
  private authWindow: BrowserWindow | null = null;
  private readonly browserManager: BrowserManager;

  constructor(
    browserManager: BrowserManager,
  ) {
    this.browserManager = browserManager;
    this.sessionStore = new Store({
      name: 'auth-session',
      encryptionKey: 'browzer-auth-encryption-key', // In production, use env variable
    });
  }

  /**
   * Sign up with email and password
   */
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

  /**
   * Sign in with email and password
   */
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
        this.persistSession(authResponse.session);
        this.scheduleTokenRefresh(authResponse.session);
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

  /**
   * Sign in with Google OAuth
   * Opens OAuth window and handles callback
   */
  async signInWithGoogle(): Promise<AuthResponse> {
    try {
      // Step 1: Get OAuth URL from backend
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

      // Step 3: Open OAuth window 
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

  /**
   * Handle OAuth callback URL
   * Extracts code and exchanges it for session
   */
  private async handleOAuthCallback(
    url: string,
    resolve: (value: AuthResponse) => void
  ): Promise<void> {

    try {
      const urlObj = new URL(url);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      // Handle OAuth errors
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

      // Exchange code for session
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

      // Persist session if successful
      if (authResponse.success && authResponse.session) {
        this.persistSession(authResponse.session);
        this.scheduleTokenRefresh(authResponse.session);
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

  /**
   * Sign out
   */
  async signOut(): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.getStoredSession();
      
      if (session) {
        // Call backend signout endpoint
        await api.post<SimpleResponse>('/auth/signout');
      }

      this.clearSession();
      this.cancelTokenRefresh();
      this.browserManager.destroy();

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'An unexpected error occurred during sign out',
      };
    }
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<AuthSession | null> {
    try {
      const storedSession = this.getStoredSession();
      
      if (!storedSession) {
        return null;
      }

      // Validate session with backend
      const user = await this.getCurrentUser();
      
      if (!user) {
        this.clearSession();
        return null;
      }

      return storedSession;
    } catch (error) {
      console.error('Error getting current session:', error);
      return null;
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const session = this.getStoredSession();
      
      if (!session) {
        return null;
      }

      const response = await api.get<AuthResponse>('/auth/user');

      if (!response.success || !response.data || !response.data.user) {
        return null;
      }

      return response.data.user;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  /**
   * Refresh session
   */
  async refreshSession(): Promise<AuthResponse> {
    try {
      const storedSession = this.getStoredSession();
      
      if (!storedSession || !storedSession.refresh_token) {
        return {
          success: false,
          error: {
            code: 'NO_SESSION',
            message: 'No session to refresh',
          },
        };
      }

      const response = await api.post<AuthResponse>(
        '/auth/refresh',
        {
          refresh_token: storedSession.refresh_token,
        }
      );

      if (!response.success || !response.data) {
        this.clearSession();
        return {
          success: false,
          error: {
            code: 'REFRESH_FAILED',
            message: response.error || 'Failed to refresh session',
          },
        };
      }

      const authResponse = response.data;

      // Persist new session
      if (authResponse.success && authResponse.session) {
        this.persistSession(authResponse.session);
        this.scheduleTokenRefresh(authResponse.session);
      }

      return authResponse;
    } catch (error: any) {
      this.clearSession();
      return {
        success: false,
        error: {
          code: 'REFRESH_EXCEPTION',
          message: error.message || 'An unexpected error occurred during session refresh',
        },
      };
    }
  }

  /**
   * Update user profile
   */
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

  /**
   * Verify magic link token hash
   * Used for email confirmation and password reset
   */
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
        this.persistSession(authResponse.session);
        this.scheduleTokenRefresh(authResponse.session);
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

  /**
   * Resend email confirmation magic link
   */
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

  /**
   * Send password reset magic link to email
   */
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

  /**
   * Update password after magic link verification
   * The access token comes from the magic link verification
   */
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

  /**
   * Persist session to secure storage
   */
  private persistSession(session: AuthSession): void {
    this.sessionStore.set('session', session);
  }

  /**
   * Get stored session
   */
  private getStoredSession(): AuthSession | null {
    try {
      const session = this.sessionStore.get('session') as AuthSession | undefined;
      return session ?? null;
    } catch (error) {
      console.error('Error getting stored session:', error);
      return null;
    }
  }

  public async initialize(): Promise<void> {
    await this.restoreSession();
  }

  /**
   * Restore session from storage
   */
  private async restoreSession(): Promise<void> {
    try {
      const storedSession = this.getStoredSession();
      
      if (storedSession && storedSession.access_token) {
        const user = await this.getCurrentUser();
        
        if (user) {
          this.scheduleTokenRefresh(storedSession);
        } else {
          this.clearSession();
        }
      }
    } catch (error) {
      console.error('Error restoring session:', error);
      this.clearSession();
    }
  }

  /**
   * Clear session from storage
   */
  public clearSession(): void {
    this.sessionStore.delete('session');
    this.cancelTokenRefresh();
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(session: AuthSession): void {
    this.cancelTokenRefresh();

    if (session.expires_at) {
      const expiresIn = session.expires_at * 1000 - Date.now() - 5 * 60 * 1000;
      
      if (expiresIn > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshSession();
        }, expiresIn);
      }
    }
  }

  /**
   * Cancel scheduled token refresh
   */
  private cancelTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    const session = this.getStoredSession();
    return session?.access_token ?? null;
  }

  /**
   * Cleanup on app quit
   */
  destroy(): void {
    this.cancelTokenRefresh();
    if (this.authWindow) {
      this.authWindow.close();
      this.authWindow = null;
    }
  }
}
