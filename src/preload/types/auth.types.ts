import type {
  SignUpCredentials,
  SignInCredentials,
  AuthResponse,
  AuthSession,
  User,
  UpdateProfileRequest,
} from '@/shared/types';

/**
 * Auth API - Handles authentication, session management, and user profile
 */
export interface AuthAPI {
  // Authentication
  signUp: (credentials: SignUpCredentials) => Promise<AuthResponse>;
  signIn: (credentials: SignInCredentials) => Promise<AuthResponse>;
  signInWithGoogle: () => Promise<AuthResponse>;
  signOut: () => Promise<{ success: boolean; error?: string }>;
  
  // Session Management
  getCurrentSession: () => Promise<AuthSession | null>;
  getCurrentUser: () => Promise<User | null>;
  refreshSession: () => Promise<AuthResponse>;
  
  // Profile Management
  updateProfile: (updates: UpdateProfileRequest) => Promise<AuthResponse>;
  
  // Magic Link Verification
  verifyToken: (tokenHash: string, type: string) => Promise<AuthResponse>;
  resendConfirmation: (email: string) => Promise<{ success: boolean; error?: string }>;
  
  // Password Reset
  sendPasswordReset: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string, accessToken: string) => Promise<AuthResponse>;
}
