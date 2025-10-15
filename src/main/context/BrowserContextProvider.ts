/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BrowserContextProvider - Main context extraction engine
 * 
 * Provides real-time browser context to LLMs for agentic automation.
 * Intelligently extracts only relevant information to minimize token usage
 * while maintaining sufficient context for decision-making.
 * 
 * Features:
 * - Pruned DOM extraction (only interactive elements)
 * - Accessibility tree representation
 * - Console log monitoring
 * - Network activity tracking
 * - Screenshot capture with optional AI description
 * - Page metadata extraction
 * - Token-efficient JSON formatting
 */

import { WebContentsView } from 'electron';
import { 
  BrowserContext, 
  ContextExtractionOptions, 
  PageMetadata,
  ConsoleEntry,
  NetworkEntry,
  VisualContext
} from './types';
import { DOMPruner } from './DOMPruner';
import { AccessibilityTreeExtractor } from './AccessibilityTreeExtractor';
import { SnapshotManager } from '../SnapshotManager';

export class BrowserContextProvider {
  private view: WebContentsView;
  private debugger: Electron.Debugger;
  private domPruner: DOMPruner;
  private a11yExtractor: AccessibilityTreeExtractor;
  private snapshotManager?: SnapshotManager;
  
  // Activity buffers
  private consoleBuffer: ConsoleEntry[] = [];
  private networkBuffer: NetworkEntry[] = [];
  private isMonitoring = false;
  
  // Limits
  private readonly MAX_CONSOLE_BUFFER = 100;
  private readonly MAX_NETWORK_BUFFER = 100;

  constructor(
    view: WebContentsView,
    snapshotManager?: SnapshotManager
  ) {
    this.view = view;
    this.debugger = view.webContents.debugger;
    this.domPruner = new DOMPruner();
    this.a11yExtractor = new AccessibilityTreeExtractor();
    this.snapshotManager = snapshotManager;
  }

  /**
   * Start monitoring browser activity (console, network)
   */
  public async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.warn('⚠️ Already monitoring browser context');
      return;
    }

    try {
      // Attach debugger if not already attached
      if (!this.debugger.isAttached()) {
        this.debugger.attach('1.3');
      }

      // Enable CDP domains
      await this.debugger.sendCommand('DOM.enable');
      await this.debugger.sendCommand('Page.enable');
      await this.debugger.sendCommand('Runtime.enable');
      await this.debugger.sendCommand('Network.enable');
      await this.debugger.sendCommand('Log.enable');
      await this.debugger.sendCommand('Console.enable');

      // Setup event listeners
      this.setupEventListeners();

      this.isMonitoring = true;
      console.log('✅ Browser context monitoring started');
    } catch (error) {
      console.error('❌ Failed to start context monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.debugger.isAttached()) {
      this.debugger.removeAllListeners('message');
    }
    this.isMonitoring = false;
    console.log('⏹️ Browser context monitoring stopped');
  }

  /**
   * Get complete browser context snapshot
   */
  public async getContext(options: ContextExtractionOptions = {}): Promise<BrowserContext> {
    const {
      includePrunedDOM = true,
      includeAccessibilityTree = false,
      includeConsoleLogs = true,
      includeNetworkActivity = true,
      includeScreenshot = false,
      includeVisualDescription = false,
      maxElements = 100,
      maxConsoleEntries = 20,
      maxNetworkEntries = 20,
      activitySince
    } = options;

    console.log('📸 Capturing browser context...');

    // Get page metadata
    const metadata = await this.getPageMetadata();

    // Get pruned DOM if requested
    let interactiveElements: any[] = [];
    let elementCount = { total: 0, interactive: 0, visible: 0 };
    
    if (includePrunedDOM) {
      const { elements, stats } = await this.domPruner.extractPrunedDOM(
        this.debugger,
        maxElements
      );
      interactiveElements = elements;
      elementCount = {
        total: stats.total,
        interactive: elements.filter(e => e.isInteractive).length,
        visible: elements.filter(e => e.isVisible).length
      };
      console.log(`  ✓ DOM pruned: ${stats.pruned} elements from ${stats.total} total`);
    }

    // Get accessibility tree if requested
    let accessibilityTree = undefined;
    if (includeAccessibilityTree) {
      const { tree, nodeCount } = await this.a11yExtractor.extractTree(this.debugger);
      accessibilityTree = tree || undefined;
      console.log(`  ✓ A11y tree: ${nodeCount} nodes`);
    }

    // Get recent console logs
    let recentConsoleLogs = undefined;
    if (includeConsoleLogs) {
      recentConsoleLogs = this.getRecentConsoleLogs(
        maxConsoleEntries,
        activitySince
      );
      console.log(`  ✓ Console logs: ${recentConsoleLogs.length} entries`);
    }

    // Get recent network activity
    let recentNetworkActivity = undefined;
    if (includeNetworkActivity) {
      recentNetworkActivity = this.getRecentNetworkActivity(
        maxNetworkEntries,
        activitySince
      );
      console.log(`  ✓ Network activity: ${recentNetworkActivity.length} requests`);
    }

    // Get visual context if requested
    let visual = undefined;
    if (includeScreenshot || includeVisualDescription) {
      visual = await this.getVisualContext(includeVisualDescription);
      console.log(`  ✓ Visual context captured`);
    }

    const context: BrowserContext = {
      metadata,
      interactiveElements,
      elementCount,
      accessibilityTree,
      recentConsoleLogs,
      recentNetworkActivity,
      visual,
      capturedAt: Date.now()
    };

    console.log('✅ Browser context captured successfully');
    console.log("context: ", context);
    return context;
  }

  /**
   * Get lightweight context (minimal token usage)
   */
  public async getLightweightContext(): Promise<BrowserContext> {
    return this.getContext({
      includePrunedDOM: false,
      includeAccessibilityTree: true, // Lighter than DOM
      includeConsoleLogs: true,
      includeNetworkActivity: false,
      includeScreenshot: false,
      maxConsoleEntries: 10
    });
  }

  /**
   * Get rich context (maximum information)
   */
  public async getRichContext(): Promise<BrowserContext> {
    return this.getContext({
      includePrunedDOM: true,
      includeAccessibilityTree: true,
      includeConsoleLogs: true,
      includeNetworkActivity: true,
      includeScreenshot: true,
      includeVisualDescription: false, // Can add later if needed
      maxElements: 150,
      maxConsoleEntries: 30,
      maxNetworkEntries: 30
    });
  }

  /**
   * Get page metadata
   */
  private async getPageMetadata(): Promise<PageMetadata> {
    try {
      // Ensure debugger is attached before trying to use it
      if (!this.debugger.isAttached()) {
        console.warn('⚠️ Debugger not attached, attaching now...');
        try {
          this.debugger.attach('1.3');
          await this.debugger.sendCommand('Runtime.enable');
        } catch (attachError) {
          console.error('Failed to attach debugger:', attachError);
          // Fall back to basic metadata
          return this.getBasicMetadata();
        }
      }

      const result = await this.debugger.sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            return {
              url: window.location.href,
              title: document.title,
              readyState: document.readyState,
              contentType: document.contentType,
              encoding: document.characterSet,
              scrollPosition: {
                x: window.scrollX || window.pageXOffset,
                y: window.scrollY || window.pageYOffset
              },
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight
              }
            };
          })();
        `,
        returnByValue: true
      });

      return result.result?.value || this.getBasicMetadata();
    } catch (error) {
      console.error('Error getting page metadata:', error);
      return this.getBasicMetadata();
    }
  }

  /**
   * Get basic metadata without CDP (fallback)
   */
  private getBasicMetadata(): PageMetadata {
    return {
      url: this.view.webContents.getURL() || 'about:blank',
      title: this.view.webContents.getTitle() || 'Untitled',
      readyState: 'unknown',
      scrollPosition: { x: 0, y: 0 },
      viewport: { width: 1920, height: 1080 } // Default viewport
    };
  }

  /**
   * Get visual context (screenshot + optional description)
   */
  private async getVisualContext(includeDescription: boolean): Promise<VisualContext> {
    const visual: VisualContext = {
      timestamp: Date.now()
    };

    try {
      // Capture screenshot
      const image = await this.view.webContents.capturePage();
      visual.screenshotBase64 = image.toDataURL();

      // TODO: Add AI-based description if requested
      // This would call a vision model to generate text description
      if (includeDescription) {
        // Placeholder for future implementation
        visual.description = 'Visual description feature coming soon';
      }
    } catch (error) {
      console.error('Error capturing visual context:', error);
    }

    return visual;
  }

  /**
   * Get recent console logs from buffer
   */
  private getRecentConsoleLogs(
    maxEntries: number,
    since?: number
  ): ConsoleEntry[] {
    let logs = this.consoleBuffer;

    // Filter by timestamp if provided
    if (since) {
      logs = logs.filter(log => log.timestamp >= since);
    }

    // Return most recent entries
    return logs.slice(-maxEntries);
  }

  /**
   * Get recent network activity from buffer
   */
  private getRecentNetworkActivity(
    maxEntries: number,
    since?: number
  ): NetworkEntry[] {
    let requests = this.networkBuffer;

    // Filter by timestamp if provided
    if (since) {
      requests = requests.filter(req => req.timestamp >= since);
    }

    // Return most recent entries
    return requests.slice(-maxEntries);
  }

  /**
   * Setup CDP event listeners for monitoring
   */
  private setupEventListeners(): void {
    this.debugger.removeAllListeners('message');

    this.debugger.on('message', (_event, method, params) => {
      switch (method) {
        case 'Runtime.consoleAPICalled':
          this.handleConsoleLog(params);
          break;

        case 'Log.entryAdded':
          this.handleLogEntry(params);
          break;

        case 'Network.requestWillBeSent':
          this.handleNetworkRequest(params);
          break;

        case 'Network.responseReceived':
          this.handleNetworkResponse(params);
          break;

        case 'Network.loadingFailed':
          this.handleNetworkFailure(params);
          break;
      }
    });
  }

  /**
   * Handle console API calls
   */
  private handleConsoleLog(params: any): void {
    const level = params.type as ConsoleEntry['level'];
    const args = params.args || [];
    
    // Extract message from arguments
    let message = '';
    for (const arg of args) {
      if (arg.value !== undefined) {
        message += String(arg.value) + ' ';
      } else if (arg.description) {
        message += arg.description + ' ';
      }
    }

    const entry: ConsoleEntry = {
      level,
      message: message.trim(),
      timestamp: Date.now(),
      source: params.stackTrace?.callFrames?.[0]?.url
    };

    this.consoleBuffer.push(entry);

    // Trim buffer if too large
    if (this.consoleBuffer.length > this.MAX_CONSOLE_BUFFER) {
      this.consoleBuffer = this.consoleBuffer.slice(-this.MAX_CONSOLE_BUFFER);
    }
  }

  /**
   * Handle log entries
   */
  private handleLogEntry(params: any): void {
    const entry: ConsoleEntry = {
      level: params.entry.level as ConsoleEntry['level'],
      message: params.entry.text || '',
      timestamp: Date.now(),
      source: params.entry.url
    };

    this.consoleBuffer.push(entry);

    // Trim buffer
    if (this.consoleBuffer.length > this.MAX_CONSOLE_BUFFER) {
      this.consoleBuffer = this.consoleBuffer.slice(-this.MAX_CONSOLE_BUFFER);
    }
  }

  /**
   * Handle network request started
   */
  private handleNetworkRequest(params: any): void {
    const entry: NetworkEntry = {
      url: params.request.url,
      method: params.request.method || 'GET',
      type: params.type || 'Other',
      timestamp: Date.now()
    };

    // Store with request ID for later updates
    (entry as any).requestId = params.requestId;

    this.networkBuffer.push(entry);

    // Trim buffer
    if (this.networkBuffer.length > this.MAX_NETWORK_BUFFER) {
      this.networkBuffer = this.networkBuffer.slice(-this.MAX_NETWORK_BUFFER);
    }
  }

  /**
   * Handle network response received
   */
  private handleNetworkResponse(params: any): void {
    // Find the request entry and update it
    const entry = this.networkBuffer.find(
      (e: any) => e.requestId === params.requestId
    );

    if (entry) {
      entry.status = params.response.status;
      entry.statusText = params.response.statusText;
      entry.duration = Date.now() - entry.timestamp;
    }
  }

  /**
   * Handle network request failure
   */
  private handleNetworkFailure(params: any): void {
    const entry = this.networkBuffer.find(
      (e: any) => e.requestId === params.requestId
    );

    if (entry) {
      entry.failed = true;
      entry.errorText = params.errorText;
      entry.duration = Date.now() - entry.timestamp;
    }
  }

  /**
   * Clear activity buffers
   */
  public clearActivityBuffers(): void {
    this.consoleBuffer = [];
    this.networkBuffer = [];
    console.log('🗑️ Activity buffers cleared');
  }

  /**
   * Get current buffer sizes
   */
  public getBufferStats(): { console: number; network: number } {
    return {
      console: this.consoleBuffer.length,
      network: this.networkBuffer.length
    };
  }

  /**
   * Convert context to LLM-friendly text format
   */
  public contextToText(context: BrowserContext): string {
    const lines: string[] = [];

    // Page info
    lines.push('=== CURRENT PAGE ===');
    lines.push(`URL: ${context.metadata.url}`);
    lines.push(`Title: ${context.metadata.title}`);
    lines.push(`Scroll: (${context.metadata.scrollPosition.x}, ${context.metadata.scrollPosition.y})`);
    lines.push('');

    // Interactive elements
    if (context.interactiveElements.length > 0) {
      lines.push('=== INTERACTIVE ELEMENTS ===');
      lines.push(`Found ${context.elementCount.interactive} interactive elements (${context.elementCount.total} total)`);
      lines.push('');
      
      for (const el of context.interactiveElements.slice(0, 50)) {
        let line = `[${el.tagName}]`;
        if (el.attributes.id) line += ` #${el.attributes.id}`;
        if (el.attributes.ariaLabel) line += ` "${el.attributes.ariaLabel}"`;
        if (el.text) line += ` - ${el.text.substring(0, 50)}`;
        lines.push(line);
      }
      lines.push('');
    }

    // Accessibility tree
    if (context.accessibilityTree) {
      lines.push('=== ACCESSIBILITY TREE ===');
      lines.push(this.a11yExtractor.treeToMarkdown(context.accessibilityTree));
      lines.push('');
    }

    // Console logs
    if (context.recentConsoleLogs && context.recentConsoleLogs.length > 0) {
      lines.push('=== RECENT CONSOLE LOGS ===');
      for (const log of context.recentConsoleLogs) {
        lines.push(`[${log.level.toUpperCase()}] ${log.message}`);
      }
      lines.push('');
    }

    // Network activity
    if (context.recentNetworkActivity && context.recentNetworkActivity.length > 0) {
      lines.push('=== RECENT NETWORK ACTIVITY ===');
      for (const req of context.recentNetworkActivity) {
        let reqLine = `${req.method} ${req.url}`;
        if (req.status) reqLine += ` - ${req.status}`;
        if (req.failed) reqLine += ` FAILED: ${req.errorText}`;
        lines.push(reqLine);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Check if monitoring is active
   */
  public isActive(): boolean {
    return this.isMonitoring;
  }
}

