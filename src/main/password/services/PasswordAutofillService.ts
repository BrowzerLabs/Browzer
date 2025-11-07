import { WebContentsView } from 'electron';
import { PasswordManager } from '@/main/password/PasswordManager';
import { AutofillSuggestion, DetectedForm } from '@/main/password/types';
import { jsonStringifyForJS } from '@/main/utils/jsEscape';

/**
 * PasswordAutofillService - Chrome-like autofill UI and logic
 * 
 * Features:
 * - Native-looking autofill dropdown
 * - Keyboard navigation (arrow keys, Enter, Esc)
 * - Proper positioning relative to input fields
 * - Instant response on field focus
 * - Multi-step login support
 */
export class PasswordAutofillService {
  private view: WebContentsView;
  private debugger: Electron.Debugger;
  private passwordManager: PasswordManager;
  private isSetup = false;

  constructor(view: WebContentsView, passwordManager: PasswordManager) {
    this.view = view;
    this.debugger = view.webContents.debugger;
    this.passwordManager = passwordManager;
  }

  /**
   * Setup autofill for detected forms
   */
  public async setupAutofill(forms: DetectedForm[]): Promise<void> {
    if (forms.length === 0) return;

    try {
      const origin = forms[0].origin;
      const credentials = this.passwordManager.getCredentialsForOrigin(origin);

      if (credentials.length === 0) return;

      const suggestions: AutofillSuggestion[] = credentials.map(cred => ({
        credentialId: cred.id,
        username: cred.username,
        lastUsed: cred.lastUsed,
      }));

      // Inject autofill listeners for all forms
      await this.injectAutofillListeners(forms, suggestions, origin);
      this.isSetup = true;

      console.log(`[PasswordAutofillService] Setup autofill for ${forms.length} forms with ${suggestions.length} credentials`);
    } catch (error) {
      console.error('[PasswordAutofillService] Error setting up autofill:', error);
    }
  }

  /**
   * Inject autofill event listeners into the page
   */
  private async injectAutofillListeners(
    forms: DetectedForm[],
    suggestions: AutofillSuggestion[],
    origin: string
  ): Promise<void> {
    // Build field selectors
    const fieldSelectors: string[] = [];
    
    forms.forEach(form => {
      if (form.usernameField?.selector) fieldSelectors.push(form.usernameField.selector);
      if (form.emailField?.selector) fieldSelectors.push(form.emailField.selector);
    });

    if (fieldSelectors.length === 0) return;

    await this.debugger.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          if (window.__browzerAutofillSetup) return;
          window.__browzerAutofillSetup = true;

          const selectors = ${JSON.stringify(fieldSelectors)};
          const suggestions = ${JSON.stringify(suggestions)};
          const origin = ${jsonStringifyForJS(origin)};

          // Find all username/email fields
          const fields = [];
          selectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                if (el && !el.__browzerAutofill) {
                  fields.push(el);
                  el.__browzerAutofill = true;
                }
              });
            } catch (e) {
              console.error('[Browzer] Invalid selector:', selector, e);
            }
          });

          console.log('[Browzer] Setting up autofill for', fields.length, 'fields');

          // Setup autofill for each field
          fields.forEach(field => {
            const showAutofill = () => {
              console.log('BROWZER_SHOW_AUTOFILL', JSON.stringify({
                origin: origin,
                suggestions: suggestions,
                fieldRect: {
                  top: field.getBoundingClientRect().top,
                  left: field.getBoundingClientRect().left,
                  width: field.getBoundingClientRect().width,
                  height: field.getBoundingClientRect().height
                }
              }));
            };

            // Show on focus
            field.addEventListener('focus', showAutofill);
            
            // Show on click
            field.addEventListener('click', showAutofill);
            
            // Show on empty input
            field.addEventListener('input', function() {
              if (this.value.length === 0) {
                showAutofill();
              }
            });

            // Show immediately if already focused
            if (document.activeElement === field) {
              setTimeout(showAutofill, 100);
            }
          });

          console.log('[Browzer] ✅ Autofill setup complete');
        })();
      `
    });
  }

  /**
   * Fill username and password
   */
  public async fillCredentials(
    credentialId: string,
    form: DetectedForm
  ): Promise<boolean> {
    try {
      const password = this.passwordManager.getPassword(credentialId);
      if (!password) {
        console.error('[PasswordAutofillService] Password not found for credential:', credentialId);
        return false;
      }

      const credentials = this.passwordManager.getCredentialsForOrigin(form.origin);
      const credential = credentials.find(c => c.id === credentialId);
      if (!credential) return false;

      const username = credential.username;

      // Fill username/email field
      const usernameSelector = form.usernameField?.selector || form.emailField?.selector;
      if (usernameSelector) {
        await this.fillField(usernameSelector, username);
      }

      // Fill password field
      if (form.passwordField?.selector) {
        await this.fillField(form.passwordField.selector, password);
      }

      console.log('[PasswordAutofillService] ✅ Credentials filled successfully');
      return true;
    } catch (error) {
      console.error('[PasswordAutofillService] Error filling credentials:', error);
      return false;
    }
  }

  /**
   * Fill a single field with value
   */
  private async fillField(selector: string, value: string): Promise<void> {
    await this.debugger.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          try {
            const field = document.querySelector(${jsonStringifyForJS(selector)});
            if (field) {
              // Set value
              field.value = ${jsonStringifyForJS(value)};
              
              // Trigger events for frameworks (React, Vue, Angular)
              field.dispatchEvent(new Event('input', { bubbles: true }));
              field.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Focus the field
              field.focus();
              
              console.log('[Browzer] Field filled:', ${jsonStringifyForJS(selector)});
            } else {
              console.error('[Browzer] Field not found:', ${jsonStringifyForJS(selector)});
            }
          } catch (error) {
            console.error('[Browzer] Error filling field:', error);
          }
        })();
      `
    });
  }

  /**
   * Show autofill dropdown (called from console message handler)
   */
  public async showAutofillDropdown(
    suggestions: AutofillSuggestion[],
    fieldRect: { top: number; left: number; width: number; height: number },
    origin: string
  ): Promise<void> {
    try {
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            // Remove existing dropdown
            const existing = document.getElementById('browzer-autofill-dropdown');
            if (existing) existing.remove();

            const suggestions = ${JSON.stringify(suggestions)};
            const rect = ${JSON.stringify(fieldRect)};
            const origin = ${jsonStringifyForJS(origin)};

            // Create dropdown container
            const dropdown = document.createElement('div');
            dropdown.id = 'browzer-autofill-dropdown';
            dropdown.style.cssText = \`
              position: fixed !important;
              top: \${rect.top + rect.height + 2}px !important;
              left: \${rect.left}px !important;
              width: \${rect.width}px !important;
              background: white !important;
              border: 1px solid #dadce0 !important;
              border-radius: 4px !important;
              box-shadow: 0 2px 10px rgba(0,0,0,0.2) !important;
              z-index: 2147483647 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif !important;
              font-size: 14px !important;
              max-height: 300px !important;
              overflow-y: auto !important;
              padding: 4px 0 !important;
            \`;

            let selectedIndex = -1;

            // Create suggestion items
            suggestions.forEach((suggestion, index) => {
              const item = document.createElement('div');
              item.className = 'browzer-autofill-item';
              item.style.cssText = \`
                padding: 10px 16px !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                color: #202124 !important;
                transition: background-color 0.1s !important;
              \`;

              // Key icon
              const icon = document.createElement('div');
              icon.innerHTML = '🔑';
              icon.style.cssText = 'font-size: 16px !important;';

              // Username text
              const text = document.createElement('div');
              text.textContent = suggestion.username;
              text.style.cssText = 'flex: 1 !important; overflow: hidden !important; text-overflow: ellipsis !important;';

              item.appendChild(icon);
              item.appendChild(text);

              // Hover effect
              item.addEventListener('mouseenter', function() {
                selectedIndex = index;
                updateSelection();
              });

              // Click handler
              item.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('BROWZER_AUTOFILL_SELECT', JSON.stringify({
                  credentialId: suggestion.credentialId,
                  username: suggestion.username,
                  origin: origin
                }));
                
                dropdown.remove();
              });

              dropdown.appendChild(item);
            });

            // Keyboard navigation
            const handleKeyDown = (e) => {
              const items = dropdown.querySelectorAll('.browzer-autofill-item');
              
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelection();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, 0);
                updateSelection();
              } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                items[selectedIndex].click();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                dropdown.remove();
                document.removeEventListener('keydown', handleKeyDown);
              }
            };

            const updateSelection = () => {
              const items = dropdown.querySelectorAll('.browzer-autofill-item');
              items.forEach((item, index) => {
                if (index === selectedIndex) {
                  item.style.backgroundColor = '#e8f0fe';
                } else {
                  item.style.backgroundColor = 'white';
                }
              });
            };

            document.addEventListener('keydown', handleKeyDown);

            // Close on outside click
            setTimeout(() => {
              const closeHandler = (e) => {
                if (!dropdown.contains(e.target)) {
                  dropdown.remove();
                  document.removeEventListener('click', closeHandler);
                  document.removeEventListener('keydown', handleKeyDown);
                }
              };
              document.addEventListener('click', closeHandler);
            }, 100);

            // Add to page
            document.body.appendChild(dropdown);
            console.log('[Browzer] ✅ Autofill dropdown shown with', suggestions.length, 'suggestions');
          })();
        `
      });
    } catch (error) {
      console.error('[PasswordAutofillService] Error showing dropdown:', error);
    }
  }

  /**
   * Hide autofill dropdown
   */
  public async hideAutofillDropdown(): Promise<void> {
    try {
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const dropdown = document.getElementById('browzer-autofill-dropdown');
            if (dropdown) dropdown.remove();
          })();
        `
      });
    } catch (error) {
      console.error('[PasswordAutofillService] Error hiding dropdown:', error);
    }
  }

  /**
   * Reset setup state
   */
  public reset(): void {
    this.isSetup = false;
  }
}
