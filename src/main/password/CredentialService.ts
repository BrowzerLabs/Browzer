import { WebContentsView } from 'electron';
import { randomUUID } from 'crypto';

import { Tab } from '@/main/browser';

export class CredentialService {
  private pendingCredentials: Map<
    string,
    {
      username?: string;
      password?: string;
      url: string;
      usernameField?: string;
      passwordField?: string;
    }
  > = new Map();

  constructor(private browserView: WebContentsView) {}

  public async enableForTab(tab: Tab): Promise<void> {
    try {
      const cdp = tab.view.webContents.debugger;

      const script = this.getCredentialDetectionScript();
      await cdp.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: script,
      });

      cdp.on('message', async (_event: any, method: string, params: any) => {
        if (method === 'Runtime.consoleAPICalled') {
          await this.handleConsoleMessage(tab, params);
        }
      });

      await cdp.sendCommand('Runtime.enable');

      console.log(`[CredentialDetection] Enabled for tab ${tab.id}`);
    } catch (error) {
      console.error('[CredentialDetection] Failed to enable for tab:', error);
    }
  }

  private async handleConsoleMessage(tab: Tab, params: any): Promise<void> {
    try {
      const message = params.args?.[0]?.value;
      if (!message || typeof message !== 'string') return;

      const url = tab.view.webContents.getURL();

      if (message === '__browzer_credential__') {
        const result = await tab.view.webContents.debugger.sendCommand(
          'Runtime.evaluate',
          {
            expression: 'window._credential_data',
            returnByValue: true,
          }
        );

        if (result?.result?.value) {
          await this.handleCredentialInput(url, result.result.value);
        }
      }
    } catch (error) {
      console.error(
        '[CredentialDetection] Error handling console message:',
        error
      );
    }
  }

  private async handleCredentialInput(url: string, data: any): Promise<void> {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const fieldName = data.attributes?.name || data.name || '';
      const fieldType = data.attributes?.type || '';
      const autocomplete = data.attributes?.autocomplete || '';

      const isPasswordField =
        fieldType === 'password' ||
        autocomplete === 'current-password' ||
        autocomplete === 'new-password' ||
        fieldName.toLowerCase().includes('password') ||
        fieldName.toLowerCase().includes('passwd') ||
        fieldName.toLowerCase().includes('pwd');

      const isUsernameField =
        autocomplete === 'username' ||
        autocomplete === 'email' ||
        fieldType === 'email' ||
        fieldName.toLowerCase().includes('username') ||
        fieldName.toLowerCase().includes('email') ||
        fieldName.toLowerCase().includes('user') ||
        fieldName.toLowerCase().includes('login');

      const credentialKey = hostname;
      const credentialData = this.pendingCredentials.get(credentialKey) || {
        url,
        username: undefined,
        password: undefined,
        usernameField: undefined,
        passwordField: undefined,
      };

      if (isPasswordField) {
        credentialData.password = data.actualValue;
        credentialData.passwordField = fieldName;
      } else if (isUsernameField) {
        credentialData.username = data.actualValue;
        credentialData.usernameField = fieldName;
      }

      this.pendingCredentials.set(credentialKey, credentialData);

      if (credentialData.username?.trim() && credentialData.password?.trim()) {
        this.browserView.webContents.send('password:save-prompt', {
          id: randomUUID(),
          hostname,
          url: credentialData.url,
          username: credentialData.username,
          password: credentialData.password,
          usernameField: credentialData.usernameField,
          passwordField: credentialData.passwordField,
        });

        console.log(`[CredentialDetection] Sent save prompt for ${hostname}`);

        this.pendingCredentials.delete(credentialKey);
      }
    } catch (error) {
      console.error(
        '[CredentialDetection] Error handling credential input:',
        error
      );
    }
  }

  private getCredentialDetectionScript(): string {
    return `
      (function() {
        const CREDENTIAL_MARKER = '__browzer_credential__';
        const lastRecordedValue = {};
        const inputDebounce = {};
        
        function isCredentialField(el) {
          const tag = el.tagName.toLowerCase();
          if (tag !== 'input') return false;
          
          const type = (el.type || '').toLowerCase();
          const name = (el.name || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          const autocomplete = (el.autocomplete || '').toLowerCase();
          
          if (type === 'password') return true;
          if (autocomplete === 'current-password' || autocomplete === 'new-password') return true;
          if (name.includes('password') || name.includes('passwd') || name.includes('pwd')) return true;
          if (id.includes('password') || id.includes('passwd') || id.includes('pwd')) return true;
          
          if (type === 'email') return true;
          if (autocomplete === 'username' || autocomplete === 'email') return true;
          if (name.includes('username') || name.includes('email') || name.includes('user') || name.includes('login')) return true;
          if (id.includes('username') || id.includes('email') || id.includes('user') || id.includes('login')) return true;
          
          return false;
        }
        
        function getStableAttributes(el) {
          const attrs = {};
          if (el.id) attrs.id = el.id;
          if (el.name) attrs.name = el.name;
          if (el.type) attrs.type = el.type;
          if (el.autocomplete) attrs.autocomplete = el.autocomplete;
          if (el.placeholder) attrs.placeholder = el.placeholder;
          if (el.className && typeof el.className === 'string') {
            attrs.class = el.className.split(' ').filter(c => c && !/^\d/.test(c)).slice(0, 3).join(' ');
          }
          return attrs;
        }
        
        function getElementName(el) {
          if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
          if (el.placeholder) return el.placeholder;
          if (el.name) return el.name;
          if (el.id) return el.id;
          
          const label = el.labels?.[0] || document.querySelector('label[for="' + el.id + '"]');
          if (label) return label.textContent?.trim();
          
          return '';
        }
        
        function getKey(el) {
          return el.id ? 'id:' + el.id : 
                 el.name ? 'name:' + el.name : 
                 'type:' + (el.type || 'text');
        }
        
        function recordCredentialInput(target) {
          if (!isCredentialField(target)) return;
          
          const key = getKey(target);
          const val = target.value || '';
          
          if (lastRecordedValue[key] === val) return;
          if (!val || val.length < 2) return;           
          lastRecordedValue[key] = val;
          
          window._credential_data = {
            name: getElementName(target),
            value: val,
            attributes: getStableAttributes(target),
            actualValue: val
          };
          
          console.log(CREDENTIAL_MARKER);
        }
        
        function handleInput(e) {
          const target = e.target;
          if (!isCredentialField(target)) return;
          
          const key = getKey(target);
          clearTimeout(inputDebounce[key]);
          inputDebounce[key] = setTimeout(() => recordCredentialInput(target), 1500);
        }
        
        function handleBlur(e) {
          const target = e.target;
          if (!isCredentialField(target)) return;
          
          const key = getKey(target);
          clearTimeout(inputDebounce[key]);
          recordCredentialInput(target);
        }
        
        document.addEventListener('input', handleInput, true);
        document.addEventListener('change', handleInput, true);
        
        document.addEventListener('blur', handleBlur, true);
      })();
    `;
  }

  public destroy(): void {
    this.pendingCredentials.clear();
  }
}
