import { WebContentsView } from 'electron';

/**
 * DebuggerManager - Manages CDP debugger lifecycle for tabs
 * 
 * Responsibilities:
 * - Attach/detach debugger to WebContents
 * - Enable required CDP domains
 * - Handle debugger errors
 */
export class DebuggerManager {
  /**
   * Initialize debugger for a tab
   * Attaches debugger and enables all required CDP domains
   */
  public async initializeDebugger(view: WebContentsView, tabId: string): Promise<void> {
    try {
      const cdpDebugger = view.webContents.debugger;
      
      // Attach debugger if not already attached
      if (!cdpDebugger.isAttached()) {
        cdpDebugger.attach('1.3');
      }
      
      // Enable all required CDP domains for all services
      await Promise.all([
        cdpDebugger.sendCommand('DOM.enable'),
        cdpDebugger.sendCommand('Page.enable'),
        cdpDebugger.sendCommand('Runtime.enable'),
        cdpDebugger.sendCommand('Network.enable'),
        cdpDebugger.sendCommand('Console.enable'),
        cdpDebugger.sendCommand('Log.enable'),
      ]);
      
      // Get initial document
      await cdpDebugger.sendCommand('DOM.getDocument', { depth: -1 });
    } catch (error) {
      console.error(`[Debugger] Failed to initialize for tab ${tabId}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup debugger for a tab
   * Detaches debugger when tab is closed
   */
  public cleanupDebugger(view: WebContentsView, tabId: string): void {
    const cdpDebugger = view.webContents.debugger;
    
    if (cdpDebugger.isAttached()) {
      cdpDebugger.detach();
    }
  }
}
