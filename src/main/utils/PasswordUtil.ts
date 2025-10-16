import { WebContentsView } from 'electron';
import { jsonStringifyForJS } from './jsEscape';

/**
 * PasswordUtil - Utility class for password autofill operations
 * Contains all the implementation details for password filling scripts
 */
export class PasswordUtil {
  /**
   * Fill password in a web page with retry logic for multi-step logins
   * @param view - WebContentsView to execute the script in
   * @param password - Password to fill
   * @param username - Username for notification (optional)
   * @returns Promise<void>
   */
  static async fillPassword(
    view: WebContentsView,
    password: string,
    username?: string
  ): Promise<void> {
    // Build notification message in TypeScript
    const notificationMessage = username 
      ? `Password auto-filled for ${username}` 
      : 'Password auto-filled';
    
    const script = `
      (function() {
        let attempts = 0;
        const maxAttempts = 20;
        
        function tryFillPassword() {
          const passwordFields = document.querySelectorAll('input[type="password"]');
          const visiblePasswordField = Array.from(passwordFields).find(field => {
            const style = window.getComputedStyle(field);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   field.offsetWidth > 0 && 
                   field.offsetHeight > 0;
          });
          
          if (visiblePasswordField) {
            visiblePasswordField.value = ${jsonStringifyForJS(password)};
            visiblePasswordField.dispatchEvent(new Event('input', { bubbles: true }));
            visiblePasswordField.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Show success notification
            const notification = document.createElement('div');
            notification.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #4CAF50; color: white; padding: 12px 24px; border-radius: 6px; z-index: 999999; font-family: Arial, sans-serif; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);';
            notification.textContent = ${jsonStringifyForJS(notificationMessage)};
            document.body.appendChild(notification);
            
            setTimeout(() => notification.remove(), 3000);
          } else {
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(tryFillPassword, 250);
            }
          }
        }
        
        tryFillPassword();
      })();
    `;
    
    try {
      await view.webContents.executeJavaScript(script);
    } catch (error) {
      console.error('[PasswordUtil] Error auto-filling password:', error);
      throw error;
    }
  }
}

