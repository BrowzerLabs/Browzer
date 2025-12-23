import { WebContentsView } from 'electron';

import { PasswordManager } from '../PasswordManager';
import { PasswordPromptData, FormSubmission } from '../types';

import { jsonStringifyForJS } from '@/main/utils/jsEscape';

/**
 * PasswordPromptService - Chrome-like save/update password prompts
 *
 * Features:
 * - Native-looking save prompt
 * - Update prompt for existing credentials
 * - Persistent across navigation
 * - Smart detection of successful login
 * - "Never for this site" option
 */
export class PasswordPromptService {
  private debugger: Electron.Debugger;
  private passwordManager: PasswordManager;
  private pendingPrompt: PasswordPromptData | null = null;
  private promptShown = false;

  constructor(view: WebContentsView, passwordManager: PasswordManager) {
    this.debugger = view.webContents.debugger;
    this.passwordManager = passwordManager;
  }

  /**
   * Handle form submission and show appropriate prompt
   */
  public async handleFormSubmission(submission: FormSubmission): Promise<void> {
    try {
      const { origin, username, email, password } = submission;
      const identifier = username || email;

      if (!identifier || !password) {
        console.log('[PasswordPromptService] Missing identifier or password');
        return;
      }

      // Check if site is blacklisted
      if (this.passwordManager.isBlacklisted(origin)) {
        console.log('[PasswordPromptService] Site is blacklisted:', origin);
        return;
      }

      // Check if credential already exists
      const existingCredentials =
        this.passwordManager.getCredentialsForOrigin(origin);
      const existingCredential = existingCredentials.find(
        (c) => c.username === identifier
      );

      if (existingCredential) {
        // Check if password changed
        const savedPassword = this.passwordManager.getPassword(
          existingCredential.id
        );
        if (savedPassword !== password) {
          // Show update prompt
          await this.showUpdatePrompt(
            origin,
            identifier,
            password,
            existingCredential.id
          );
        } else {
          console.log(
            '[PasswordPromptService] Password unchanged, no prompt needed'
          );
        }
      } else {
        // Show save prompt
        await this.showSavePrompt(origin, identifier, password);
      }
    } catch (error) {
      console.error(
        '[PasswordPromptService] Error handling form submission:',
        error
      );
    }
  }

  /**
   * Show save password prompt
   */
  private async showSavePrompt(
    origin: string,
    username: string,
    password: string
  ): Promise<void> {
    if (this.promptShown) {
      console.log('[PasswordPromptService] Prompt already shown');
      return;
    }

    this.pendingPrompt = {
      type: 'save',
      origin,
      username,
      password,
      timestamp: Date.now(),
    };

    try {
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            // Remove existing prompt
            const existing = document.getElementById('browzer-password-prompt');
            if (existing) existing.remove();

            const origin = ${jsonStringifyForJS(origin)};
            const username = ${jsonStringifyForJS(username)};
            const password = ${jsonStringifyForJS(password)};

            // Create prompt container
            const prompt = document.createElement('div');
            prompt.id = 'browzer-password-prompt';
            prompt.style.cssText = \`
              position: fixed !important;
              top: 16px !important;
              right: 16px !important;
              width: 360px !important;
              background: white !important;
              border: 1px solid #dadce0 !important;
              border-radius: 8px !important;
              box-shadow: 0 4px 16px rgba(0,0,0,0.2) !important;
              z-index: 2147483647 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
              font-size: 14px !important;
              padding: 16px !important;
              animation: slideIn 0.3s ease-out !important;
            \`;

            // Add animation
            const style = document.createElement('style');
            style.textContent = \`
              @keyframes slideIn {
                from {
                  transform: translateX(100%);
                  opacity: 0;
                }
                to {
                  transform: translateX(0);
                  opacity: 1;
                }
              }
            \`;
            document.head.appendChild(style);

            // Header with icon
            const header = document.createElement('div');
            header.style.cssText = \`
              display: flex !important;
              align-items: center !important;
              gap: 12px !important;
              margin-bottom: 12px !important;
            \`;

            const icon = document.createElement('div');
            icon.innerHTML = '🔑';
            icon.style.cssText = 'font-size: 24px !important;';

            const title = document.createElement('div');
            title.style.cssText = \`
              flex: 1 !important;
              font-weight: 500 !important;
              color: #202124 !important;
              font-size: 16px !important;
            \`;
            title.textContent = 'Save password?';

            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = \`
              background: none !important;
              border: none !important;
              font-size: 24px !important;
              color: #5f6368 !important;
              cursor: pointer !important;
              padding: 0 !important;
              width: 24px !important;
              height: 24px !important;
              line-height: 24px !important;
            \`;
            closeBtn.onclick = () => {
              console.log('BROWZER_PASSWORD_DISMISS', JSON.stringify({ origin }));
              prompt.remove();
            };

            header.appendChild(icon);
            header.appendChild(title);
            header.appendChild(closeBtn);

            // Username display
            const usernameDisplay = document.createElement('div');
            usernameDisplay.style.cssText = \`
              color: #5f6368 !important;
              margin-bottom: 16px !important;
              padding: 8px 12px !important;
              background: #f8f9fa !important;
              border-radius: 4px !important;
            \`;
            usernameDisplay.textContent = username;

            // Button container
            const buttons = document.createElement('div');
            buttons.style.cssText = \`
              display: flex !important;
              gap: 8px !important;
              justify-content: flex-end !important;
            \`;

            // Never button
            const neverBtn = document.createElement('button');
            neverBtn.textContent = 'Never';
            neverBtn.style.cssText = \`
              background: none !important;
              border: 1px solid #dadce0 !important;
              color: #5f6368 !important;
              padding: 8px 16px !important;
              border-radius: 4px !important;
              cursor: pointer !important;
              font-size: 14px !important;
              font-weight: 500 !important;
              transition: all 0.2s !important;
            \`;
            neverBtn.onmouseover = () => {
              neverBtn.style.backgroundColor = '#f8f9fa';
            };
            neverBtn.onmouseout = () => {
              neverBtn.style.backgroundColor = 'transparent';
            };
            neverBtn.onclick = () => {
              console.log('BROWZER_PASSWORD_NEVER', JSON.stringify({ origin }));
              prompt.remove();
            };

            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = \`
              background: #1a73e8 !important;
              border: none !important;
              color: white !important;
              padding: 8px 24px !important;
              border-radius: 4px !important;
              cursor: pointer !important;
              font-size: 14px !important;
              font-weight: 500 !important;
              transition: all 0.2s !important;
            \`;
            saveBtn.onmouseover = () => {
              saveBtn.style.backgroundColor = '#1765cc';
            };
            saveBtn.onmouseout = () => {
              saveBtn.style.backgroundColor = '#1a73e8';
            };
            saveBtn.onclick = () => {
              console.log('BROWZER_PASSWORD_SAVE', JSON.stringify({
                origin,
                username,
                password
              }));
              prompt.remove();
            };

            // Assemble
            buttons.appendChild(neverBtn);
            buttons.appendChild(saveBtn);
            prompt.appendChild(header);
            prompt.appendChild(usernameDisplay);
            prompt.appendChild(buttons);

            // Add to page
            document.body.appendChild(prompt);

            // Auto-dismiss after 30 seconds
            setTimeout(() => {
              if (document.getElementById('browzer-password-prompt')) {
                prompt.remove();
              }
            }, 30000);

            console.log('[Browzer] ✅ Save password prompt shown');
          })();
        `,
      });

      this.promptShown = true;
      console.log('[PasswordPromptService] Save prompt shown for:', username);
    } catch (error) {
      console.error(
        '[PasswordPromptService] Error showing save prompt:',
        error
      );
    }
  }

  /**
   * Show update password prompt
   */
  private async showUpdatePrompt(
    origin: string,
    username: string,
    password: string,
    existingCredentialId: string
  ): Promise<void> {
    if (this.promptShown) return;

    this.pendingPrompt = {
      type: 'update',
      origin,
      username,
      password,
      existingCredentialId,
      timestamp: Date.now(),
    };

    try {
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            // Remove existing prompt
            const existing = document.getElementById('browzer-password-prompt');
            if (existing) existing.remove();

            const origin = ${jsonStringifyForJS(origin)};
            const username = ${jsonStringifyForJS(username)};
            const password = ${jsonStringifyForJS(password)};
            const credentialId = ${jsonStringifyForJS(existingCredentialId)};

            // Create prompt (similar to save prompt but with "Update" title)
            const prompt = document.createElement('div');
            prompt.id = 'browzer-password-prompt';
            prompt.style.cssText = \`
              position: fixed !important;
              top: 16px !important;
              right: 16px !important;
              width: 360px !important;
              background: white !important;
              border: 1px solid #dadce0 !important;
              border-radius: 8px !important;
              box-shadow: 0 4px 16px rgba(0,0,0,0.2) !important;
              z-index: 2147483647 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
              font-size: 14px !important;
              padding: 16px !important;
              animation: slideIn 0.3s ease-out !important;
            \`;

            // Header
            const header = document.createElement('div');
            header.style.cssText = \`
              display: flex !important;
              align-items: center !important;
              gap: 12px !important;
              margin-bottom: 12px !important;
            \`;

            const icon = document.createElement('div');
            icon.innerHTML = '🔑';
            icon.style.cssText = 'font-size: 24px !important;';

            const title = document.createElement('div');
            title.style.cssText = \`
              flex: 1 !important;
              font-weight: 500 !important;
              color: #202124 !important;
              font-size: 16px !important;
            \`;
            title.textContent = 'Update password?';

            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = \`
              background: none !important;
              border: none !important;
              font-size: 24px !important;
              color: #5f6368 !important;
              cursor: pointer !important;
              padding: 0 !important;
            \`;
            closeBtn.onclick = () => {
              console.log('BROWZER_PASSWORD_DISMISS', JSON.stringify({ origin }));
              prompt.remove();
            };

            header.appendChild(icon);
            header.appendChild(title);
            header.appendChild(closeBtn);

            // Username display
            const usernameDisplay = document.createElement('div');
            usernameDisplay.style.cssText = \`
              color: #5f6368 !important;
              margin-bottom: 16px !important;
              padding: 8px 12px !important;
              background: #f8f9fa !important;
              border-radius: 4px !important;
            \`;
            usernameDisplay.textContent = username;

            // Buttons
            const buttons = document.createElement('div');
            buttons.style.cssText = \`
              display: flex !important;
              gap: 8px !important;
              justify-content: flex-end !important;
            \`;

            const notNowBtn = document.createElement('button');
            notNowBtn.textContent = 'Not now';
            notNowBtn.style.cssText = \`
              background: none !important;
              border: 1px solid #dadce0 !important;
              color: #5f6368 !important;
              padding: 8px 16px !important;
              border-radius: 4px !important;
              cursor: pointer !important;
              font-size: 14px !important;
              font-weight: 500 !important;
            \`;
            notNowBtn.onclick = () => prompt.remove();

            const updateBtn = document.createElement('button');
            updateBtn.textContent = 'Update';
            updateBtn.style.cssText = \`
              background: #1a73e8 !important;
              border: none !important;
              color: white !important;
              padding: 8px 24px !important;
              border-radius: 4px !important;
              cursor: pointer !important;
              font-size: 14px !important;
              font-weight: 500 !important;
            \`;
            updateBtn.onclick = () => {
              console.log('BROWZER_PASSWORD_UPDATE', JSON.stringify({
                origin,
                username,
                password,
                credentialId
              }));
              prompt.remove();
            };

            buttons.appendChild(notNowBtn);
            buttons.appendChild(updateBtn);
            prompt.appendChild(header);
            prompt.appendChild(usernameDisplay);
            prompt.appendChild(buttons);

            document.body.appendChild(prompt);

            setTimeout(() => {
              if (document.getElementById('browzer-password-prompt')) {
                prompt.remove();
              }
            }, 30000);

            console.log('[Browzer] ✅ Update password prompt shown');
          })();
        `,
      });

      this.promptShown = true;
      console.log('[PasswordPromptService] Update prompt shown for:', username);
    } catch (error) {
      console.error(
        '[PasswordPromptService] Error showing update prompt:',
        error
      );
    }
  }

  /**
   * Handle save password action
   */
  public async handleSavePassword(
    origin: string,
    username: string,
    password: string
  ): Promise<boolean> {
    try {
      const success = await this.passwordManager.saveCredential(
        origin,
        username,
        password
      );
      if (success) {
        this.clearPendingPrompt();
        this.promptShown = false;
        console.log('[PasswordPromptService] ✅ Password saved successfully');
      }
      return success;
    } catch (error) {
      console.error('[PasswordPromptService] Error saving password:', error);
      return false;
    }
  }

  /**
   * Handle update password action
   */
  public async handleUpdatePassword(
    origin: string,
    username: string,
    password: string
  ): Promise<boolean> {
    try {
      // saveCredential will update if exists
      const success = await this.passwordManager.saveCredential(
        origin,
        username,
        password
      );
      if (success) {
        this.clearPendingPrompt();
        this.promptShown = false;
        console.log('[PasswordPromptService] ✅ Password updated successfully');
      }
      return success;
    } catch (error) {
      console.error('[PasswordPromptService] Error updating password:', error);
      return false;
    }
  }

  /**
   * Handle never save for site
   */
  public handleNeverSave(origin: string): void {
    this.passwordManager.addToBlacklist(origin);
    this.clearPendingPrompt();
    this.promptShown = false;
    console.log('[PasswordPromptService] Site added to blacklist:', origin);
  }

  /**
   * Handle prompt dismissal (close button clicked)
   */
  public handleDismiss(): void {
    this.clearPendingPrompt();
    this.promptShown = false;
    console.log(
      '[PasswordPromptService] Prompt dismissed, will show again on next submit'
    );
  }

  /**
   * Clear pending prompt
   */
  public clearPendingPrompt(): void {
    this.pendingPrompt = null;
  }

  /**
   * Reset prompt state
   */
  public reset(): void {
    this.pendingPrompt = null;
    this.promptShown = false;
  }

  /**
   * Get pending prompt
   */
  public getPendingPrompt(): PasswordPromptData | null {
    return this.pendingPrompt;
  }
}
