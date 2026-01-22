import type { AuthAPI } from '@/preload/types/auth.types';
import { invoke } from '@/preload/utils/ipc-helpers';
import type {
  SignUpCredentials,
  SignInCredentials,
  UpdateProfileRequest,
} from '@/shared/types';

/**
 * Auth API implementation
 * Handles authentication, session management, and user profile operations
 */
export const createAuthAPI = (): AuthAPI => ({
  // Authentication
  signUp: (credentials: SignUpCredentials) =>
    invoke('auth:sign-up', credentials),
  signIn: (credentials: SignInCredentials) =>
    invoke('auth:sign-in', credentials),
  signInWithGoogle: () => invoke('auth:sign-in-google'),
  signOut: () => invoke('auth:sign-out'),

  // Session Management
  getCurrentSession: () => invoke('auth:get-session'),
  getCurrentUser: () => invoke('auth:get-user'),
  refreshSession: () => invoke('auth:refresh-session'),

  // Profile Management
  updateProfile: (updates: UpdateProfileRequest) =>
    invoke('auth:update-profile', updates),

  // Magic Link Verification
  verifyToken: (tokenHash: string, type: string) =>
    invoke('auth:verify-token', tokenHash, type),
  resendConfirmation: (email: string) =>
    invoke('auth:resend-confirmation', email),

  // Password Reset
  sendPasswordReset: (email: string) =>
    invoke('auth:send-password-reset', email),
  updatePassword: (newPassword: string, accessToken: string) =>
    invoke('auth:update-password', newPassword, accessToken),
});
