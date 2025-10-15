/**
 * ChatSessionManager - Manages conversation state and chat sessions
 * 
 * Responsibilities:
 * - Create and manage chat sessions
 * - Track conversation history
 * - Persist session state
 * - Generate session summaries
 * - Handle multi-turn conversations
 */

import { LLMMessage } from '../llm/types';
import { ToolResult } from '../tools/types';
import { BrowserContext } from '../context/types';
import {
  ChatSession,
  ConversationTurn,
  AgentThought,
  AgentAction,
  ExecutionContext
} from './types';

export class ChatSessionManager {
  private sessions: Map<string, ChatSession> = new Map();
  private persistenceEnabled: boolean;

  constructor(options: { persistenceEnabled?: boolean } = {}) {
    this.persistenceEnabled = options.persistenceEnabled ?? true;
  }

  /**
   * Create a new chat session
   */
  public createSession(tabId: string, userId?: string): ChatSession {
    const session: ChatSession = {
      id: this.generateSessionId(),
      tabId,
      userId,
      title: undefined,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
      turns: [],
      messages: [],
      currentContext: undefined,
      stats: {
        totalMessages: 0,
        totalToolCalls: 0,
        totalTokensUsed: 0,
        totalCost: 0,
        successfulActions: 0,
        failedActions: 0
      }
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get existing session or create new one
   */
  public getOrCreateSession(sessionId: string, tabId: string, userId?: string): ChatSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    return this.createSession(tabId, userId);
  }

  /**
   * Get session by ID
   */
  public getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for a tab
   */
  public getSessionsForTab(tabId: string): ChatSession[] {
    return Array.from(this.sessions.values()).filter(s => s.tabId === tabId);
  }

  /**
   * Get all sessions for a user
   */
  public getSessionsForUser(userId: string): ChatSession[] {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId);
  }

  /**
   * Add a user message to the session
   */
  public addUserMessage(sessionId: string, message: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const llmMessage: LLMMessage = {
      role: 'user',
      content: message
    };

    session.messages.push(llmMessage);
    session.stats.totalMessages++;
    session.lastMessageAt = Date.now();

    this.saveSession(session);
  }

  /**
   * Add an assistant message to the session
   */
  public addAssistantMessage(
    sessionId: string,
    message: string,
    toolCalls?: any[]
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const llmMessage: LLMMessage = {
      role: 'assistant',
      content: message,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {})
    };

    session.messages.push(llmMessage);
    session.stats.totalMessages++;
    session.lastMessageAt = Date.now();

    if (toolCalls && toolCalls.length > 0) {
      session.stats.totalToolCalls += toolCalls.length;
    }

    this.saveSession(session);
  }

  /**
   * Add a tool result to the session
   */
  public addToolResult(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    result: ToolResult
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const llmMessage: LLMMessage = {
      role: 'tool',
      content: JSON.stringify(result.data),
      toolCallId,
      name: toolName
    };

    session.messages.push(llmMessage);

    if (result.success) {
      session.stats.successfulActions++;
    } else {
      session.stats.failedActions++;
    }

    this.saveSession(session);
  }

  /**
   * Add a complete conversation turn
   */
  public addTurn(
    sessionId: string,
    userMessage: string,
    agentResponse: string,
    thoughts: AgentThought[],
    actions: AgentAction[],
    toolResults: ToolResult[],
    browserContext?: BrowserContext
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const turn: ConversationTurn = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      userMessage,
      agentThoughts: thoughts,
      agentActions: actions,
      agentResponse,
      toolResults,
      browserContext
    };

    session.turns.push(turn);
    session.lastMessageAt = Date.now();

    // Update stats
    session.stats.totalToolCalls += actions.filter(a => a.type === 'tool_call').length;
    session.stats.successfulActions += toolResults.filter(r => r.success).length;
    session.stats.failedActions += toolResults.filter(r => !r.success).length;

    this.saveSession(session);
  }

  /**
   * Update session execution context
   */
  public updateContext(sessionId: string, context: ExecutionContext): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.currentContext = context;
    this.saveSession(session);
  }

  /**
   * Update session statistics
   */
  public updateStats(
    sessionId: string,
    tokensUsed: number,
    cost: number
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.stats.totalTokensUsed += tokensUsed;
    session.stats.totalCost += cost;

    this.saveSession(session);
  }

  /**
   * Generate a title for the session based on conversation
   */
  public async generateTitle(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session || session.messages.length === 0) {
      return 'New Conversation';
    }

    // Extract first user message for title
    const firstUserMsg = session.messages.find(m => m.role === 'user');
    if (firstUserMsg && typeof firstUserMsg.content === 'string') {
      // Create short title from first message
      const title = firstUserMsg.content.slice(0, 50);
      session.title = title + (firstUserMsg.content.length > 50 ? '...' : '');
      this.saveSession(session);
      return session.title;
    }

    return 'New Conversation';
  }

  /**
   * Get conversation history (messages only)
   */
  public getMessages(sessionId: string): LLMMessage[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.messages] : [];
  }

  /**
   * Get recent messages (last N)
   */
  public getRecentMessages(sessionId: string, count: number): LLMMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.messages.slice(-count);
  }

  /**
   * Get conversation turns
   */
  public getTurns(sessionId: string): ConversationTurn[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.turns] : [];
  }

  /**
   * Clear conversation history but keep session
   */
  public clearHistory(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.messages = [];
    session.turns = [];
    session.currentContext = undefined;
    
    // Reset stats
    session.stats = {
      totalMessages: 0,
      totalToolCalls: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      successfulActions: 0,
      failedActions: 0
    };

    this.saveSession(session);
  }

  /**
   * Delete a session
   */
  public deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    
    if (this.persistenceEnabled) {
      // TODO: Delete from persistent storage
    }
  }

  /**
   * Export session as JSON
   */
  public exportSession(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return JSON.stringify(session, null, 2);
  }

  /**
   * Import session from JSON
   */
  public importSession(sessionJson: string): ChatSession {
    const session = JSON.parse(sessionJson) as ChatSession;
    this.sessions.set(session.id, session);
    this.saveSession(session);
    return session;
  }

  /**
   * Get session summary
   */
  public getSummary(sessionId: string): {
    messageCount: number;
    toolCallCount: number;
    successRate: number;
    totalCost: number;
    duration: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const totalActions = session.stats.successfulActions + session.stats.failedActions;
    const successRate = totalActions > 0 
      ? session.stats.successfulActions / totalActions 
      : 0;

    return {
      messageCount: session.stats.totalMessages,
      toolCallCount: session.stats.totalToolCalls,
      successRate,
      totalCost: session.stats.totalCost,
      duration: session.lastMessageAt - session.createdAt
    };
  }

  /**
   * Get all sessions
   */
  public getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Count total sessions
   */
  public getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Private: Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${crypto.randomUUID()}`;
  }

  /**
   * Private: Save session to persistent storage
   */
  private saveSession(_session: ChatSession): void {
    if (!this.persistenceEnabled) return;

    // TODO: Implement persistent storage (e.g., electron-store, IndexedDB, etc.)
    // For now, just keep in memory
  }

  /**
   * Private: Load session from persistent storage
   */
  private loadSession(_sessionId: string): ChatSession | undefined {
    if (!this.persistenceEnabled) return undefined;

    // TODO: Implement loading from persistent storage
    return undefined;
  }
}

