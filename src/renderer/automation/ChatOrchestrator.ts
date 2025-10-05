export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    actionResults?: any[];
    browserState?: any;
    error?: string;
  };
}

export interface ChatSession {
  id: string;
  recordingSessionId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  status: 'active' | 'completed' | 'failed';
}

export interface ExecutionContext {
  chatSessionId: string;
  recordingSession: any;
  browserState: any;
  conversationHistory: ChatMessage[];
  currentStep?: number;
  totalSteps?: number;
}

export class ChatOrchestrator {
  private static instance: ChatOrchestrator;
  private activeSessions: Map<string, ChatSession> = new Map();
  private currentSessionId: string | null = null;

  private constructor() {
    this.loadSessions();
  }

  static getInstance(): ChatOrchestrator {
    if (!ChatOrchestrator.instance) {
      ChatOrchestrator.instance = new ChatOrchestrator();
    }
    return ChatOrchestrator.instance;
  }

  /**
   * Create a new chat session for a recording
   */
  createSession(recordingSessionId: string): ChatSession {
    const session: ChatSession = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recordingSessionId,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'active',
    };

    this.activeSessions.set(session.id, session);
    this.currentSessionId = session.id;
    this.saveSessions();

    console.log('[ChatOrchestrator] Created new session:', session.id);
    return session;
  }

  /**
   * Get current active session
   */
  getCurrentSession(): ChatSession | null {
    if (!this.currentSessionId) return null;
    return this.activeSessions.get(this.currentSessionId) || null;
  }

  /**
   * Set active session
   */
  setActiveSession(sessionId: string): boolean {
    if (this.activeSessions.has(sessionId)) {
      this.currentSessionId = sessionId;
      return true;
    }
    return false;
  }

  /**
   * Add message to current session
   */
  addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: any
  ): ChatMessage {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active chat session');
    }

    const message: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: Date.now(),
      metadata,
    };

    session.messages.push(message);
    session.updatedAt = Date.now();
    this.saveSessions();

    return message;
  }

  /**
   * Get conversation history for LLM context
   * Returns messages in format suitable for LLM API
   */
  getConversationHistory(sessionId?: string): Array<{ role: string; content: string }> {
    const session = sessionId
      ? this.activeSessions.get(sessionId)
      : this.getCurrentSession();

    if (!session) return [];

    return session.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Get full execution context for current session
   */
  async getExecutionContext(recordingSession: any, browserState: any): Promise<ExecutionContext> {
    const session = this.getCurrentSession();
    if (!session) {
      throw new Error('No active chat session');
    }

    return {
      chatSessionId: session.id,
      recordingSession,
      browserState,
      conversationHistory: session.messages,
    };
  }

  /**
   * Update session status
   */
  updateSessionStatus(status: 'active' | 'completed' | 'failed', error?: string): void {
    const session = this.getCurrentSession();
    if (!session) return;

    session.status = status;
    session.updatedAt = Date.now();

    if (error && status === 'failed') {
      this.addMessage('assistant', `Execution failed: ${error}`, { error });
    }

    this.saveSessions();
  }

  /**
   * Clear conversation history for current session
   */
  clearCurrentConversation(): void {
    const session = this.getCurrentSession();
    if (!session) return;

    session.messages = [];
    session.updatedAt = Date.now();
    this.saveSessions();
  }

  /**
   * Get all sessions for a recording
   */
  getSessionsForRecording(recordingSessionId: string): ChatSession[] {
    return Array.from(this.activeSessions.values()).filter(
      (session) => session.recordingSessionId === recordingSessionId
    );
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const deleted = this.activeSessions.delete(sessionId);
    if (deleted) {
      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }
      this.saveSessions();
    }
    return deleted;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ChatSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Save sessions to localStorage
   */
  private saveSessions(): void {
    try {
      const sessionsData = Array.from(this.activeSessions.entries());
      localStorage.setItem('chat_sessions', JSON.stringify(sessionsData));
      localStorage.setItem('current_chat_session', this.currentSessionId || '');
    } catch (error) {
      console.error('[ChatOrchestrator] Failed to save sessions:', error);
    }
  }

  /**
   * Load sessions from localStorage
   */
  private loadSessions(): void {
    try {
      const sessionsData = localStorage.getItem('chat_sessions');
      if (sessionsData) {
        const entries = JSON.parse(sessionsData);
        this.activeSessions = new Map(entries);
      }

      const currentSessionId = localStorage.getItem('current_chat_session');
      if (currentSessionId && this.activeSessions.has(currentSessionId)) {
        this.currentSessionId = currentSessionId;
      }
    } catch (error) {
      console.error('[ChatOrchestrator] Failed to load sessions:', error);
      this.activeSessions = new Map();
    }
  }

  /**
   * Export session for debugging/analysis
   */
  exportSession(sessionId: string): string {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return JSON.stringify(session, null, 2);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    messageCount: number;
    userMessages: number;
    assistantMessages: number;
    duration: number;
    status: string;
  } | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const userMessages = session.messages.filter((m) => m.role === 'user').length;
    const assistantMessages = session.messages.filter((m) => m.role === 'assistant').length;
    const duration = session.updatedAt - session.createdAt;

    return {
      messageCount: session.messages.length,
      userMessages,
      assistantMessages,
      duration,
      status: session.status,
    };
  }
}
