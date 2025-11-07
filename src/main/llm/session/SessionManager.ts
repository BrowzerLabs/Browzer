/* eslint-disable @typescript-eslint/no-explicit-any */
import Anthropic from '@anthropic-ai/sdk';
import { SessionStore } from './SessionStore';
import { ContextManager } from './ContextManager';
import {
  StoredSession,
  SessionWithHistory,
  SessionListItem,
  CreateSessionOptions,
  UpdateSessionOptions,
  AddMessageOptions,
  AddStepOptions,
  ContextConfig,
  ContextStats,
  SessionMetadata
} from './types';

/**
 * SessionManager - High-level session management
 * 
 * Orchestrates:
 * - Session CRUD operations via SessionStore
 * - Context optimization via ContextManager
 * - Conversation history management
 * - Cache metadata tracking
 * 
 * This is the main interface for working with persistent sessions.
 */
export class SessionManager {
  private store: SessionStore;
  private contextManager: ContextManager;

  constructor(dbPath?: string, contextConfig?: Partial<ContextConfig>) {
    this.store = new SessionStore(dbPath);
    this.contextManager = new ContextManager(contextConfig);
  }

  /**
   * Create a new automation session
   */
  createSession(options: CreateSessionOptions): StoredSession {
    return this.store.createSession(options);
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): StoredSession | null {
    return this.store.getSession(sessionId);
  }

  /**
   * Load session with full conversation history
   * Used for resuming sessions
   */
  loadSession(sessionId: string): SessionWithHistory | null {
    return this.store.getSessionWithHistory(sessionId);
  }

  /**
   * Update session status and metadata
   */
  updateSession(sessionId: string, options: UpdateSessionOptions): void {
    this.store.updateSession(sessionId, options);
  }

  /**
   * Delete session permanently
   */
  deleteSession(sessionId: string): void {
    this.store.deleteSession(sessionId);
  }

  /**
   * List all sessions for UI
   */
  listSessions(limit = 50, offset = 0): SessionListItem[] {
    return this.store.listSessions(limit, offset);
  }

  /**
   * Add message to session with context optimization
   */
  addMessage(options: AddMessageOptions): void {
    // Estimate tokens if not provided
    if (!options.tokens) {
      const content = JSON.stringify(options.content);
      options.tokens = Math.ceil(content.length / 4);
    }

    this.store.addMessage(options);

    // Check if context editing is needed
    const stats = this.getContextStats(options.sessionId);
    if (this.contextManager.shouldTriggerContextEditing(stats)) {
      this.applyContextEditing(options.sessionId);
    }
  }

  /**
   * Add executed step to session
   */
  addStep(options: AddStepOptions): void {
    // Estimate tokens if not provided
    if (!options.tokens && options.result) {
      const content = JSON.stringify(options.result);
      options.tokens = Math.ceil(content.length / 4);
    }

    this.store.addStep(options);
  }

  /**
   * Get conversation messages for Claude API
   * Returns optimized messages with cache control
   */
  getMessagesForAPI(sessionId: string): Anthropic.MessageParam[] {
    const messages = this.store.getMessages(sessionId);
    
    // Convert stored messages to Anthropic format
    const apiMessages: Anthropic.MessageParam[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Apply cache optimization
    return this.contextManager.optimizeMessagesForCaching(apiMessages);
  }

  /**
   * Get system prompt with cache control
   */
  getSystemPromptForAPI(
    systemPrompt: string,
    sessionId: string
  ): string | Array<Anthropic.Messages.TextBlockParam> {
    const cache = this.store.getCacheMetadata(sessionId);
    return this.contextManager.buildCachedSystemPrompt(
      systemPrompt,
      cache.cachedContext
    );
  }

  /**
   * Get tools with cache control
   */
  getToolsForAPI(tools: Anthropic.Tool[]): Anthropic.Tool[] {
    return this.contextManager.addToolCacheControl(tools);
  }

  /**
   * Get context statistics for session
   */
  getContextStats(sessionId: string): ContextStats {
    const messages = this.getMessagesForAPI(sessionId);
    const cache = this.store.getCacheMetadata(sessionId);
    
    // Build system prompt
    const systemPrompt = this.contextManager.buildCachedSystemPrompt(
      '', // Empty for estimation
      cache.cachedContext
    );

    return this.contextManager.calculateContextStats(
      messages,
      systemPrompt,
      [] // Tools would be passed from AutomationService
    );
  }

  /**
   * Apply context editing to session
   * Clears old tool uses when approaching token limit
   */
  private applyContextEditing(sessionId: string): void {
    const messages = this.store.getMessages(sessionId);
    
    // Convert to API format
    const apiMessages: Anthropic.MessageParam[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Apply editing
    const result = this.contextManager.applyContextEditing(apiMessages);

    if (result.clearedCount > 0) {

      // Clear old messages from database
      const keepCount = messages.length - (result.clearedCount * 2); // Each tool use = 2 messages
      this.store.clearOldMessages(sessionId, Math.max(0, keepCount));
    }
  }

  /**
   * Update session metadata with usage stats
   */
  updateUsageStats(
    sessionId: string,
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens?: number;
      cacheReadTokens?: number;
      cost: number;
    }
  ): void {
    const session = this.store.getSession(sessionId);
    if (!session) return;

    const metadata: Partial<SessionMetadata> = {
      totalInputTokens: session.metadata.totalInputTokens + usage.inputTokens,
      totalOutputTokens: session.metadata.totalOutputTokens + usage.outputTokens,
      totalCacheCreationTokens: session.metadata.totalCacheCreationTokens + (usage.cacheCreationTokens || 0),
      totalCacheReadTokens: session.metadata.totalCacheReadTokens + (usage.cacheReadTokens || 0),
      totalCost: session.metadata.totalCost + usage.cost
    };

    this.store.updateSession(sessionId, { metadata });
  }

  /**
   * Mark session as complete
   */
  completeSession(sessionId: string, success: boolean, error?: string): void {
    this.store.updateSession(sessionId, {
      status: success ? 'completed' : 'error',
      completedAt: Date.now(),
      metadata: {
        finalSuccess: success,
        finalError: error
      }
    });
  }

  /**
   * Pause session (for resuming later)
   */
  pauseSession(sessionId: string): void {
    this.store.updateSession(sessionId, {
      status: 'paused'
    });
  }

  /**
   * Resume paused session
   */
  resumeSession(sessionId: string): void {
    this.store.updateSession(sessionId, {
      status: 'running'
    });
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    messageCount: number;
    stepCount: number;
    totalTokens: number;
  } {
    return this.store.getSessionStats(sessionId);
  }

  /**
   * Export session for backup or analysis
   */
  exportSession(sessionId: string): SessionWithHistory | null {
    return this.loadSession(sessionId);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.store.close();
  }

  /**
   * Get context manager instance
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get store instance
   */
  getStore(): SessionStore {
    return this.store;
  }
}
