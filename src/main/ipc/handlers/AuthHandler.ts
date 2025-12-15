import { BaseHandler } from './base';
import { SignUpCredentials, SignInCredentials, UpdateProfileRequest } from '@/shared/types';

export class AuthHandler extends BaseHandler {
  register(): void {
    const { authService } = this.context;

    this.handle('auth:sign-up', async (_, credentials: SignUpCredentials) => {
      return authService.signUp(credentials);
    });

    this.handle('auth:sign-in', async (_, credentials: SignInCredentials) => {
      return authService.signIn(credentials);
    });

    this.handle('auth:sign-in-google', async () => {
      return authService.signInWithGoogle();
    });

    this.handle('auth:sign-out', async () => {
      return authService.signOut();
    });

    this.handle('auth:get-session', async () => {
      return authService.getCurrentSession();
    });

    this.handle('auth:get-user', async () => {
      return authService.getCurrentUser();
    });

    this.handle('auth:refresh-session', async () => {
      return authService.refreshSession();
    });

    this.handle('auth:update-profile', async (_, updates: UpdateProfileRequest) => {
      return authService.updateProfile(updates);
    });

    this.handle('auth:verify-token', async (_, tokenHash: string, type: string) => {
      return authService.verifyToken(tokenHash, type);
    });

    this.handle('auth:resend-confirmation', async (_, email: string) => {
      return authService.resendConfirmation(email);
    });

    this.handle('auth:send-password-reset', async (_, email: string) => {
      return authService.sendPasswordReset(email);
    });

    this.handle('auth:update-password', async (_, newPassword: string, accessToken: string) => {
      return authService.updatePassword(newPassword, accessToken);
    });
  }
}
