export class DevToolsManager {
  private openDevToolsWindows: Map<string, any> = new Map();

  constructor() {
    this.setupKeyboardShortcuts();
    this.setupContextMenu();
  }

  /**
   * Open DevTools for a specific webview
   * @param webview - The webview element to open DevTools for
   * @param webviewId - Unique identifier for the webview
   */
  public openDevTools(webview: any, webviewId: string): void {
    if (!webview || !webview.openDevTools) {
      console.error('DevTools not available for this webview');
      return;
    }

    try {
      // Close existing DevTools if open
      if (this.openDevToolsWindows.has(webviewId)) {
        this.closeDevTools(webviewId);
      }

      // Open DevTools in a new window
      webview.openDevTools();
      this.openDevToolsWindows.set(webviewId, webview);
      
      console.log(`DevTools opened for webview: ${webviewId}`);
      
      // Listen for webview destruction to cleanup
      webview.addEventListener('destroyed', () => {
        this.openDevToolsWindows.delete(webviewId);
      });

    } catch (error) {
      console.error('Failed to open DevTools:', error);
    }
  }

  /**
   * Close DevTools for a specific webview
   * @param webviewId - Unique identifier for the webview
   */
  public closeDevTools(webviewId: string): void {
    const webview = this.openDevToolsWindows.get(webviewId);
    if (webview && webview.closeDevTools) {
      try {
        webview.closeDevTools();
        this.openDevToolsWindows.delete(webviewId);
        console.log(`DevTools closed for webview: ${webviewId}`);
      } catch (error) {
        console.error('Failed to close DevTools:', error);
      }
    }
  }

  /**
   * Toggle DevTools for a specific webview
   * @param webview - The webview element
   * @param webviewId - Unique identifier for the webview
   */
  public toggleDevTools(webview: any, webviewId: string): void {
    if (this.openDevToolsWindows.has(webviewId)) {
      this.closeDevTools(webviewId);
    } else {
      this.openDevTools(webview, webviewId);
    }
  }

  /**
   * Open DevTools for the currently active webview
   */
  public openDevToolsForActiveTab(): void {
    const activeWebview = this.getActiveWebview();
    if (activeWebview) {
      const webviewId = activeWebview.id;
      this.openDevTools(activeWebview, webviewId);
    } else {
      console.warn('No active webview found');
    }
  }

  /**
   * Get the currently active webview
   */
  private getActiveWebview(): any {
    const activeWebview = document.querySelector('.webview.active') || 
                         document.querySelector('.webview:not([style*="display: none"])');
    return activeWebview;
  }

  /**
   * Setup keyboard shortcuts for DevTools
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // F12 - Open/Close DevTools
      if (event.key === 'F12') {
        event.preventDefault();
        this.openDevToolsForActiveTab();
      }
      
      // Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (Mac) - Open/Close DevTools
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'I') {
        event.preventDefault();
        this.openDevToolsForActiveTab();
      }
      
      // Ctrl+Shift+J (Windows/Linux) or Cmd+Option+J (Mac) - Open DevTools Console
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'J') {
        event.preventDefault();
        this.openDevToolsForActiveTab();
      }
      
      // Ctrl+Shift+C (Windows/Linux) or Cmd+Option+C (Mac) - Open DevTools Element Inspector
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'C') {
        event.preventDefault();
        this.openDevToolsForActiveTab();
      }
    });
  }

  /**
   * Setup context menu for DevTools
   */
  private setupContextMenu(): void {
    document.addEventListener('contextmenu', (event) => {
      // Check if right-click is on a webview
      const target = event.target as HTMLElement;
      const webview = target.closest('.webview') as any;
      
      if (webview) {
        // Create custom context menu
        this.showContextMenu(event, webview);
      }
    });
  }

  /**
   * Show custom context menu with DevTools option
   */
  private showContextMenu(event: MouseEvent, webview: any): void {
    event.preventDefault();
    
    // Remove existing context menu
    const existingMenu = document.getElementById('devtools-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    
    // Create context menu
    const contextMenu = document.createElement('div');
    contextMenu.id = 'devtools-context-menu';
    contextMenu.className = 'devtools-context-menu';
    contextMenu.style.cssText = `
      position: fixed;
      top: ${event.clientY}px;
      left: ${event.clientX}px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 10000;
      min-width: 150px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
    `;
    
    // Add menu items
    const menuItems = [
      {
        label: 'Inspect Element',
        action: () => this.openDevTools(webview, webview.id)
      },
      {
        label: 'View Page Source',
        action: () => this.viewPageSource(webview)
      },
      {
        label: 'Reload Page',
        action: () => webview.reload()
      },
      {
        label: 'Go Back',
        action: () => webview.goBack(),
        disabled: !webview.canGoBack()
      },
      {
        label: 'Go Forward',
        action: () => webview.goForward(),
        disabled: !webview.canGoForward()
      }
    ];
    
    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'devtools-context-menu-item';
      menuItem.textContent = item.label;
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: ${item.disabled ? 'default' : 'pointer'};
        color: ${item.disabled ? '#999' : '#333'};
        border-bottom: 1px solid #eee;
      `;
      
      if (!item.disabled) {
        menuItem.addEventListener('click', () => {
          item.action();
          contextMenu.remove();
        });
        
        menuItem.addEventListener('mouseenter', () => {
          menuItem.style.backgroundColor = '#f0f0f0';
        });
        
        menuItem.addEventListener('mouseleave', () => {
          menuItem.style.backgroundColor = 'white';
        });
      }
      
      contextMenu.appendChild(menuItem);
    });
    
    // Add to document
    document.body.appendChild(contextMenu);
    
    // Close menu when clicking outside
    const closeMenu = (e: MouseEvent) => {
      if (!contextMenu.contains(e.target as Node)) {
        contextMenu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 100);
  }

  /**
   * View page source for a webview
   */
  private viewPageSource(webview: any): void {
    if (webview && webview.executeJavaScript) {
      webview.executeJavaScript(`
        document.documentElement.outerHTML
      `).then((html: string) => {
        // Open source in new window
        const sourceWindow = window.open('', '_blank');
        if (sourceWindow) {
          sourceWindow.document.write(`
            <html>
              <head>
                <title>Page Source - ${webview.src}</title>
                <style>
                  body { 
                    font-family: monospace; 
                    margin: 20px; 
                    background: #f5f5f5; 
                  }
                  pre { 
                    background: white; 
                    padding: 20px; 
                    border-radius: 4px; 
                    overflow: auto; 
                    white-space: pre-wrap;
                    word-wrap: break-word;
                  }
                </style>
              </head>
              <body>
                <h2>Page Source: ${webview.src}</h2>
                <pre>${html.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
              </body>
            </html>
          `);
          sourceWindow.document.close();
        }
      }).catch((error: any) => {
        console.error('Failed to get page source:', error);
      });
    }
  }

  /**
   * Add DevTools button to toolbar
   */
  public addDevToolsButton(): void {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    
    // Check if button already exists
    if (document.getElementById('devtools-btn')) return;
    
    const devToolsBtn = document.createElement('button');
    devToolsBtn.id = 'devtools-btn';
    devToolsBtn.className = 'nav-btn';
    devToolsBtn.innerHTML = '🔧';
    devToolsBtn.title = 'Open DevTools (F12)';
    
    devToolsBtn.addEventListener('click', () => {
      this.openDevToolsForActiveTab();
    });
    
    // Add button after the reload button
    const reloadBtn = document.getElementById('reloadBtn');
    if (reloadBtn && reloadBtn.parentNode) {
      reloadBtn.parentNode.insertBefore(devToolsBtn, reloadBtn.nextSibling);
    } else {
      toolbar.appendChild(devToolsBtn);
    }
  }

  /**
   * Enable DevTools for all webviews automatically
   */
  public enableDevToolsForAllWebviews(): void {
    // Watch for new webviews being created
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            
            // Check if the added node is a webview
            if (element.tagName === 'WEBVIEW') {
              this.setupWebviewDevTools(element as any);
            }
            
            // Check if any descendant is a webview
            const webviews = element.querySelectorAll('webview');
            webviews.forEach((webview) => {
              this.setupWebviewDevTools(webview as any);
            });
          }
        });
      });
    });
    
    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Setup DevTools for existing webviews
    const existingWebviews = document.querySelectorAll('webview');
    existingWebviews.forEach((webview) => {
      this.setupWebviewDevTools(webview as any);
    });
  }

  /**
   * Setup DevTools for a specific webview
   */
  private setupWebviewDevTools(webview: any): void {
    if (!webview || webview.devToolsSetup) return;
    
    // Mark as setup to avoid duplicate setup
    webview.devToolsSetup = true;
    
    // Wait for webview to be ready
    const setupDevTools = () => {
      if (webview.openDevTools) {
        console.log(`DevTools enabled for webview: ${webview.id}`);
        
        // Add double-click to open DevTools (for debugging)
        webview.addEventListener('dblclick', (event: MouseEvent) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            this.openDevTools(webview, webview.id);
          }
        });
      }
    };
    
    // Setup immediately if ready, otherwise wait for dom-ready
    if (webview.openDevTools) {
      setupDevTools();
    } else {
      webview.addEventListener('dom-ready', setupDevTools);
    }
  }

  /**
   * Get all open DevTools windows
   */
  public getOpenDevToolsWindows(): Map<string, any> {
    return this.openDevToolsWindows;
  }

  /**
   * Close all DevTools windows
   */
  public closeAllDevTools(): void {
    this.openDevToolsWindows.forEach((webview, webviewId) => {
      this.closeDevTools(webviewId);
    });
  }
}

// Global instance
export const devToolsManager = new DevToolsManager(); 