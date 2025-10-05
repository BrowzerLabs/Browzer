/**
 * SPA Ready Detector
 * Handles Single-Page Applications and Asynchronous Operations
 * Monitors network activity and DOM mutations to determine when page is ready
 */

export interface ReadyState {
  isReady: boolean;
  networkIdle: boolean;
  domStable: boolean;
  readyState: string;
  pendingRequests: number;
  recentMutations: number;
  timestamp: number;
}

export interface WaitOptions {
  timeout?: number;
  networkIdleTime?: number;
  domStableTime?: number;
  checkInterval?: number;
}

export class SPAReadyDetector {
  private static instance: SPAReadyDetector;
  private webview: any = null;

  private constructor() {}

  static getInstance(): SPAReadyDetector {
    if (!SPAReadyDetector.instance) {
      SPAReadyDetector.instance = new SPAReadyDetector();
    }
    return SPAReadyDetector.instance;
  }

  /**
   * Set the webview to monitor
   */
  setWebview(webview: any): void {
    this.webview = webview;
  }

  async waitForReady(options: WaitOptions = {}): Promise<boolean> {
    const {
      timeout = 30000,
      networkIdleTime = 500,
      domStableTime = 300,
      checkInterval = 100,
    } = options;

    if (!this.webview) {
      throw new Error('Webview not set');
    }

    const startTime = Date.now();

    // Inject monitoring script
    await this.injectMonitoringScript(networkIdleTime, domStableTime);

    // Poll for ready state
    while (Date.now() - startTime < timeout) {
      const state = await this.getReadyState();

      if (state.isReady) {
        console.log('[SPAReadyDetector] Page ready', state);
        return true;
      }

      await this.sleep(checkInterval);
    }

    console.warn('[SPAReadyDetector] Timeout waiting for ready');
    const finalState = await this.getReadyState();
    console.log('[SPAReadyDetector] Final state:', finalState);
    return false;
  }

  /**
   * Wait for specific element to appear
   */
  async waitForElement(selector: string, timeout: number = 15000): Promise<boolean> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    const script = `
      (function() {
        return new Promise((resolve) => {
          const selector = '${selector.replace(/'/g, "\\'")}';
          const timeout = ${timeout};
          const startTime = Date.now();
          
          const checkElement = () => {
            const element = document.querySelector(selector);
            if (element) {
              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              const isVisible = rect.width > 0 && rect.height > 0 && 
                               style.display !== 'none' && 
                               style.visibility !== 'hidden';
              
              if (isVisible) {
                resolve(true);
                return;
              }
            }
            
            if (Date.now() - startTime > timeout) {
              resolve(false);
              return;
            }
            
            setTimeout(checkElement, 100);
          };
          
          checkElement();
        });
      })();
    `;

    try {
      const result = await this.webview.executeJavaScript(script);
      return result === true;
    } catch (error) {
      console.error('[SPAReadyDetector] Error waiting for element:', error);
      return false;
    }
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(timeout: number = 30000): Promise<boolean> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve(false);
      }, timeout);

      const cleanup = () => {
        clearTimeout(timeoutId);
        this.webview.removeEventListener('did-finish-load', onLoad);
        this.webview.removeEventListener('did-fail-load', onError);
      };

      const onLoad = () => {
        cleanup();
        resolve(true);
      };

      const onError = () => {
        cleanup();
        resolve(false);
      };

      this.webview.addEventListener('did-finish-load', onLoad);
      this.webview.addEventListener('did-fail-load', onError);
    });
  }

  /**
   * Get current ready state
   */
  async getReadyState(): Promise<ReadyState> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    const script = `
      (function() {
        if (!window.__spaReadyMonitor) {
          return {
            isReady: false,
            networkIdle: false,
            domStable: false,
            readyState: document.readyState,
            pendingRequests: 0,
            recentMutations: 0,
            timestamp: Date.now()
          };
        }
        
        const monitor = window.__spaReadyMonitor;
        const now = Date.now();
        
        const networkIdle = monitor.pendingRequests === 0 && 
                           (now - monitor.lastNetworkActivity) > monitor.networkIdleTime;
        
        const domStable = (now - monitor.lastDomMutation) > monitor.domStableTime;
        
        const isReady = document.readyState === 'complete' && 
                       networkIdle && 
                       domStable;
        
        return {
          isReady,
          networkIdle,
          domStable,
          readyState: document.readyState,
          pendingRequests: monitor.pendingRequests,
          recentMutations: monitor.mutationCount,
          timestamp: now
        };
      })();
    `;

    try {
      const result = await this.webview.executeJavaScript(script);
      return result as ReadyState;
    } catch (error) {
      console.error('[SPAReadyDetector] Error getting ready state:', error);
      return {
        isReady: false,
        networkIdle: false,
        domStable: false,
        readyState: 'loading',
        pendingRequests: 0,
        recentMutations: 0,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Inject monitoring script into page
   */
  private async injectMonitoringScript(
    networkIdleTime: number,
    domStableTime: number
  ): Promise<void> {
    if (!this.webview) return;

    const script = `
      (function() {
        if (window.__spaReadyMonitor) {
          return; // Already injected
        }
        
        window.__spaReadyMonitor = {
          pendingRequests: 0,
          lastNetworkActivity: Date.now(),
          lastDomMutation: Date.now(),
          mutationCount: 0,
          networkIdleTime: ${networkIdleTime},
          domStableTime: ${domStableTime}
        };
        
        const monitor = window.__spaReadyMonitor;
        
        // Monitor XHR requests
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(...args) {
          this.__spaMonitored = true;
          return originalXHROpen.apply(this, args);
        };
        
        XMLHttpRequest.prototype.send = function(...args) {
          if (this.__spaMonitored) {
            monitor.pendingRequests++;
            monitor.lastNetworkActivity = Date.now();
            
            const onComplete = () => {
              monitor.pendingRequests--;
              monitor.lastNetworkActivity = Date.now();
            };
            
            this.addEventListener('load', onComplete);
            this.addEventListener('error', onComplete);
            this.addEventListener('abort', onComplete);
          }
          
          return originalXHRSend.apply(this, args);
        };
        
        // Monitor Fetch requests
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          monitor.pendingRequests++;
          monitor.lastNetworkActivity = Date.now();
          
          return originalFetch.apply(this, args).then(
            (response) => {
              monitor.pendingRequests--;
              monitor.lastNetworkActivity = Date.now();
              return response;
            },
            (error) => {
              monitor.pendingRequests--;
              monitor.lastNetworkActivity = Date.now();
              throw error;
            }
          );
        };
        
        // Monitor DOM mutations
        const observer = new MutationObserver((mutations) => {
          if (mutations.length > 0) {
            monitor.mutationCount += mutations.length;
            monitor.lastDomMutation = Date.now();
          }
        });
        
        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true
        });
        
        // Reset mutation count periodically
        setInterval(() => {
          monitor.mutationCount = 0;
        }, 5000);
        
        console.log('[SPAReadyDetector] Monitoring script injected');
      })();
    `;

    try {
      await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[SPAReadyDetector] Failed to inject monitoring script:', error);
    }
  }

  /**
   * Wait for specific condition
   */
  async waitForCondition(
    conditionScript: string,
    timeout: number = 10000
  ): Promise<boolean> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    const script = `
      (function() {
        return new Promise((resolve) => {
          const timeout = ${timeout};
          const startTime = Date.now();
          
          const checkCondition = () => {
            try {
              const result = (${conditionScript})();
              if (result) {
                resolve(true);
                return;
              }
            } catch (error) {
              console.error('[SPAReadyDetector] Condition check error:', error);
            }
            
            if (Date.now() - startTime > timeout) {
              resolve(false);
              return;
            }
            
            setTimeout(checkCondition, 100);
          };
          
          checkCondition();
        });
      })();
    `;

    try {
      const result = await this.webview.executeJavaScript(script);
      return result === true;
    } catch (error) {
      console.error('[SPAReadyDetector] Error waiting for condition:', error);
      return false;
    }
  }

  /**
   * Wait for text to appear on page
   */
  async waitForText(text: string, timeout: number = 10000): Promise<boolean> {
    const conditionScript = `function() {
      return document.body.textContent.includes('${text.replace(/'/g, "\\'")}');
    }`;

    return this.waitForCondition(conditionScript, timeout);
  }

  /**
   * Wait for URL change
   */
  async waitForUrlChange(expectedUrl: string, timeout: number = 10000): Promise<boolean> {
    if (!this.webview) {
      throw new Error('Webview not set');
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const currentUrl = this.webview.getURL();
      if (currentUrl.includes(expectedUrl)) {
        return true;
      }
      await this.sleep(100);
    }

    return false;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up monitoring
   */
  async cleanup(): Promise<void> {
    if (!this.webview) return;

    const script = `
      (function() {
        if (window.__spaReadyMonitor) {
          delete window.__spaReadyMonitor;
          console.log('[SPAReadyDetector] Monitoring cleaned up');
        }
      })();
    `;

    try {
      await this.webview.executeJavaScript(script);
    } catch (error) {
      console.error('[SPAReadyDetector] Failed to cleanup:', error);
    }
  }
}
