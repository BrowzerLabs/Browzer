import { BaseHandler } from './base';

export class PasswordHandler extends BaseHandler {
  register(): void {
    const { passwordManager } = this.context;

    this.handle('password:get-all', async () => {
      return passwordManager.getAllCredentials();
    });

    this.handle('password:save', async (_, origin: string, username: string, password: string) => {
      return passwordManager.saveCredential(origin, username, password);
    });

    this.handle('password:get-for-origin', async (_, origin: string) => {
      return passwordManager.getCredentialsForOrigin(origin);
    });

    this.handle('password:get-password', async (_, credentialId: string) => {
      return passwordManager.getPassword(credentialId);
    });

    this.handle('password:update', async (_, credentialId: string, username: string, password: string) => {
      return passwordManager.updateCredential(credentialId, username, password);
    });

    this.handle('password:delete', async (_, credentialId: string) => {
      return passwordManager.deleteCredential(credentialId);
    });

    this.handle('password:delete-multiple', async (_, credentialIds: string[]) => {
      return passwordManager.deleteMultipleCredentials(credentialIds);
    });

    this.handle('password:search', async (_, query: string) => {
      return passwordManager.searchCredentials(query);
    });

    this.handle('password:get-blacklist', async () => {
      return passwordManager.getBlacklist();
    });

    this.handle('password:add-to-blacklist', async (_, origin: string) => {
      passwordManager.addToBlacklist(origin);
      return true;
    });

    this.handle('password:remove-from-blacklist', async (_, origin: string) => {
      passwordManager.removeFromBlacklist(origin);
      return true;
    });

    this.handle('password:is-blacklisted', async (_, origin: string) => {
      return passwordManager.isBlacklisted(origin);
    });

    this.handle('password:export', async () => {
      return passwordManager.exportPasswords();
    });

    this.handle('password:import', async (_, data: string) => {
      return passwordManager.importPasswords(data);
    });

    this.handle('password:get-stats', async () => {
      return passwordManager.getStats();
    });
  }
}
