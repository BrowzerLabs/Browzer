import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/renderer/stores/authStore';
import {
  SignUpCredentials,
  SignInCredentials,
  AuthResponse,
  UpdateProfileRequest,
} from '@/shared/types';

/**
 * useAuth Hook - Main authentication interface
 *
 * Architecture:
 * - Handles all auth operations (sign in, sign up, sign out)
 * - Manages initialization lifecycle
 * - Provides stable callback references
 * - No dependency on store setters (uses getState())
 *
 */

export function useAuth() {
  // Subscribe to state (read-only)
  const state = useAuthStore();

  // Track initialization to prevent duplicates
  const initRef = useRef(false);

  /**
   * Initialize authentication on mount
   *
   * Flow:
   * 1. Check if already initialized or in progress
   * 2. Fetch current session from main process
   * 3. Update store with session data or clear auth
   * 4. Mark as initialized
   */
  const initialize = useCallback(async () => {
    if (initRef.current) return;

    initRef.current = true;
    const store = useAuthStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      console.log('[Auth] Initializing...');
      const session = await window.authAPI.getCurrentSession();

      if (session) {
        console.log('[Auth] Session found:', session);
        store.setAuthData(session.user, session);
      } else {
        console.log('[Auth] No session found');
        toast.info('Welcome back 👋🏻, Please sign in to continue');
        store.clearAuth();
      }

      store.setInitialized(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to initialize');
      console.error('[Auth] Initialization failed:', error);
      store.setError(error.message || 'Failed to initialize');
      store.clearAuth();
    } finally {
      store.setLoading(false);
      initRef.current = false;
      console.log('[Auth] Initialization complete');
    }
  }, []);

  // Run initialization once
  useEffect(() => {
    if (!state.initialized && !initRef.current) {
      initialize();
    }
  }, [state.initialized, initialize]);

  /**
   * Sign up with email/password
   */
  const signUp = useCallback(
    async (credentials: SignUpCredentials): Promise<AuthResponse> => {
      const store = useAuthStore.getState();

      try {
        store.setLoading(true);
        store.setError(null);

        const response = await window.authAPI.signUp(credentials);

        if (response.success && response.user && response.session) {
          store.setAuthData(response.user, response.session);
          toast.success('Account created successfully');
        } else if (response.error) {
          store.setError(response.error.message);
          toast.error(response.error.message);
        }

        return response;
      } catch (error: any) {
        const message = error.message || 'Sign up failed';
        store.setError(message);
        toast.error(message);

        return {
          success: false,
          error: { code: 'SIGNUP_ERROR', message },
        };
      } finally {
        store.setLoading(false);
      }
    },
    []
  );

  /**
   * Sign in with email/password
   */
  const signIn = useCallback(
    async (credentials: SignInCredentials): Promise<AuthResponse> => {
      const store = useAuthStore.getState();

      try {
        store.setLoading(true);
        store.setError(null);

        const response = await window.authAPI.signIn(credentials);

        if (response.success && response.user && response.session) {
          store.setAuthData(response.user, response.session);
          toast.success('Signed in successfully');
        } else if (response.error) {
          store.setError(response.error.message);
          toast.error(response.error.message);
        }

        return response;
      } catch (error: any) {
        const message = error.message || 'Sign in failed';
        store.setError(message);
        toast.error(message);

        return {
          success: false,
          error: { code: 'SIGNIN_ERROR', message },
        };
      } finally {
        store.setLoading(false);
      }
    },
    []
  );

  /**
   * Sign in with Google OAuth
   */
  const signInWithGoogle = useCallback(async (): Promise<AuthResponse> => {
    const store = useAuthStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      const response = await window.authAPI.signInWithGoogle();

      if (response.success && response.user && response.session) {
        store.setAuthData(response.user, response.session);
        toast.success('Signed in with Google');
      } else if (response.error) {
        store.setError(response.error.message);
        toast.error(response.error.message);
      }

      return response;
    } catch (error: any) {
      const message = error.message || 'Google sign in failed';
      store.setError(message);
      toast.error(message);

      return {
        success: false,
        error: { code: 'GOOGLE_SIGNIN_ERROR', message },
      };
    } finally {
      store.setLoading(false);
    }
  }, []);

  /**
   * Sign out
   */
  const signOut = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    const store = useAuthStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      const result = await window.authAPI.signOut();

      if (result.success) {
        store.clearAuth();
        toast.success('Signed out successfully');
      } else if (result.error) {
        store.setError(result.error);
        toast.error(result.error);
      }

      return result;
    } catch (error: any) {
      const message = error.message || 'Sign out failed';
      store.setError(message);
      toast.error(message);

      return { success: false, error: message };
    } finally {
      store.setLoading(false);
    }
  }, []);

  /**
   * Refresh session
   */
  const refreshSession = useCallback(async (): Promise<AuthResponse> => {
    const store = useAuthStore.getState();

    try {
      store.setLoading(true);
      store.setError(null);

      const response = await window.authAPI.refreshSession();

      if (response.success && response.user && response.session) {
        store.setAuthData(response.user, response.session);
      } else if (response.error) {
        store.setError(response.error.message);
        // Don't show toast for refresh errors (silent)
      }

      return response;
    } catch (error: any) {
      const message = error.message || 'Session refresh failed';
      store.setError(message);

      return {
        success: false,
        error: { code: 'REFRESH_ERROR', message },
      };
    } finally {
      store.setLoading(false);
    }
  }, []);

  /**
   * Update user profile
   */
  const updateProfile = useCallback(
    async (updates: UpdateProfileRequest): Promise<AuthResponse> => {
      const store = useAuthStore.getState();

      try {
        store.setLoading(true);
        store.setError(null);

        const response = await window.authAPI.updateProfile(updates);

        if (response.success && response.user) {
          store.setUser(response.user);
        } else if (response.error) {
          store.setError(response.error.message);
          toast.error(response.error.message);
        }

        return response;
      } catch (error: any) {
        const message = error.message || 'Profile update failed';
        store.setError(message);
        toast.error(message);

        return {
          success: false,
          error: { code: 'UPDATE_ERROR', message },
        };
      } finally {
        store.setLoading(false);
      }
    },
    []
  );

  // Return state and actions
  return {
    // State (read-only)
    isAuthenticated: state.is_authenticated,
    user: state.user,
    session: state.session,
    loading: state.loading,
    error: state.error,

    // Actions
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    refreshSession,
    updateProfile,
    initialize,
  };
}
