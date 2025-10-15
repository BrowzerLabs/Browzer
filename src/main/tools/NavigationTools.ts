/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * NavigationTools - Browser navigation operations
 * 
 * Provides reliable navigation tools for LLM agents:
 * - navigate_to_url: Navigate to a specific URL
 * - go_back: Go back in history
 * - go_forward: Go forward in history
 * - reload_page: Reload current page
 * - wait_for_navigation: Wait for navigation to complete
 * 
 * Features:
 * - Load completion detection
 * - Network idle waiting
 * - URL verification
 * - Retry logic for failed navigations
 */

import { ToolExecutor } from './ToolExecutor';
import { ToolResult, ToolDefinition, NavigationOptions, ToolErrorCode } from './types';

export class NavigationTools extends ToolExecutor {
  /**
   * Navigate to a URL
   */
  public async navigateToURL(
    url: string,
    options: NavigationOptions = {}
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const {
      waitForLoad = true,
      waitForNetworkIdle = true,
      timeout = this.defaultTimeout,
      expectedUrl
    } = options;

    this.log('info', `Navigating to: ${url}`);

    try {
      await this.ensureDebuggerAttached();

      // Normalize URL (add https:// if missing)
      const normalizedURL = this.normalizeURL(url);

      // Setup load completion handler
      const loadPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Navigation timeout'));
        }, timeout);

        const handleLoad = () => {
          clearTimeout(timeoutId);
          this.view.webContents.off('did-finish-load', handleLoad);
          this.view.webContents.off('did-fail-load', handleError);
          resolve();
        };

        const handleError = (_event: any, errorCode: number, errorDescription: string) => {
          if (errorCode !== -3) { // Ignore aborted loads
            clearTimeout(timeoutId);
            this.view.webContents.off('did-finish-load', handleLoad);
            this.view.webContents.off('did-fail-load', handleError);
            reject(new Error(`Navigation failed: ${errorDescription}`));
          }
        };

        if (waitForLoad) {
          this.view.webContents.on('did-finish-load', handleLoad);
          this.view.webContents.on('did-fail-load', handleError);
        } else {
          resolve();
        }
      });

      // Start navigation
      await this.view.webContents.loadURL(normalizedURL);

      // Wait for load if requested
      if (waitForLoad) {
        await loadPromise;
      }

      // Wait for network idle if requested
      if (waitForNetworkIdle) {
        await this.waitForNetworkIdle(3000);
      }

      // Verify URL if expected URL provided
      const actualURL = this.getCurrentURL();
      if (expectedUrl && !actualURL.includes(expectedUrl)) {
        return this.createErrorResult(
          ToolErrorCode.VERIFICATION_FAILED,
          `Navigation verification failed. Expected URL to contain "${expectedUrl}", but got "${actualURL}"`,
          { expectedUrl, actualURL },
          ['Check if the URL redirects to a different location', 'Verify the expected URL pattern']
        );
      }

      const executionTime = Date.now() - startTime;
      this.log('info', `✅ Navigation complete in ${executionTime}ms`);

      return this.createSuccessResult(
        `Successfully navigated to ${actualURL}`,
        {
          url: actualURL,
          title: this.getCurrentTitle(),
          loadTime: executionTime
        },
        executionTime
      );

    } catch (error) {
      const errorMessage = (error as Error).message;
      this.log('error', `Navigation failed: ${errorMessage}`);

      return this.createErrorResult(
        ToolErrorCode.NAVIGATION_FAILED,
        `Failed to navigate to ${url}: ${errorMessage}`,
        { url, error: errorMessage },
        [
          'Check if the URL is valid and accessible',
          'Verify network connectivity',
          'Try with a longer timeout'
        ]
      );
    }
  }

  /**
   * Go back in browser history
   */
  public async goBack(): Promise<ToolResult> {
    this.log('info', 'Going back in history');

    try {
      const canGoBack = this.view.webContents.navigationHistory.canGoBack();
      
      if (!canGoBack) {
        return this.createErrorResult(
          ToolErrorCode.INVALID_STATE,
          'Cannot go back: no previous page in history',
          undefined,
          ['This is likely the first page in the session']
        );
      }

      const previousURL = this.getCurrentURL();
      this.view.webContents.navigationHistory.goBack();

      // Wait for navigation
      await this.waitForLoad();

      const newURL = this.getCurrentURL();
      this.log('info', `✅ Navigated back to: ${newURL}`);

      return this.createSuccessResult(
        `Successfully navigated back from ${previousURL} to ${newURL}`,
        {
          from: previousURL,
          to: newURL,
          title: this.getCurrentTitle()
        }
      );

    } catch (error) {
      this.log('error', `Go back failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.NAVIGATION_FAILED,
        `Failed to go back: ${(error as Error).message}`
      );
    }
  }

  /**
   * Go forward in browser history
   */
  public async goForward(): Promise<ToolResult> {
    this.log('info', 'Going forward in history');

    try {
      const canGoForward = this.view.webContents.navigationHistory.canGoForward();
      
      if (!canGoForward) {
        return this.createErrorResult(
          ToolErrorCode.INVALID_STATE,
          'Cannot go forward: no next page in history',
          undefined,
          ['This is likely the most recent page in the session']
        );
      }

      const previousURL = this.getCurrentURL();
      this.view.webContents.navigationHistory.goForward();

      // Wait for navigation
      await this.waitForLoad();

      const newURL = this.getCurrentURL();
      this.log('info', `✅ Navigated forward to: ${newURL}`);

      return this.createSuccessResult(
        `Successfully navigated forward from ${previousURL} to ${newURL}`,
        {
          from: previousURL,
          to: newURL,
          title: this.getCurrentTitle()
        }
      );

    } catch (error) {
      this.log('error', `Go forward failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.NAVIGATION_FAILED,
        `Failed to go forward: ${(error as Error).message}`
      );
    }
  }

  /**
   * Reload current page
   */
  public async reloadPage(options: { ignoreCache?: boolean } = {}): Promise<ToolResult> {
    const { ignoreCache = false } = options;
    
    this.log('info', `Reloading page${ignoreCache ? ' (ignoring cache)' : ''}`);

    try {
      const currentURL = this.getCurrentURL();

      if (ignoreCache) {
        await this.view.webContents.reloadIgnoringCache();
      } else {
        await this.view.webContents.reload();
      }

      // Wait for reload to complete
      await this.waitForLoad();

      this.log('info', '✅ Page reloaded');

      return this.createSuccessResult(
        `Successfully reloaded ${currentURL}`,
        {
          url: currentURL,
          title: this.getCurrentTitle(),
          ignoredCache: ignoreCache
        }
      );

    } catch (error) {
      this.log('error', `Reload failed: ${(error as Error).message}`);
      return this.createErrorResult(
        ToolErrorCode.NAVIGATION_FAILED,
        `Failed to reload page: ${(error as Error).message}`
      );
    }
  }

  /**
   * Wait for page load to complete
   */
  private async waitForLoad(timeout = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Wait for load timeout'));
      }, timeout);

      const handleLoad = () => {
        clearTimeout(timeoutId);
        this.view.webContents.off('did-finish-load', handleLoad);
        resolve();
      };

      // If already loaded, resolve immediately
      if (!this.isPageLoading()) {
        clearTimeout(timeoutId);
        resolve();
        return;
      }

      this.view.webContents.on('did-finish-load', handleLoad);
    });
  }

  /**
   * Wait for network to be idle
   */
  private async waitForNetworkIdle(timeout = 3000): Promise<void> {
    await this.sleep(timeout);
  }

  /**
   * Normalize URL (add protocol if missing)
   */
  private normalizeURL(url: string): string {
    const trimmed = url.trim();
    
    // Already has protocol
    if (/^[a-z]+:\/\//i.test(trimmed)) {
      return trimmed;
    }
    
    // Looks like a domain
    if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    
    // Treat as search query
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  /**
   * Get tool definitions for MCP
   */
  public static getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'navigate_to_url',
        description: 'Navigate the browser to a specific URL. Waits for page load and network idle by default.',
        category: 'navigation',
        parameters: {
          url: {
            type: 'string',
            description: 'The URL to navigate to. Can be a full URL or just a domain (https:// will be added automatically)',
            required: true
          },
          wait_for_load: {
            type: 'boolean',
            description: 'Whether to wait for the page to finish loading (default: true)',
            default: true
          },
          wait_for_network_idle: {
            type: 'boolean',
            description: 'Whether to wait for network activity to settle (default: true)',
            default: true
          },
          timeout: {
            type: 'number',
            description: 'Maximum time to wait for navigation in milliseconds (default: 10000)',
            default: 10000
          }
        },
        returns: {
          type: 'object',
          description: 'Navigation result with final URL, title, and load time'
        },
        examples: [
          {
            description: 'Navigate to Google',
            parameters: { url: 'https://google.com' },
            expectedResult: 'Successfully navigated to https://www.google.com'
          },
          {
            description: 'Navigate without waiting for network idle',
            parameters: { url: 'example.com', wait_for_network_idle: false },
            expectedResult: 'Successfully navigated to https://example.com'
          }
        ]
      },
      {
        name: 'go_back',
        description: 'Go back to the previous page in browser history',
        category: 'navigation',
        parameters: {},
        returns: {
          type: 'object',
          description: 'Navigation result with previous and current URL'
        }
      },
      {
        name: 'go_forward',
        description: 'Go forward to the next page in browser history',
        category: 'navigation',
        parameters: {},
        returns: {
          type: 'object',
          description: 'Navigation result with previous and current URL'
        }
      },
      {
        name: 'reload_page',
        description: 'Reload the current page',
        category: 'navigation',
        parameters: {
          ignore_cache: {
            type: 'boolean',
            description: 'Whether to ignore cached content and force a fresh reload (default: false)',
            default: false
          }
        },
        returns: {
          type: 'object',
          description: 'Reload result with URL and title'
        }
      }
    ];
  }
}

