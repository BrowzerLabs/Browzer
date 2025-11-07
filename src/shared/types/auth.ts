/**
 * Authentication related types
 */

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  display_name: string | null;
  photo_url: string | null;
  created_at: string;  // ISO 8601 format
  last_sign_in_at: string;  // ISO 8601 format
  metadata: Record<string, any> | null;
}

export interface AuthSession {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_at: number;  // Unix timestamp
}

export interface AuthState {
  is_authenticated: boolean;
  user: User | null;
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  display_name?: string | null;
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface AuthError {
  code: string;
  message: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User | null;
  session?: AuthSession | null;
  error?: AuthError | null;
}

export interface UpdateProfileRequest {
  display_name?: string | null;
  photo_url?: string | null;
}

export interface VerifyTokenHashRequest {
  token_hash: string;
  type: string;  // 'signup' or 'recovery'
}

export interface ResendConfirmationRequest {
  email: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface UpdatePasswordRequest {
  new_password: string;
}

export interface SimpleResponse {
  success: boolean;
  message?: string | null;
  error?: string | null;
}
