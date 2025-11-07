import { WebContentsView } from 'electron';
import { DetectedForm, FormField, FormHeuristics } from '@/main/password';

/**
 * FormDetectorService - Intelligent form detection using heuristics
 * 
 * Detects login, signup, and password change forms using multiple signals:
 * - Field names, IDs, and autocomplete attributes
 * - Form action URLs
 * - Field visibility and positioning
 * - Submit button text
 * - Page context (URL, title)
 * 
 * Based on Chrome's password manager form detection logic
 */
export class FormDetectorService {
  private view: WebContentsView;
  private debugger: Electron.Debugger;
  private heuristics: FormHeuristics;

  constructor(view: WebContentsView) {
    this.view = view;
    this.debugger = view.webContents.debugger;
    this.heuristics = this.initializeHeuristics();
  }

  /**
   * Initialize form detection heuristics
   */
  private initializeHeuristics(): FormHeuristics {
    return {
      usernamePatterns: [
        /user(name)?/i,
        /login/i,
        /account/i,
        /id/i,
        /^user$/i,
      ],
      emailPatterns: [
        /email/i,
        /e-mail/i,
        /mail/i,
        /@/,
      ],
      passwordPatterns: [
        /pass(word)?/i,
        /pwd/i,
        /secret/i,
        /pin/i,
      ],
      newPasswordPatterns: [
        /new.?pass/i,
        /new.?pwd/i,
        /confirm/i,
        /repeat/i,
      ],
      currentPasswordPatterns: [
        /current.?pass/i,
        /old.?pass/i,
        /existing/i,
      ],
      loginActionPatterns: [
        /login/i,
        /signin/i,
        /sign-in/i,
        /authenticate/i,
        /auth/i,
      ],
      signupActionPatterns: [
        /signup/i,
        /sign-up/i,
        /register/i,
        /create/i,
        /join/i,
      ],
      changePasswordPatterns: [
        /change.?pass/i,
        /update.?pass/i,
        /reset.?pass/i,
        /new.?pass/i,
      ],
      submitButtonPatterns: [
        /submit/i,
        /login/i,
        /sign.?in/i,
        /log.?in/i,
        /continue/i,
        /next/i,
        /enter/i,
      ],
    };
  }

  /**
   * Detect all forms on the current page
   */
  public async detectForms(): Promise<DetectedForm[]> {
    try {
      // Check if debugger is attached
      if (!this.debugger.isAttached()) {
        console.log('[FormDetectorService] Debugger not attached, skipping form detection');
        return [];
      }

      const url = this.view.webContents.getURL();
      if (!url || url === 'about:blank' || url.startsWith('browzer://')) {
        return [];
      }

      const origin = new URL(url).origin;
      const forms: DetectedForm[] = [];

      // Method 1: Detect forms with <form> tags
      const htmlForms = await this.detectHTMLForms(origin);
      forms.push(...htmlForms);

      // Method 2: Detect formless login patterns (modern SPAs)
      const formlessLogins = await this.detectFormlessLogins(origin);
      forms.push(...formlessLogins);

      // Sort by confidence score
      forms.sort((a, b) => b.confidence - a.confidence);

      return forms;
    } catch (error) {
      console.error('[FormDetectorService] Error detecting forms:', error);
      return [];
    }
  }

  /**
   * Detect forms with <form> HTML tags
   */
  private async detectHTMLForms(origin: string): Promise<DetectedForm[]> {
    const forms: DetectedForm[] = [];

    try {
      const result = await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const forms = Array.from(document.querySelectorAll('form'));
            return forms.map((form, index) => {
              const passwordFields = Array.from(form.querySelectorAll('input[type="password"]'));
              if (passwordFields.length === 0) return null;

              const textFields = Array.from(form.querySelectorAll('input[type="text"], input[type="email"], input:not([type])'));
              const submitButtons = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])'));

              return {
                formIndex: index,
                action: form.action || '',
                method: form.method || 'POST',
                id: form.id || '',
                name: form.name || '',
                passwordFields: passwordFields.map(field => ({
                  id: field.id || '',
                  name: field.name || '',
                  autocomplete: field.autocomplete || '',
                  placeholder: field.placeholder || '',
                  value: field.value || '',
                  isVisible: field.offsetWidth > 0 && field.offsetHeight > 0
                })),
                textFields: textFields.map(field => ({
                  type: field.type || 'text',
                  id: field.id || '',
                  name: field.name || '',
                  autocomplete: field.autocomplete || '',
                  placeholder: field.placeholder || '',
                  value: field.value || '',
                  isVisible: field.offsetWidth > 0 && field.offsetHeight > 0
                })),
                submitButtons: submitButtons.map(btn => ({
                  text: btn.textContent?.trim() || btn.value || '',
                  type: btn.type || 'button'
                }))
              };
            }).filter(f => f !== null);
          })();
        `,
        returnByValue: true,
      });

      const formData = result.result?.value || [];

      for (const data of formData) {
        const detectedForm = await this.analyzeFormData(data, origin);
        if (detectedForm) {
          forms.push(detectedForm);
        }
      }
    } catch (error) {
      console.error('[FormDetectorService] Error detecting HTML forms:', error);
    }

    return forms;
  }

  /**
   * Detect formless login patterns (SPAs without <form> tags)
   */
  private async detectFormlessLogins(origin: string): Promise<DetectedForm[]> {
    const forms: DetectedForm[] = [];

    try {
      const result = await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            // Find all password fields not inside a form
            const passwordFields = Array.from(document.querySelectorAll('input[type="password"]'))
              .filter(field => !field.closest('form'));

            return passwordFields.map((passwordField, index) => {
              // Find nearby text/email fields (within same container)
              const container = passwordField.closest('div, section, main, [role="main"]') || document.body;
              const textFields = Array.from(container.querySelectorAll('input[type="text"], input[type="email"], input:not([type])'))
                .filter(field => !field.closest('form') && field.offsetWidth > 0 && field.offsetHeight > 0);

              // Find nearby submit buttons
              const buttons = Array.from(container.querySelectorAll('button, input[type="submit"]'))
                .filter(btn => !btn.closest('form'));

              return {
                formIndex: index,
                isFormless: true,
                passwordField: {
                  id: passwordField.id || '',
                  name: passwordField.name || '',
                  autocomplete: passwordField.autocomplete || '',
                  placeholder: passwordField.placeholder || '',
                  value: passwordField.value || '',
                  isVisible: passwordField.offsetWidth > 0 && passwordField.offsetHeight > 0
                },
                textFields: textFields.map(field => ({
                  type: field.type || 'text',
                  id: field.id || '',
                  name: field.name || '',
                  autocomplete: field.autocomplete || '',
                  placeholder: field.placeholder || '',
                  value: field.value || '',
                  isVisible: field.offsetWidth > 0 && field.offsetHeight > 0
                })),
                buttons: buttons.map(btn => ({
                  text: btn.textContent?.trim() || btn.value || '',
                  type: btn.type || 'button'
                }))
              };
            });
          })();
        `,
        returnByValue: true,
      });

      const formlessData = result.result?.value || [];

      for (const data of formlessData) {
        const detectedForm = await this.analyzeFormlessData(data, origin);
        if (detectedForm) {
          forms.push(detectedForm);
        }
      }
    } catch (error) {
      console.error('[FormDetectorService] Error detecting formless logins:', error);
    }

    return forms;
  }

  /**
   * Analyze form data and classify form type
   */
  private async analyzeFormData(data: any, origin: string): Promise<DetectedForm | null> {
    const passwordFields = data.passwordFields || [];
    const textFields = data.textFields || [];
    const submitButtons = data.submitButtons || [];

    if (passwordFields.length === 0) return null;

    // Classify password fields
    const currentPasswordField = this.findCurrentPasswordField(passwordFields);
    const newPasswordField = this.findNewPasswordField(passwordFields);
    const confirmPasswordField = passwordFields.length > 2 ? passwordFields[2] : null;

    // Classify text fields
    const emailField = this.findEmailField(textFields);
    const usernameField = this.findUsernameField(textFields);

    // Determine form type
    let formType: 'login' | 'signup' | 'change-password' | 'multi-step' = 'login';
    let confidence = 0.5;

    if (passwordFields.length >= 2 && newPasswordField) {
      if (currentPasswordField) {
        formType = 'change-password';
        confidence = 0.9;
      } else {
        formType = 'signup';
        confidence = 0.85;
      }
    } else if (passwordFields.length === 1) {
      if (!usernameField && !emailField) {
        formType = 'multi-step';
        confidence = 0.7;
      } else {
        formType = 'login';
        confidence = 0.8;
      }
    }

    // Boost confidence based on form action
    if (data.action) {
      if (this.matchesPatterns(data.action, this.heuristics.loginActionPatterns)) {
        formType = 'login';
        confidence = Math.min(confidence + 0.1, 1.0);
      } else if (this.matchesPatterns(data.action, this.heuristics.signupActionPatterns)) {
        formType = 'signup';
        confidence = Math.min(confidence + 0.1, 1.0);
      } else if (this.matchesPatterns(data.action, this.heuristics.changePasswordPatterns)) {
        formType = 'change-password';
        confidence = Math.min(confidence + 0.1, 1.0);
      }
    }

    const formId = `form_${data.formIndex}_${Date.now()}`;

    return {
      formId,
      formSelector: data.id ? `#${data.id}` : `form:nth-of-type(${data.formIndex + 1})`,
      action: data.action,
      method: data.method,
      origin,
      usernameField,
      emailField,
      passwordField: currentPasswordField || passwordFields[0],
      newPasswordField,
      confirmPasswordField,
      submitButton: submitButtons[0] ? { selector: '', text: submitButtons[0].text } : undefined,
      formType,
      confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * Analyze formless data
   */
  private async analyzeFormlessData(data: any, origin: string): Promise<DetectedForm | null> {
    if (!data.passwordField) return null;

    const textFields = data.textFields || [];
    const emailField = this.findEmailField(textFields);
    const usernameField = this.findUsernameField(textFields);

    const formId = `formless_${data.formIndex}_${Date.now()}`;

    return {
      formId,
      origin,
      usernameField,
      emailField,
      passwordField: data.passwordField,
      formType: 'login',
      confidence: 0.7, // Lower confidence for formless
      timestamp: Date.now(),
    };
  }

  /**
   * Find email field from text fields
   */
  private findEmailField(textFields: any[]): FormField | undefined {
    const emailField = textFields.find(field => 
      field.type === 'email' ||
      this.matchesPatterns(field.name, this.heuristics.emailPatterns) ||
      this.matchesPatterns(field.id, this.heuristics.emailPatterns) ||
      this.matchesPatterns(field.autocomplete, this.heuristics.emailPatterns) ||
      this.matchesPatterns(field.placeholder, this.heuristics.emailPatterns)
    );

    if (!emailField) return undefined;

    return {
      selector: emailField.id ? `#${emailField.id}` : `input[name="${emailField.name}"]`,
      type: 'email',
      name: emailField.name,
      id: emailField.id,
      autocomplete: emailField.autocomplete,
      value: emailField.value,
      isVisible: emailField.isVisible,
      confidence: 0.9,
    };
  }

  /**
   * Find username field from text fields
   */
  private findUsernameField(textFields: any[]): FormField | undefined {
    const usernameField = textFields.find(field => 
      this.matchesPatterns(field.name, this.heuristics.usernamePatterns) ||
      this.matchesPatterns(field.id, this.heuristics.usernamePatterns) ||
      this.matchesPatterns(field.autocomplete, ['username']) ||
      this.matchesPatterns(field.placeholder, this.heuristics.usernamePatterns)
    );

    if (!usernameField) return undefined;

    return {
      selector: usernameField.id ? `#${usernameField.id}` : `input[name="${usernameField.name}"]`,
      type: 'username',
      name: usernameField.name,
      id: usernameField.id,
      autocomplete: usernameField.autocomplete,
      value: usernameField.value,
      isVisible: usernameField.isVisible,
      confidence: 0.85,
    };
  }

  /**
   * Find current password field
   */
  private findCurrentPasswordField(passwordFields: any[]): FormField | undefined {
    const currentField = passwordFields.find(field =>
      this.matchesPatterns(field.autocomplete, ['current-password']) ||
      this.matchesPatterns(field.name, this.heuristics.currentPasswordPatterns) ||
      this.matchesPatterns(field.id, this.heuristics.currentPasswordPatterns)
    );

    if (!currentField && passwordFields.length === 1) {
      return this.createPasswordField(passwordFields[0], 'current-password');
    }

    return currentField ? this.createPasswordField(currentField, 'current-password') : undefined;
  }

  /**
   * Find new password field
   */
  private findNewPasswordField(passwordFields: any[]): FormField | undefined {
    const newField = passwordFields.find(field =>
      this.matchesPatterns(field.autocomplete, ['new-password']) ||
      this.matchesPatterns(field.name, this.heuristics.newPasswordPatterns) ||
      this.matchesPatterns(field.id, this.heuristics.newPasswordPatterns)
    );

    return newField ? this.createPasswordField(newField, 'new-password') : undefined;
  }

  /**
   * Create FormField from password field data
   */
  private createPasswordField(field: any, type: 'password' | 'current-password' | 'new-password'): FormField {
    return {
      selector: field.id ? `#${field.id}` : `input[name="${field.name}"]`,
      type,
      name: field.name,
      id: field.id,
      autocomplete: field.autocomplete,
      value: field.value,
      isVisible: field.isVisible,
      confidence: 0.95,
    };
  }

  /**
   * Check if text matches any pattern
   */
  private matchesPatterns(text: string | undefined, patterns: (RegExp | string)[]): boolean {
    if (!text) return false;
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        return text.toLowerCase().includes(pattern.toLowerCase());
      }
      return pattern.test(text);
    });
  }
}
