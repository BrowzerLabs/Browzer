/* eslint-disable @typescript-eslint/no-explicit-any */
import { WebContentsView } from 'electron';
import { PasswordManager } from '../PasswordManager';

/**
 * PasswordAutomation - CDP-based password management system
 * 
 * Uses Chrome DevTools Protocol for reliable password detection and autofill
 * across all websites without script injection limitations.
 * 
 * Features:
 * - Real-time form detection via CDP DOM events
 * - Cross-domain session tracking
 * - Federated authentication support
 * - CSP-proof implementation
 * - Multi-step login flow handling
 */
export class PasswordAutomation {
  private view: WebContentsView;
  private debugger: Electron.Debugger;
  private passwordManager: PasswordManager;
  private isEnabled = false;
  private tabId: string;
  
  // Session tracking for multi-step logins
  private loginSessions: Map<string, LoginSession> = new Map();
  private currentSessionId: string | null = null;
  
  // Form monitoring state
  private monitoredForms: Set<number> = new Set();
  private lastUrl = '';
  
  // Pending credentials that need save prompt
  private pendingCredentials: {
    username: string;
    password: string;
    origin: string;
    timestamp: number;
  } | null = null;
  
  // Callback to store selected credential in main process
  private onCredentialSelected?: (tabId: string, credentialId: string, username: string) => void;
  private onAutoFillPassword?: (tabId: string) => Promise<void>;

  constructor(
    view: WebContentsView, 
    passwordManager: PasswordManager, 
    tabId: string,
    onCredentialSelected?: (tabId: string, credentialId: string, username: string) => void,
    onAutoFillPassword?: (tabId: string) => Promise<void>
  ) {
    this.view = view;
    this.debugger = view.webContents.debugger;
    this.passwordManager = passwordManager;
    this.tabId = tabId;
    this.onCredentialSelected = onCredentialSelected;
    this.onAutoFillPassword = onAutoFillPassword;
  }

  /**
   * Start password automation for this view
   */
  public async start(): Promise<void> {
    if (this.isEnabled) return;
    
    try {
      console.log('[PasswordAutomation] Starting CDP-based password automation');
      
      // Attach debugger if not already attached
      if (!this.debugger.isAttached()) {
        this.debugger.attach('1.3');
      }
      
      // Enable required CDP domains
      await this.enableCDPDomains();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Initial page scan
      await this.scanForForms();
      
      this.isEnabled = true;
      console.log('✅ Password automation enabled');
      
    } catch (error) {
      console.error('[PasswordAutomation] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop password automation
   */
  public async stop(): Promise<void> {
    if (!this.isEnabled) return;
    
    try {
      // Remove event listeners
      this.debugger.removeAllListeners();
      
      // Clear state
      this.loginSessions.clear();
      this.monitoredForms.clear();
      this.currentSessionId = null;
      
      this.isEnabled = false;
      console.log('[PasswordAutomation] Stopped');
      
    } catch (error) {
      console.error('[PasswordAutomation] Error stopping:', error);
    }
  }

  /**
   * Enable required CDP domains
   */
  private async enableCDPDomains(): Promise<void> {
    await this.debugger.sendCommand('DOM.enable');
    await this.debugger.sendCommand('Page.enable');
    await this.debugger.sendCommand('Runtime.enable');
    
    // Get initial document
    await this.debugger.sendCommand('DOM.getDocument', { depth: -1 });
    
    console.log('✅ CDP domains enabled for password automation');
  }

  /**
   * Set up CDP event listeners
   */
  private setupEventListeners(): void {
    // Page navigation events
    this.debugger.on('message', (event: any, method: string, params: any) => {
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

    // Enable console API to capture form submissions
    this.debugger.sendCommand('Runtime.enable');
    this.debugger.sendCommand('Console.enable');
  }

  /**
   * Handle page navigation
   */
  private async handleNavigation(params: any): Promise<void> {
    const newUrl = params.frame.url;
    const urlChanged = newUrl !== this.lastUrl;
    
    if (urlChanged) {
      console.log(`[PasswordAutomation] Navigation detected: ${newUrl}`);
      this.lastUrl = newUrl;
      
      // Update session tracking
      await this.updateSessionForNavigation(newUrl);
      
      // Show pending save prompt on new page if exists
      if (this.pendingCredentials) {
        console.log('[PasswordAutomation] Showing pending save prompt on new page');
        setTimeout(async () => {
          if (this.pendingCredentials) {
            await this.showSavePrompt(
              this.pendingCredentials.username,
              this.pendingCredentials.password,
              this.pendingCredentials.origin
            );
          }
        }, 1500); // Longer delay for page to fully load
      }
      
      // Trigger auto-fill via main process callback
      if (this.onAutoFillPassword) {
        console.log('[PasswordAutomation] Requesting auto-fill from main process');
        setTimeout(async () => {
          if (this.onAutoFillPassword) {
            await this.onAutoFillPassword(this.tabId);
          }
        }, 1000);
      }
      
      // Scan for forms on new page
      setTimeout(() => this.scanForForms(), 1000);
      
      // Also set up autofill immediately for any existing fields
      setTimeout(() => this.setupImmediateAutofill(), 1200);
    }
  }

  /**
   * Store pending credentials for cross-navigation persistence
   */
  private storePendingCredentials(username: string, password: string, origin: string): void {
    this.pendingCredentials = {
      username,
      password,
      origin,
      timestamp: Date.now()
    };
    console.log('[PasswordAutomation] Stored pending credentials for:', username);
  }

  /**
   * Clear pending credentials
   */
  private clearPendingCredentials(): void {
    this.pendingCredentials = null;
    console.log('[PasswordAutomation] Cleared pending credentials');
  }

  /**
   * Check if URL is related to the original login origin (for multi-step flows)
   */
  private isRelatedOrigin(originalOrigin: string, newUrl: string): boolean {
    try {
      const newOrigin = new URL(newUrl).origin;
      
      // Same origin
      if (originalOrigin === newOrigin) return true;
      
      // Common multi-step patterns
      const patterns = [
        ['accounts.google.com', 'mail.google.com'],
        ['login.microsoftonline.com', 'outlook.office.com'],
        ['login.microsoftonline.com', 'sso.godaddy.com']
      ];
      
      return patterns.some(pattern => 
        (originalOrigin.includes(pattern[0]) && newUrl.includes(pattern[1])) ||
        (originalOrigin.includes(pattern[1]) && newUrl.includes(pattern[0]))
      );
    } catch {
      return false;
    }
  }


  /**
   * Set up immediate autofill for any username fields on the page
   */
  private async setupImmediateAutofill(): Promise<void> {
    try {
      const currentUrl = this.view.webContents.getURL();
      if (!currentUrl || currentUrl === 'about:blank') return;
      
      const origin = new URL(currentUrl).origin;
      const credentials = this.passwordManager.getCredentialsForOrigin(origin);
      
      if (credentials.length === 0) {
        console.log('[PasswordAutomation] No credentials for immediate autofill on', origin);
        return;
      }
      
      console.log('[PasswordAutomation] Setting up immediate autofill for', credentials.length, 'credentials');
      
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            try {
              console.log('[PasswordAutomation] Immediate autofill setup starting');
              
              const usernameFields = document.querySelectorAll('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"], input[id*="user"], input[id*="email"]');
              const credentials = ${JSON.stringify(credentials.map(c => ({ id: c.id, username: c.username })))};
              
              console.log('[PasswordAutomation] Found', usernameFields.length, 'fields for immediate autofill');
              
              usernameFields.forEach((field, index) => {
                if (!field._browzerImmediateAutofill && credentials.length > 0) {
                  field._browzerImmediateAutofill = true;
                  
                  console.log('[PasswordAutomation] Setting up immediate autofill for field', index);
                  
                  // Function to show autofill
                  const showAutofill = () => {
                    console.log('BROWZER_SHOW_AUTOFILL_DROPDOWN:' + JSON.stringify({
                      origin: '${origin}',
                      credentials: credentials
                    }));
                  };
                  
                  // Check if already focused and show immediately
                  if (document.activeElement === field) {
                    console.log('[PasswordAutomation] Field', index, 'is already focused, showing autofill now');
                    setTimeout(showAutofill, 50); // Small delay to ensure DOM is ready
                  }
                  
                  // Set up event listeners
                  field.addEventListener('focus', showAutofill);
                  field.addEventListener('click', showAutofill);
                  
                  // Show on empty input
                  field.addEventListener('input', function() {
                    if (this.value.length === 0) {
                      showAutofill();
                    }
                  });
                }
              });
              
              console.log('[PasswordAutomation] ✅ Immediate autofill setup complete');
              
            } catch (error) {
              console.error('[PasswordAutomation] Error in immediate autofill setup:', error);
            }
          })();
        `
      });
      
    } catch (error) {
      console.error('[PasswordAutomation] Error setting up immediate autofill:', error);
    }
  }

  /**
   * Handle DOM updates (dynamic content)
   */
  private async handleDocumentUpdate(): Promise<void> {
    // Re-scan for forms when DOM changes
    setTimeout(() => this.scanForForms(), 500);
  }

  /**
   * Scan page for login forms and set up monitoring
   */
  private async scanForForms(): Promise<void> {
    try {
      const currentUrl = this.view.webContents.getURL();
      if (!currentUrl || currentUrl === 'about:blank' || currentUrl.startsWith('browzer://')) {
        return;
      }
      
      const origin = new URL(currentUrl).origin;
      
      // Find all forms with password fields
      const forms = await this.findLoginForms();
      
      if (forms.length === 0) {
        console.log('[PasswordAutomation] No login forms detected');
        return;
      }
      
      console.log(`[PasswordAutomation] Found ${forms.length} login forms`);
      
      // Set up monitoring for each form
      for (const form of forms) {
        await this.setupFormMonitoring(form, origin);
      }
      
      // Set up autofill for existing credentials
      await this.setupAutofill(forms, origin);
      
      // Also set up immediate autofill (separate from form-based setup)
      await this.setupImmediateAutofill();
      
    } catch (error) {
      console.error('[PasswordAutomation] Error scanning forms:', error);
    }
  }

  /**
   * Find login forms using CDP DOM queries
   */
  private async findLoginForms(): Promise<LoginForm[]> {
    const forms: LoginForm[] = [];
    
    try {
      // Get all forms
      const { nodeIds: formNodeIds } = await this.debugger.sendCommand('DOM.querySelectorAll', {
        nodeId: await this.getRootNodeId(),
        selector: 'form'
      });
      
      // Check each form for login fields
      for (const formNodeId of formNodeIds) {
        const form = await this.analyzeForm(formNodeId);
        if (form) {
          forms.push(form);
        }
      }
      
      // Also check for forms without <form> tags (modern SPAs)
      const passwordFields = await this.findPasswordFields();
      for (const passwordField of passwordFields) {
        const form = await this.analyzePasswordField(passwordField);
        if (form) {
          forms.push(form);
        }
      }
      
    } catch (error) {
      console.error('[PasswordAutomation] Error finding forms:', error);
    }
    
    return forms;
  }

  /**
   * Analyze a form to determine if it's a login form
   */
  private async analyzeForm(formNodeId: number): Promise<LoginForm | null> {
    try {
      // Find password fields in this form
      const { nodeIds: passwordNodeIds } = await this.debugger.sendCommand('DOM.querySelectorAll', {
        nodeId: formNodeId,
        selector: 'input[type="password"]'
      });
      
      if (passwordNodeIds.length === 0) return null;
      
      // Find username/email fields
      const { nodeIds: usernameNodeIds } = await this.debugger.sendCommand('DOM.querySelectorAll', {
        nodeId: formNodeId,
        selector: 'input[type="email"], input[type="text"], input[name*="user"], input[name*="email"], input[id*="user"], input[id*="email"]'
      });
      
      // Get form attributes
      const formAttributes = await this.getNodeAttributes(formNodeId);
      
      return {
        formNodeId,
        action: formAttributes.action || '',
        method: formAttributes.method || 'POST',
        usernameFields: usernameNodeIds,
        passwordFields: passwordNodeIds,
        isMultiStep: usernameNodeIds.length === 0 && passwordNodeIds.length > 0
      };
      
    } catch (error) {
      console.error('[PasswordAutomation] Error analyzing form:', error);
      return null;
    }
  }

  /**
   * Analyze standalone password field (for SPAs)
   */
  private async analyzePasswordField(passwordNodeId: number): Promise<LoginForm | null> {
    try {
      // Find nearby username fields (within same container)
      const parentNodeId = await this.getParentContainer(passwordNodeId);
      
      const { nodeIds: usernameNodeIds } = await this.debugger.sendCommand('DOM.querySelectorAll', {
        nodeId: parentNodeId,
        selector: 'input[type="email"], input[type="text"], input[name*="user"], input[name*="email"]'
      });
      
      return {
        formNodeId: parentNodeId,
        action: '',
        method: 'POST',
        usernameFields: usernameNodeIds,
        passwordFields: [passwordNodeId],
        isMultiStep: usernameNodeIds.length === 0
      };
      
    } catch (error) {
      console.error('[PasswordAutomation] Error analyzing password field:', error);
      return null;
    }
  }

  /**
   * Find all password fields on the page
   */
  private async findPasswordFields(): Promise<number[]> {
    try {
      const { nodeIds } = await this.debugger.sendCommand('DOM.querySelectorAll', {
        nodeId: await this.getRootNodeId(),
        selector: 'input[type="password"]:not([style*="display: none"]):not([style*="visibility: hidden"])'
      });
      
      // Filter out hidden fields
      const visibleFields = [];
      for (const nodeId of nodeIds) {
        if (await this.isElementVisible(nodeId)) {
          visibleFields.push(nodeId);
        }
      }
      
      return visibleFields;
    } catch (error) {
      console.error('[PasswordAutomation] Error finding password fields:', error);
      return [];
    }
  }

  /**
   * Set up monitoring for form submission
   */
  private async setupFormMonitoring(form: LoginForm, origin: string): Promise<void> {
    if (this.monitoredForms.has(form.formNodeId)) return;
    
    try {
      // Simple form monitoring with better error handling
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            try {
              const forms = document.querySelectorAll('form');
              const passwordFields = document.querySelectorAll('input[type="password"]');
              const usernameFields = document.querySelectorAll('input[type="email"], input[type="text"]');
              
              // Monitor form submissions
              forms.forEach(form => {
                if (!form._browzerMonitored) {
                  form._browzerMonitored = true;
                  form.addEventListener('submit', function(e) {
                    const username = form.querySelector('input[type="email"], input[type="text"]')?.value || '';
                    const password = form.querySelector('input[type="password"]')?.value || '';
                    
                    if (username && password) {
                      console.log('BROWZER_CREDENTIALS_SUBMITTED:' + JSON.stringify({
                        username: username,
                        password: password,
                        origin: '${origin}',
                        timestamp: Date.now()
                      }));
                    }
                  });
                }
              });
              
              // Monitor username fields for autofill
              usernameFields.forEach(field => {
                if (!field._browzerAutofillSetup) {
                  field._browzerAutofillSetup = true;
                  field.addEventListener('focus', function() {
                    console.log('BROWZER_REQUEST_AUTOFILL:' + JSON.stringify({
                      origin: '${origin}',
                      fieldType: 'username'
                    }));
                  });
                }
              });
              
              console.log('Password monitoring setup complete for ${origin}');
            } catch (error) {
              console.error('Error setting up password monitoring:', error);
            }
          })();
        `
      });
      
      this.monitoredForms.add(form.formNodeId);
      console.log(`[PasswordAutomation] Monitoring form ${form.formNodeId}`);
      
    } catch (error) {
      console.error('[PasswordAutomation] Error setting up form monitoring:', error);
    }
  }

  /**
   * Set up autofill for existing credentials
   */
  private async setupAutofill(forms: LoginForm[], origin: string): Promise<void> {
    const credentials = this.passwordManager.getCredentialsForOrigin(origin);
    
    if (credentials.length === 0) {
      console.log('[PasswordAutomation] No saved credentials for', origin);
      return;
    }
    
    console.log(`[PasswordAutomation] Setting up autofill for ${credentials.length} credentials on ${origin}`);
    
    // Set up autofill for all username/email fields on the page
    await this.setupGlobalAutofill(origin, credentials);
  }

  /**
   * Set up global autofill for all username fields
   */
  private async setupGlobalAutofill(origin: string, credentials: any[]): Promise<void> {
    try {
      console.log('[PasswordAutomation] Setting up global autofill for', credentials.length, 'credentials');
      
      await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            try {
              console.log('[PasswordAutomation] Setting up autofill on page');
              
              // Find all potential username fields
              const usernameFields = document.querySelectorAll('input[type="email"], input[type="text"], input[name*="user"], input[name*="email"], input[id*="user"], input[id*="email"]');
              const credentials = ${JSON.stringify(credentials.map(c => ({ id: c.id, username: c.username })))};
              
              console.log('[PasswordAutomation] Found', usernameFields.length, 'username fields and', credentials.length, 'credentials');
              
              usernameFields.forEach((field, index) => {
                if (!field._browzerAutofillSetup && credentials.length > 0) {
                  field._browzerAutofillSetup = true;
                  
                  console.log('[PasswordAutomation] Setting up autofill for field', index);
                  
                  // Check if field is already focused and show autofill immediately
                  if (document.activeElement === field) {
                    console.log('[PasswordAutomation] Field already focused, showing autofill immediately');
                    setTimeout(() => {
                      console.log('BROWZER_SHOW_AUTOFILL_DROPDOWN:' + JSON.stringify({
                        origin: '${origin}',
                        credentials: credentials
                      }));
                    }, 50); // Faster response
                  }
                  
                  // Show autofill on focus (instant)
                  field.addEventListener('focus', function() {
                    console.log('[PasswordAutomation] Username field focused, showing autofill instantly');
                    console.log('BROWZER_SHOW_AUTOFILL_DROPDOWN:' + JSON.stringify({
                      origin: '${origin}',
                      credentials: credentials
                    }));
                  });
                  
                  // Show autofill on click (instant)
                  field.addEventListener('click', function() {
                    console.log('[PasswordAutomation] Username field clicked, showing autofill instantly');
                    console.log('BROWZER_SHOW_AUTOFILL_DROPDOWN:' + JSON.stringify({
                      origin: '${origin}',
                      credentials: credentials
                    }));
                  });
                  
                  // Also show on input (for better UX)
                  field.addEventListener('input', function() {
                    if (this.value.length === 0) {
                      console.log('[PasswordAutomation] Empty field, showing autofill');
                      console.log('BROWZER_SHOW_AUTOFILL_DROPDOWN:' + JSON.stringify({
                        origin: '${origin}',
                        credentials: credentials
                      }));
                    }
                  });
                }
              });
              
              console.log('[PasswordAutomation] ✅ Global autofill setup complete');
              
            } catch (error) {
              console.error('[PasswordAutomation] Error in global autofill setup:', error);
            }
          })();
        `
      });
      
    } catch (error) {
      console.error('[PasswordAutomation] Error setting up global autofill:', error);
    }
  }

  /**
   * Handle console messages from injected scripts
   */
  private handleConsoleMessage(params: any): void {
    if (params.type !== 'log') return;
    
    const message = params.args[0]?.value || '';
    
    // Only handle our specific messages
    if (!message.startsWith('BROWZER_')) return;
    
    if (message.startsWith('BROWZER_CREDENTIALS_SUBMITTED:')) {
      this.handleCredentialsSubmitted(message);
    } else if (message.startsWith('BROWZER_REQUEST_AUTOFILL:')) {
      this.handleAutofillRequest(message);
    } else if (message.startsWith('BROWZER_SHOW_AUTOFILL_DROPDOWN:')) {
      this.handleShowAutofillDropdown(message);
    } else if (message.startsWith('BROWZER_SAVE_PASSWORD:')) {
      this.handleSavePassword(message);
    } else if (message.startsWith('BROWZER_NEVER_SAVE:')) {
      this.handleNeverSave(message);
    } else if (message.startsWith('BROWZER_AUTOFILL_SELECTED:')) {
      this.handleAutofillSelected(message);
    } else if (message.startsWith('BROWZER_FILL_PASSWORD:')) {
      this.handleFillPassword(message);
    } else if (message.startsWith('BROWZER_CREDENTIAL_SELECTED:')) {
      this.handleCredentialSelected(message);
    }
  }

  /**
   * Handle credentials submitted
   */
  private async handleCredentialsSubmitted(message: string): Promise<void> {
    try {
      const jsonStr = message.replace('BROWZER_CREDENTIALS_SUBMITTED:', '').trim();
      if (!jsonStr) return;
      
      const data = JSON.parse(jsonStr);
      console.log('[PasswordAutomation] Credentials submitted:', data.username, 'for', data.origin);
      
      // Check if already saved
      const existing = this.passwordManager.getCredentialsForOrigin(data.origin)
        .find(c => c.username === data.username);
      
      if (!existing) {
        console.log('[PasswordAutomation] New credential detected, showing save prompt');
        
        // Store credentials for persistent prompt across navigation
        this.storePendingCredentials(data.username, data.password, data.origin);
        
        // Show prompt immediately
        await this.showSavePrompt(data.username, data.password, data.origin);
      } else {
        console.log('[PasswordAutomation] Credential already exists for:', data.username);
      }
    } catch (error) {
      console.error('[PasswordAutomation] Error handling credentials submission:', error);
    }
  }

  /**
   * Handle autofill request
   */
  private async handleAutofillRequest(message: string): Promise<void> {
    try {
      const jsonStr = message.replace('BROWZER_REQUEST_AUTOFILL:', '').trim();
      if (!jsonStr) return;
      
      const data = JSON.parse(jsonStr);
      const credentials = this.passwordManager.getCredentialsForOrigin(data.origin);
      
      if (credentials.length > 0) {
        await this.showAutofillDropdown('username', credentials);
      }
    } catch (error) {
      console.error('[PasswordAutomation] Error handling autofill request:', error);
    }
  }

  /**
   * Handle show autofill dropdown request
   */
  private async handleShowAutofillDropdown(message: string): Promise<void> {
    try {
      const jsonStr = message.replace('BROWZER_SHOW_AUTOFILL_DROPDOWN:', '').trim();
      if (!jsonStr) return;
      
      const data = JSON.parse(jsonStr);
      console.log('[PasswordAutomation] Showing autofill dropdown instantly for', data.credentials.length, 'credentials');
      
      // Create dropdown immediately without delay
      await this.createAutofillDropdown(data.origin, data.credentials);
    } catch (error) {
      console.error('[PasswordAutomation] Error handling autofill dropdown:', error);
    }
  }


  /**
   * Handle save password request
   */
  private async handleSavePassword(message: string): Promise<void> {
    try {
      const data = JSON.parse(message.replace('BROWZER_SAVE_PASSWORD:', ''));
      const success = await this.passwordManager.saveCredential(data.origin, data.username, data.password);
      
      if (success) {
        console.log('[PasswordAutomation] Password saved successfully');
        this.clearPendingCredentials();
      } else {
        console.error('[PasswordAutomation] Failed to save password');
      }
    } catch (error) {
      console.error('[PasswordAutomation] Error saving password:', error);
    }
  }

  /**
   * Handle never save request
   */
  private handleNeverSave(message: string): void {
    try {
      const data = JSON.parse(message.replace('BROWZER_NEVER_SAVE:', ''));
      this.passwordManager.addToBlacklist(data.origin);
      this.clearPendingCredentials();
      console.log('[PasswordAutomation] Site added to blacklist');
    } catch (error) {
      console.error('[PasswordAutomation] Error adding to blacklist:', error);
    }
  }

  /**
   * Handle autofill selection
   */
  private async handleAutofillSelected(message: string): Promise<void> {
    try {
      const data = JSON.parse(message.replace('BROWZER_AUTOFILL_SELECTED:', ''));
      const password = this.passwordManager.getPassword(data.credentialId);
      
      if (password) {
        // Fill password field
        await this.debugger.sendCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const passwordField = document.querySelector('input[type="password"]');
              if (passwordField) {
                passwordField.value = '${password.replace(/'/g, "\\'")}';
                passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                passwordField.dispatchEvent(new Event('change', { bubbles: true }));
              }
            })();
          `
        });
        
        console.log('[PasswordAutomation] Password autofilled');
      }
    } catch (error) {
      console.error('[PasswordAutomation] Error handling autofill selection:', error);
    }
  }

  /**
   * Handle password fill request
   */
  private async handleFillPassword(message: string): Promise<void> {
    try {
      const jsonStr = message.replace('BROWZER_FILL_PASSWORD:', '').trim();
      if (!jsonStr) return;
      
      const data = JSON.parse(jsonStr);
      const password = this.passwordManager.getPassword(data.credentialId);
      
      if (password) {
        console.log('[PasswordAutomation] Filling password for credential:', data.credentialId);
        
        await this.debugger.sendCommand('Runtime.evaluate', {
          expression: `
            (function() {
              const passwordField = document.querySelector('input[type="password"]');
              if (passwordField) {
                passwordField.value = '${password.replace(/'/g, "\\'")}';
                passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                passwordField.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('[PasswordAutomation] ✅ Password filled successfully');
              } else {
                console.log('[PasswordAutomation] ❌ No password field found');
              }
            })();
          `
        });
      } else {
        console.log('[PasswordAutomation] No password found for credential:', data.credentialId);
      }
    } catch (error) {
      console.error('[PasswordAutomation] Error filling password:', error);
    }
  }

  /**
   * Handle credential selection for multi-step flows
   */
  private handleCredentialSelected(message: string): void {
    try {
      const jsonStr = message.replace('BROWZER_CREDENTIAL_SELECTED:', '').trim();
      if (!jsonStr) return;
      
      const data = JSON.parse(jsonStr);
      
      // Store selected credential in main process via callback
      if (this.onCredentialSelected) {
        this.onCredentialSelected(this.tabId, data.credentialId, data.username);
      }
      
      console.log('[PasswordAutomation] Notified main process of credential selection:', data.username);
    } catch (error) {
      console.error('[PasswordAutomation] Error handling credential selection:', error);
    }
  }

  /**
   * Show save password prompt
   */
  private async showSavePrompt(username: string, password: string, origin: string): Promise<void> {
    // Check if already saved
    const existing = this.passwordManager.getCredentialsForOrigin(origin)
      .find(c => c.username === username);
    
    if (existing) {
      console.log('[PasswordAutomation] Credential already exists, skipping prompt');
      return;
    }
    
    console.log('[PasswordAutomation] Showing save prompt for:', username, 'on', origin);
    
    // Create persistent prompt that survives navigation
    try {
      // First try to create prompt on current page
      await this.createSavePromptOnPage(username, password, origin);
      
    } catch (error) {
      console.error('[PasswordAutomation] Failed to create save prompt:', error);
    }
  }

  /**
   * Create save prompt on current page
   */
  private async createSavePromptOnPage(username: string, password: string, origin: string): Promise<void> {
    console.log('[PasswordAutomation] Creating save prompt on page for:', username);
    
    await this.debugger.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          console.log('[PasswordAutomation] Executing prompt creation script');
          
          try {
            // Remove any existing prompt
            const existing = document.getElementById('browzer-save-prompt');
            if (existing) {
              existing.remove();
              console.log('[PasswordAutomation] Removed existing prompt');
            }
            
            // Create bright, visible prompt
            const prompt = document.createElement('div');
            prompt.id = 'browzer-save-prompt';
            prompt.style.cssText = 'position: fixed !important; top: 60px !important; right: 20px !important; background: #4285f4 !important; color: white !important; padding: 20px !important; border-radius: 8px !important; z-index: 2147483647 !important; font-family: Arial, sans-serif !important; box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important; min-width: 300px !important;';
            
            // Title
            const title = document.createElement('div');
            title.textContent = 'Save password for ${username}?';
            title.style.cssText = 'font-size: 16px !important; font-weight: bold !important; margin-bottom: 15px !important; color: white !important;';
            
            // Button container
            const buttons = document.createElement('div');
            buttons.style.cssText = 'display: flex !important; gap: 10px !important;';
            
            // Save button
            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = 'background: white !important; color: #4285f4 !important; border: none !important; padding: 10px 20px !important; border-radius: 4px !important; cursor: pointer !important; font-weight: bold !important;';
            saveBtn.onclick = function() {
              console.log('BROWZER_SAVE_PASSWORD:' + JSON.stringify({
                username: '${username}',
                password: '${password}',
                origin: '${origin}'
              }));
              prompt.remove();
            };
            
            // Never button
            const neverBtn = document.createElement('button');
            neverBtn.textContent = 'Never';
            neverBtn.style.cssText = 'background: rgba(255,255,255,0.2) !important; color: white !important; border: 1px solid white !important; padding: 10px 20px !important; border-radius: 4px !important; cursor: pointer !important;';
            neverBtn.onclick = function() {
              console.log('BROWZER_NEVER_SAVE:' + JSON.stringify({
                origin: '${origin}'
              }));
              prompt.remove();
            };
            
            // Close button
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.style.cssText = 'position: absolute !important; top: 5px !important; right: 10px !important; background: none !important; color: white !important; border: none !important; font-size: 20px !important; cursor: pointer !important; padding: 5px !important;';
            closeBtn.onclick = function() {
              prompt.remove();
            };
            
            // Assemble
            buttons.appendChild(saveBtn);
            buttons.appendChild(neverBtn);
            prompt.appendChild(closeBtn);
            prompt.appendChild(title);
            prompt.appendChild(buttons);
            
            // Add to page
            document.body.appendChild(prompt);
            console.log('[PasswordAutomation] ✅ Save prompt added to DOM successfully');
            
            // Make sure it's visible
            setTimeout(() => {
              if (document.getElementById('browzer-save-prompt')) {
                console.log('[PasswordAutomation] ✅ Prompt confirmed visible in DOM');
              } else {
                console.log('[PasswordAutomation] ❌ Prompt not found in DOM after creation');
              }
            }, 100);
            
          } catch (error) {
            console.error('[PasswordAutomation] Error in prompt creation:', error);
          }
        })();
      `
    });
    
    console.log('[PasswordAutomation] Prompt creation script executed');
  }

  /**
   * Create autofill dropdown
   */
  private async createAutofillDropdown(origin: string, credentials: any[]): Promise<void> {
    console.log('[PasswordAutomation] Creating autofill dropdown for', credentials.length, 'credentials');
    
    await this.debugger.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          try {
            console.log('[PasswordAutomation] Creating autofill dropdown');
            
            // Remove existing dropdown
            const existing = document.getElementById('browzer-autofill-dropdown');
            if (existing) existing.remove();
            
            // Find the focused username field
            const usernameField = document.activeElement;
            if (!usernameField || (usernameField.type !== 'email' && usernameField.type !== 'text')) {
              console.log('[PasswordAutomation] No suitable username field focused');
              return;
            }
            
            const rect = usernameField.getBoundingClientRect();
            const credentials = ${JSON.stringify(credentials)};
            
            // Create dropdown
            const dropdown = document.createElement('div');
            dropdown.id = 'browzer-autofill-dropdown';
            dropdown.style.cssText = 'position: fixed !important; top: ' + (rect.bottom + window.scrollY + 2) + 'px !important; left: ' + (rect.left + window.scrollX) + 'px !important; width: ' + rect.width + 'px !important; background: white !important; border: 1px solid #dadce0 !important; border-radius: 4px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important; z-index: 999999 !important; font-family: Arial, sans-serif !important; max-height: 200px !important; overflow-y: auto !important;';
            
            // Add credentials
            credentials.forEach(cred => {
              const item = document.createElement('div');
              item.style.cssText = 'padding: 12px !important; cursor: pointer !important; border-bottom: 1px solid #f0f0f0 !important; color: #000 !important;';
              item.textContent = cred.username;
              
              item.addEventListener('mouseenter', function() {
                this.style.backgroundColor = '#f5f5f5';
              });
              
              item.addEventListener('mouseleave', function() {
                this.style.backgroundColor = 'white';
              });
              
              item.addEventListener('click', function() {
                console.log('[PasswordAutomation] Credential selected:', cred.username);
                
                // Store selected credential for multi-step flows
                console.log('BROWZER_CREDENTIAL_SELECTED:' + JSON.stringify({
                  credentialId: cred.id,
                  username: cred.username,
                  origin: '${origin}',
                  timestamp: Date.now()
                }));
                
                // Fill username immediately
                usernameField.value = cred.username;
                usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                usernameField.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Try to fill password on same page
                const passwordField = document.querySelector('input[type="password"]');
                if (passwordField) {
                  console.log('BROWZER_FILL_PASSWORD:' + JSON.stringify({
                    credentialId: cred.id,
                    origin: '${origin}'
                  }));
                } else {
                  console.log('[PasswordAutomation] No password field on current page, will fill on next page');
                }
                
                dropdown.remove();
              });
              
              dropdown.appendChild(item);
            });
            
            document.body.appendChild(dropdown);
            console.log('[PasswordAutomation] ✅ Autofill dropdown created with', credentials.length, 'items');
            
            // Auto-remove on outside click
            setTimeout(() => {
              document.addEventListener('click', function(e) {
                if (!dropdown.contains(e.target) && e.target !== usernameField) {
                  dropdown.remove();
                }
              }, { once: true });
            }, 100);
            
          } catch (error) {
            console.error('[PasswordAutomation] Error creating autofill dropdown:', error);
          }
        })();
      `
    });
  }

  /**
   * Show autofill dropdown (legacy method)
   */
  private async showAutofillDropdown(fieldId: string, credentials: any[]): Promise<void> {
    await this.debugger.sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const field = document.querySelector('[data-browzer-node-id="${fieldId}"]') ||
                       document.querySelector('input[type="email"], input[type="text"]');
          
          if (!field) return;
          
          // Remove existing dropdown
          const existing = document.getElementById('browzer-autofill-dropdown');
          if (existing) existing.remove();
          
          const rect = field.getBoundingClientRect();
          const dropdown = document.createElement('div');
          dropdown.id = 'browzer-autofill-dropdown';
          dropdown.style.cssText = \`
            position: fixed;
            top: \${rect.bottom + window.scrollY}px;
            left: \${rect.left + window.scrollX}px;
            width: \${rect.width}px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
          \`;
          
          const credentials = ${JSON.stringify(credentials)};
          
          credentials.forEach(cred => {
            const item = document.createElement('div');
            item.style.cssText = \`
              padding: 12px;
              cursor: pointer;
              border-bottom: 1px solid #eee;
            \`;
            item.textContent = cred.username;
            
            item.addEventListener('click', function() {
              field.value = cred.username;
              field.dispatchEvent(new Event('input', { bubbles: true }));
              console.log('BROWZER_AUTOFILL_SELECTED:', JSON.stringify({credentialId: cred.id}));
              dropdown.remove();
            });
            
            item.addEventListener('mouseenter', function() {
              this.style.backgroundColor = '#f5f5f5';
            });
            
            item.addEventListener('mouseleave', function() {
              this.style.backgroundColor = 'white';
            });
            
            dropdown.appendChild(item);
          });
          
          document.body.appendChild(dropdown);
          
          // Remove on outside click
          setTimeout(() => {
            document.addEventListener('click', function(e) {
              if (!dropdown.contains(e.target) && e.target !== field) {
                dropdown.remove();
              }
            }, { once: true });
          }, 100);
        })();
      `
    });
  }

  // Helper methods
  private async getRootNodeId(): Promise<number> {
    const { root } = await this.debugger.sendCommand('DOM.getDocument');
    return root.nodeId;
  }

  private async getNodeAttributes(nodeId: number): Promise<any> {
    try {
      const { attributes } = await this.debugger.sendCommand('DOM.getAttributes', { nodeId });
      const attrs: any = {};
      for (let i = 0; i < attributes.length; i += 2) {
        attrs[attributes[i]] = attributes[i + 1];
      }
      return attrs;
    } catch {
      return {};
    }
  }

  private async isElementVisible(nodeId: number): Promise<boolean> {
    try {
      const { model } = await this.debugger.sendCommand('DOM.getBoxModel', { nodeId });
      return model.width > 0 && model.height > 0;
    } catch {
      return false;
    }
  }

  private async getParentContainer(nodeId: number): Promise<number> {
    try {
      const { nodeId: parentId } = await this.debugger.sendCommand('DOM.getParentNode', { nodeId });
      return parentId;
    } catch {
      return nodeId;
    }
  }

  private getCurrentSession(): LoginSession | null {
    return this.currentSessionId ? this.loginSessions.get(this.currentSessionId) || null : null;
  }

  private updateSession(data: Partial<LoginSession>): void {
    if (!this.currentSessionId) {
      this.currentSessionId = `session_${Date.now()}`;
    }
    
    const existing = this.loginSessions.get(this.currentSessionId) || {
      origin: '',
      startTime: Date.now(),
      lastActivity: Date.now()
    };
    
    this.loginSessions.set(this.currentSessionId, {
      ...existing,
      ...data,
      lastActivity: Date.now()
    });
  }

  private async updateSessionForNavigation(url: string): Promise<void> {
    const origin = new URL(url).origin;
    
    // Check if this is part of an existing federated auth flow
    const existingSession = this.getCurrentSession();
    if (existingSession && this.isFederatedAuthFlow(existingSession.origin, origin)) {
      // Continue existing session
      this.updateSession({ origin });
    } else {
      // Start new session
      this.currentSessionId = `session_${Date.now()}`;
      this.updateSession({ origin });
    }
  }

  private isFederatedAuthFlow(originalOrigin: string, newOrigin: string): boolean {
    // Define federated auth patterns
    const federatedPatterns = [
      ['login.microsoftonline.com', 'sso.godaddy.com'],
      ['accounts.google.com', 'sso.'],
      ['login.microsoftonline.com', 'outlook.office.com']
    ];
    
    return federatedPatterns.some(pattern => 
      (originalOrigin.includes(pattern[0]) && newOrigin.includes(pattern[1])) ||
      (originalOrigin.includes(pattern[1]) && newOrigin.includes(pattern[0]))
    );
  }
}

// Type definitions
interface LoginForm {
  formNodeId: number;
  action: string;
  method: string;
  usernameFields: number[];
  passwordFields: number[];
  isMultiStep: boolean;
}

interface LoginSession {
  origin: string;
  username?: string;
  password?: string;
  hasPassword?: boolean;
  startTime: number;
  lastActivity: number;
}
