import { ChatOrchestrator, ChatSession } from './ChatOrchestrator';
import { IntelligentDOMExtractor, FilteredDOM } from './IntelligentDOMExtractor';
import { SPAReadyDetector } from './SPAReadyDetector';
import { AdaptiveExecutionEngine, AdaptiveExecutionContext } from './AdaptiveExecutionEngine';
import { HybridExecutionEngine } from './HybridExecutionEngine';

export interface AutomationRequest {
  userPrompt: string;
  recordingSessionId: string;
  recordingSession: any;
}

export interface AutomationResponse {
  success: boolean;
  message: string;
  chatSessionId: string;
  executionTime: number;
  steps?: any[];
  error?: string;
}

export interface BrowserContext {
  url: string;
  title: string;
  domSnapshot: FilteredDOM;
  readyState: any;
}

export class AutomationOrchestrator {
  private static instance: AutomationOrchestrator;
  private chatOrchestrator: ChatOrchestrator;
  private domExtractor: IntelligentDOMExtractor;
  private spaDetector: SPAReadyDetector;
  private adaptiveEngine: AdaptiveExecutionEngine;
  private hybridEngine: HybridExecutionEngine;
  private webview: any = null;
  private isExecuting: boolean = false;
  private useHybridMode: boolean = true; // NEW: Use hybrid by default

  private constructor() {
    this.chatOrchestrator = ChatOrchestrator.getInstance();
    this.domExtractor = IntelligentDOMExtractor.getInstance();
    this.spaDetector = SPAReadyDetector.getInstance();
    this.adaptiveEngine = AdaptiveExecutionEngine.getInstance();
    this.hybridEngine = HybridExecutionEngine.getInstance();
  }

  static getInstance(): AutomationOrchestrator {
    if (!AutomationOrchestrator.instance) {
      AutomationOrchestrator.instance = new AutomationOrchestrator();
    }
    return AutomationOrchestrator.instance;
  }

  /**
   * Initialize with webview
   */
  initialize(webview: any): void {
    this.webview = webview;
    this.spaDetector.setWebview(webview);
    this.adaptiveEngine.setWebview(webview);
    this.hybridEngine.setWebview(webview);
    console.log('[AutomationOrchestrator] Initialized - HYBRID MODE (default)');
  }

  /**
   * Set execution mode
   */
  setExecutionMode(mode: 'hybrid' | 'adaptive'): void {
    this.useHybridMode = mode === 'hybrid';
    console.log(`[AutomationOrchestrator] Execution mode: ${mode.toUpperCase()}`);
  }

  /**
   * Create a new automation session
   */
  createSession(recordingSessionId: string): ChatSession {
    const session = this.chatOrchestrator.createSession(recordingSessionId);
    console.log('[AutomationOrchestrator] Created session:', session.id);
    return session;
  }

  /**
   * Get current session
   */
  getCurrentSession(): ChatSession | null {
    return this.chatOrchestrator.getCurrentSession();
  }

  /**
   * Execute automation request with adaptive execution
   */
  async executeAutomation(request: AutomationRequest): Promise<AutomationResponse> {
    if (this.isExecuting) {
      return {
        success: false,
        message: 'Another automation is already in progress',
        chatSessionId: '',
        executionTime: 0,
        error: 'Execution in progress',
      };
    }

    if (!this.webview) {
      return {
        success: false,
        message: 'Webview not initialized',
        chatSessionId: '',
        executionTime: 0,
        error: 'No webview',
      };
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      // Create or get chat session
      let session = this.chatOrchestrator.getCurrentSession();
      if (!session || session.recordingSessionId !== request.recordingSessionId) {
        session = this.chatOrchestrator.createSession(request.recordingSessionId);
      }

      // Add user message to chat
      this.chatOrchestrator.addMessage('user', request.userPrompt);

      // Get browser context
      const browserContext = await this.getBrowserContext();

      if (this.useHybridMode) {
        // HYBRID MODE: Fast execution with adaptive recovery
        console.log('[AutomationOrchestrator] Using HYBRID execution mode');
        
        this.chatOrchestrator.addMessage(
          'assistant',
          '⚡ **Hybrid Execution Mode**\n\nGenerating execution plan... Steps will execute quickly. I\'ll take control only if something fails.'
        );

        const hybridContext = {
          userGoal: request.userPrompt,
          recordingSession: request.recordingSession,
          chatSessionId: session.id,
          currentUrl: browserContext.url,
        };

        const result = await this.hybridEngine.executeHybrid(hybridContext);

        const executionTime = Date.now() - startTime;
        this.chatOrchestrator.updateSessionStatus('completed');

        // Show cost savings
        const costSavings = Math.round(
          (1 - result.totalCost.adaptiveTokens / (result.totalCost.totalTokens || 1)) * 100
        );

        this.chatOrchestrator.addMessage(
          'assistant',
          `✅ **Execution Complete**\n\n` +
          `- Steps executed: ${result.stepsExecuted}\n` +
          `- Succeeded: ${result.stepsSucceeded}\n` +
          `- Failed: ${result.stepsFailed}\n` +
          `- Adaptive switches: ${result.adaptiveSwitches}\n` +
          `- Token cost: ${result.totalCost.totalTokens} (~${costSavings}% savings)\n` +
          `- Time: ${(executionTime / 1000).toFixed(1)}s`
        );

        return {
          success: result.success,
          message: `Hybrid execution completed: ${result.stepsSucceeded}/${result.stepsExecuted} steps succeeded`,
          chatSessionId: session.id,
          executionTime,
          steps: result.executionHistory,
        };
      } else {
        // ADAPTIVE MODE: Full LLM control every step
        console.log('[AutomationOrchestrator] Using ADAPTIVE execution mode');
        
        this.chatOrchestrator.addMessage(
          'assistant',
          '🤖 Starting adaptive execution - I will execute step-by-step with real-time verification and adaptation.'
        );

        const adaptiveContext: AdaptiveExecutionContext = {
          userGoal: request.userPrompt,
          recordingSession: request.recordingSession,
          chatSessionId: session.id,
          currentUrl: browserContext.url,
          executionHistory: [],
        };

        const result = await this.adaptiveEngine.executeAdaptively(adaptiveContext);

        const executionTime = Date.now() - startTime;
        this.chatOrchestrator.updateSessionStatus('completed');

        return {
          success: result.success,
          message: `Adaptive execution completed with ${result.stepsExecuted} steps`,
          chatSessionId: session.id,
          executionTime,
          steps: result.executionHistory,
        };
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = (error as Error).message;

      this.chatOrchestrator.updateSessionStatus('failed', errorMessage);

      return {
        success: false,
        message: errorMessage,
        chatSessionId: this.chatOrchestrator.getCurrentSession()?.id || '',
        executionTime,
        error: errorMessage,
      };
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Get current browser context
   */
  private async getBrowserContext(): Promise<BrowserContext> {
    if (!this.webview) {
      throw new Error('Webview not initialized');
    }

    const url = this.webview.getURL();
    const title = this.webview.getTitle ? this.webview.getTitle() : '';

    // Wait for page to be ready
    await this.spaDetector.waitForReady({ timeout: 10000 });

    // Extract DOM
    const domSnapshot = await this.domExtractor.extractFilteredDOM(this.webview);

    // Get ready state
    const readyState = await this.spaDetector.getReadyState();

    return {
      url,
      title,
      domSnapshot,
      readyState,
    };
  }

  /**
   * Send message in current chat
   */
  sendMessage(role: 'user' | 'assistant', content: string, metadata?: any): void {
    this.chatOrchestrator.addMessage(role, content, metadata);
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): Array<{ role: string; content: string }> {
    return this.chatOrchestrator.getConversationHistory();
  }

  /**
   * Clear current conversation
   */
  clearConversation(): void {
    this.chatOrchestrator.clearCurrentConversation();
  }

  /**
   * Register execution feedback callback
   */
  onExecutionFeedback(callback: (feedback: any) => void): void {
    this.adaptiveEngine.onFeedback(callback);
    this.hybridEngine.onFeedback(callback);
  }

  /**
   * Check if currently executing
   */
  isCurrentlyExecuting(): boolean {
    return this.isExecuting;
  }

  /**
   * Get all sessions for a recording
   */
  getSessionsForRecording(recordingSessionId: string): ChatSession[] {
    return this.chatOrchestrator.getSessionsForRecording(recordingSessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    return this.chatOrchestrator.deleteSession(sessionId);
  }

  /**
   * Export session
   */
  exportSession(sessionId: string): string {
    return this.chatOrchestrator.exportSession(sessionId);
  }
}
