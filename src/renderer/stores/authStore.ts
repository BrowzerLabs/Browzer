import { create } from 'zustand';
import { AuthState, User, AuthSession } from '@/shared/types';

/**
 * Auth Store - Centralized authentication state management
 * 
 * Architecture:
 * - Single source of truth for auth state
 * - Immutable state updates
 * - Persists user and session data
 */

interface AuthStore extends AuthState {
  // Prevents duplicate initialization
  initialized: boolean;
  
  // State setters - simple and predictable
  setUser: (user: User | null) => void;
  setSession: (session: AuthSession | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setInitialized: (initialized: boolean) => void;
  
  // Composite actions
  setAuthData: (user: User, session: AuthSession) => void;
  clearAuth: () => void;
}

const initialState: AuthState = {
  is_authenticated: false,
  user: null,
  session: null,
  loading: true, // Start loading until initialized
  error: null,
};

export const useAuthStore = create<AuthStore>((set) => ({
  ...initialState,
  initialized: false,

  setUser: (user) => set({ user, is_authenticated: !!user }),
  
  setSession: (session) => set({ session }),
  
  setLoading: (loading) => set({ loading }),
  
  setError: (error) => set({ error }),
  
  setInitialized: (initialized) => set({ initialized }),
  
  setAuthData: (user, session) => 
    set({ 
      user, 
      session, 
      is_authenticated: true,
      error: null 
    }),
  
  clearAuth: () => 
    set({ 
      ...initialState, 
      loading: false, 
      initialized: true 
    }),
}));