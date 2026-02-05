import { BaseHandler } from './base';

import { PasswordFormData } from '@/shared/types';

export class PasswordHandler extends BaseHandler {
  register(): void {
    const { browserService } = this.context;
    const passwordService = browserService.getPasswordService();

    this.handle('password:save', async (_, formData: PasswordFormData) => {
      return await passwordService.saveCredential(formData);
    });

    this.handle('password:get', async (_, id: string) => {
      return passwordService.getCredential(id);
    });

    this.handle('password:get-all', async () => {
      return passwordService.getAllCredentials();
    });

    this.handle('password:get-suggestions', async (_, url: string) => {
      return passwordService.getSuggestionsForUrl(url);
    });

    this.handle(
      'password:update',
      async (
        _,
        id: string,
        updates: Partial<
          Pick<
            PasswordFormData,
            'password' | 'username' | 'usernameField' | 'passwordField'
          >
        >
      ) => {
        return passwordService.updateCredential(id, updates);
      }
    );

    this.handle('password:delete', async (_, id: string) => {
      return passwordService.deleteCredential(id);
    });

    this.handle('password:search', async (_, query: string) => {
      return passwordService.searchCredentials(query);
    });

    this.handle('password:mark-used', async (_, id: string) => {
      passwordService.markCredentialUsed(id);
      return true;
    });

    this.handle('password:export', async () => {
      return passwordService.exportCredentials();
    });

    this.handle('password:import', async (_, credentials: any[]) => {
      return passwordService.importCredentials(credentials);
    });

    this.handle('password:clear-all', async () => {
      passwordService.clearAllCredentials();
      return true;
    });
  }
}
