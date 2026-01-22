import { WebContentsView } from 'electron';

import { PasswordManager } from './PasswordManager';
import { FormDetectorService } from './services/FormDetectorService';
import { PasswordAutofillService } from './services/PasswordAutofillService';
import { PasswordPromptService } from './services/PasswordPromptService';
import { DetectedForm, FormSubmission } from './types';

/**
 * PasswordAutomation - Modern password automation system
 *
 * Orchestrates form detection, autofill, and save prompts
 */
export class PasswordAutomation {
  private view: WebContentsView;
  private debugger: Electron.Debugger;
  private tabId: string;

  private formDetector: FormDetectorService;
  private autofillService: PasswordAutofillService;
  private promptService: PasswordPromptService;

  private isEnabled = false;
  private detectedForms: DetectedForm[] = [];
  private lastUrl = '';
  private selectedCredentialId?: string;

  private onCredentialSelected?: (
    tabId: string,
    credentialId: string,
    username: string
  ) => void;

  constructor(
    view: WebContentsView,
    passwordManager: PasswordManager,
    tabId: string,
    onCredentialSelected?: (
      tabId: string,
      credentialId: string,
      username: string
    ) => void
  ) {
    this.view = view;
    this.debugger = view.webContents.debugger;
    this.tabId = tabId;
    this.onCredentialSelected = onCredentialSelected;

    this.formDetector = new FormDetectorService(view);
    this.autofillService = new PasswordAutofillService(view, passwordManager);
    this.promptService = new PasswordPromptService(view, passwordManager);
  }

  public async start(): Promise<void> {
    if (this.isEnabled) return;

    try {
      // Check if debugger is attached
      if (!this.debugger.isAttached()) {
        console.log(
          '[PasswordAutomation] Debugger not attached yet, skipping setup'
        );
        return;
      }

      this.setupEventListeners();
      await this.scanPage();
      this.isEnabled = true;
    } catch (error) {
      console.error('[PasswordAutomation] Failed to start:', error);
    }
  }

  public async stop(): Promise<void> {
    if (!this.isEnabled) return;

    try {
      this.debugger.removeAllListeners();
      this.detectedForms = [];
      this.autofillService.reset();
      this.promptService.reset();
      this.isEnabled = false;
    } catch (error) {
      console.error('[PasswordAutomation] Error stopping:', error);
    }
  }

  private setupEventListeners(): void {
    this.debugger.on('message', (_event: any, method: string, params: any) => {
      switch (method) {
        case 'Page.frameNavigated':
          this.handleNavigation(params);
          break;
        case 'DOM.documentUpdated':
          this.handleDocumentUpdate();
          break;
        case 'Runtime.consoleAPICalled':
          this.handleConsoleMessage(params);
          break;
      }
    });
  }

  private async handleNavigation(params: any): Promise<void> {
    const newUrl = params.frame.url;
    if (newUrl !== this.lastUrl) {
      this.lastUrl = newUrl;
      this.detectedForms = [];
      this.autofillService.reset();
      setTimeout(() => this.scanPage(), 1000);
    }
  }

  private async handleDocumentUpdate(): Promise<void> {
    setTimeout(() => this.scanPage(), 500);
  }

  private async scanPage(): Promise<void> {
    try {
      const currentUrl = this.view.webContents.getURL();
      if (
        !currentUrl ||
        currentUrl === 'about:blank' ||
        currentUrl.startsWith('browzer://')
      ) {
        return;
      }

      const forms = await this.formDetector.detectForms();
      this.detectedForms = forms;

      if (forms.length === 0) return;

      await this.autofillService.setupAutofill(forms);
      await this.setupFormSubmissionMonitoring(forms);
    } catch (error) {
      console.error('[PasswordAutomation] Error scanning page:', error);
    }
  }

  private async setupFormSubmissionMonitoring(
    forms: DetectedForm[]
  ): Promise<void> {
    try {
      const formData = forms.map((form) => ({
        formId: form.formId,
        formSelector: form.formSelector,
        usernameSelector:
          form.usernameField?.selector || form.emailField?.selector,
        passwordSelector: form.passwordField?.selector,
        origin: form.origin,
      }));

      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            if (window.__browzerFormMonitoring) return;
            window.__browzerFormMonitoring = true;

            const forms = ${JSON.stringify(formData)};

            forms.forEach(formData => {
              let formElement = null;
              if (formData.formSelector) {
                formElement = document.querySelector(formData.formSelector);
              }

              const monitorSubmit = () => {
                const usernameField = formData.usernameSelector ? 
                  document.querySelector(formData.usernameSelector) : null;
                const passwordField = formData.passwordSelector ? 
                  document.querySelector(formData.passwordSelector) : null;

                if (passwordField && passwordField.value) {
                  const username = usernameField ? usernameField.value : '';
                  const password = passwordField.value;

                  console.log('BROWZER_FORM_SUBMIT', JSON.stringify({
                    formId: formData.formId,
                    origin: formData.origin,
                    username: username,
                    password: password,
                    timestamp: Date.now()
                  }));
                }
              };

              if (formElement) {
                formElement.addEventListener('submit', monitorSubmit);
              }

              const buttons = document.querySelectorAll('button[type="submit"], input[type="submit"]');
              buttons.forEach(button => {
                button.addEventListener('click', () => {
                  setTimeout(monitorSubmit, 100);
                });
              });
            });

            console.log('[Browzer] Form monitoring setup');
          })();
        `,
      });
    } catch (error) {
      console.error(
        '[PasswordAutomation] Error setting up form monitoring:',
        error
      );
    }
  }

  private handleConsoleMessage(params: any): void {
    if (params.type !== 'log') return;

    const message = params.args[0]?.value || '';
    if (!message.startsWith('BROWZER_')) return;

    try {
      // Get the JSON data from the second argument if it exists
      const jsonData = params.args[1]?.value || '';
      const fullMessage = jsonData ? `${message} ${jsonData}` : message;

      if (message.startsWith('BROWZER_SHOW_AUTOFILL')) {
        this.handleShowAutofill(fullMessage);
      } else if (message.startsWith('BROWZER_AUTOFILL_SELECT')) {
        this.handleAutofillSelect(fullMessage);
      } else if (message.startsWith('BROWZER_FORM_SUBMIT')) {
        this.handleFormSubmit(fullMessage);
      } else if (message.startsWith('BROWZER_PASSWORD_SAVE')) {
        this.handlePasswordSave(fullMessage);
      } else if (message.startsWith('BROWZER_PASSWORD_UPDATE')) {
        this.handlePasswordUpdate(fullMessage);
      } else if (message.startsWith('BROWZER_PASSWORD_NEVER')) {
        this.handlePasswordNever(fullMessage);
      } else if (message.startsWith('BROWZER_PASSWORD_DISMISS')) {
        this.handlePasswordDismiss();
      }
    } catch (error) {
      console.error(
        '[PasswordAutomation] Error handling console message:',
        error
      );
    }
  }

  private async handleShowAutofill(message: string): Promise<void> {
    try {
      const data = JSON.parse(
        message.replace('BROWZER_SHOW_AUTOFILL', '').trim()
      );
      await this.autofillService.showAutofillDropdown(
        data.suggestions,
        data.fieldRect,
        data.origin
      );
    } catch (error) {
      console.error('[PasswordAutomation] Error showing autofill:', error);
    }
  }

  private async handleAutofillSelect(message: string): Promise<void> {
    try {
      const data = JSON.parse(
        message.replace('BROWZER_AUTOFILL_SELECT', '').trim()
      );
      const { credentialId, username, origin } = data;

      this.selectedCredentialId = credentialId;
      if (this.onCredentialSelected) {
        this.onCredentialSelected(this.tabId, credentialId, username);
      }

      const form = this.detectedForms.find((f) => f.origin === origin);
      if (form) {
        await this.autofillService.fillCredentials(credentialId, form);
      }
    } catch (error) {
      console.error(
        '[PasswordAutomation] Error handling autofill select:',
        error
      );
    }
  }

  private async handleFormSubmit(message: string): Promise<void> {
    try {
      const jsonStr = message.replace('BROWZER_FORM_SUBMIT', '').trim();
      if (!jsonStr) {
        console.error('[PasswordAutomation] Empty JSON data for form submit');
        return;
      }

      const data = JSON.parse(jsonStr);
      const submission: FormSubmission = {
        formId: data.formId,
        origin: data.origin,
        username: data.username,
        password: data.password,
        timestamp: data.timestamp,
        url: this.view.webContents.getURL(),
      };

      setTimeout(async () => {
        await this.promptService.handleFormSubmission(submission);
      }, 1500);
    } catch (error) {
      console.error('[PasswordAutomation] Error handling form submit:', error);
      console.error('[PasswordAutomation] Message was:', message);
    }
  }

  private async handlePasswordSave(message: string): Promise<void> {
    try {
      const data = JSON.parse(
        message.replace('BROWZER_PASSWORD_SAVE', '').trim()
      );
      await this.promptService.handleSavePassword(
        data.origin,
        data.username,
        data.password
      );
    } catch (error) {
      console.error('[PasswordAutomation] Error saving password:', error);
    }
  }

  private async handlePasswordUpdate(message: string): Promise<void> {
    try {
      const data = JSON.parse(
        message.replace('BROWZER_PASSWORD_UPDATE', '').trim()
      );
      await this.promptService.handleUpdatePassword(
        data.origin,
        data.username,
        data.password
      );
    } catch (error) {
      console.error('[PasswordAutomation] Error updating password:', error);
    }
  }

  private handlePasswordNever(message: string): void {
    try {
      const data = JSON.parse(
        message.replace('BROWZER_PASSWORD_NEVER', '').trim()
      );
      this.promptService.handleNeverSave(data.origin);
    } catch (error) {
      console.error('[PasswordAutomation] Error handling never save:', error);
    }
  }

  private handlePasswordDismiss(): void {
    try {
      this.promptService.handleDismiss();
    } catch (error) {
      console.error('[PasswordAutomation] Error handling dismiss:', error);
    }
  }

  public getSelectedCredentialId(): string | undefined {
    return this.selectedCredentialId;
  }

  public clearSelectedCredential(): void {
    this.selectedCredentialId = undefined;
  }
}
