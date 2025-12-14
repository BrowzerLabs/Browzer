import { WebContentsView } from 'electron';

export class DebuggerService {
  public async initializeDebugger(view: WebContentsView, tabId: string): Promise<void> {
    try {
      const cdpDebugger = view.webContents.debugger;
      
      if (!cdpDebugger.isAttached()) {
        cdpDebugger.attach('1.3');
      }
      
      await Promise.all([
        cdpDebugger.sendCommand('DOM.enable'),
        cdpDebugger.sendCommand('Page.enable'),
        cdpDebugger.sendCommand('Runtime.enable'),
        cdpDebugger.sendCommand('Network.enable'),
        cdpDebugger.sendCommand('Console.enable'),
        cdpDebugger.sendCommand('Log.enable'),
      ]);
      
      await cdpDebugger.sendCommand('DOM.getDocument', { depth: -1 });
    } catch (error) {
      console.error(`[Debugger] Failed to initialize for tab ${tabId}:`, error);
      throw error;
    }
  }

  public cleanupDebugger(view: WebContentsView): void {
    const cdpDebugger = view.webContents.debugger;
    
    if (cdpDebugger.isAttached()) {
      cdpDebugger.detach();
    }
  }
}
