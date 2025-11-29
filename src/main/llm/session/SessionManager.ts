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
} from './types';
import { AutomationStatus } from '@/shared/types';

export class SessionManager {
  private store: SessionStore;
  private contextManager: ContextManager;

  constructor(dbPath?: string, contextConfig?: Partial<ContextConfig>) {
    this.store = new SessionStore(dbPath);
    this.contextManager = new ContextManager(contextConfig);
  }

  createSession(options: CreateSessionOptions): StoredSession {
    return this.store.createSession(options);
  }

  getSession(sessionId: string): StoredSession | null {
    return this.store.getSession(sessionId);
  }

  loadSession(sessionId: string): SessionWithHistory | null {
    return this.store.getSessionWithHistory(sessionId);
  }

  updateSession(sessionId: string, options: UpdateSessionOptions): void {
    this.store.updateSession(sessionId, options);
  }

  deleteSession(sessionId: string): void {
    this.store.deleteSession(sessionId);
  }

  listSessions(limit = 50, offset = 0): SessionListItem[] {
    return this.store.listSessions(limit, offset);
  }

  addMessage(options: AddMessageOptions): void {
    if (!options.tokens) {
      const content = JSON.stringify(options.content);
      options.tokens = Math.ceil(content.length / 4);
    }

    this.store.addMessage(options);

    const stats = this.getContextStats(options.sessionId);
    if (this.contextManager.shouldTriggerContextEditing(stats)) {
      this.applyContextEditing(options.sessionId);
    }
  }

  addStep(options: AddStepOptions): void {
    if (!options.tokens && options.result) {
      const content = JSON.stringify(options.result);
      options.tokens = Math.ceil(content.length / 4);
    }

    this.store.addStep(options);
  }

  getMessagesForAPI(sessionId: string): Anthropic.MessageParam[] {
    const messages = this.store.getMessages(sessionId);
    
    const apiMessages: Anthropic.MessageParam[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    return this.contextManager.optimizeMessagesForCaching(apiMessages);
  }

  getContextStats(sessionId: string): ContextStats {
    const messages = this.getMessagesForAPI(sessionId);
    const cache = this.store.getCacheMetadata(sessionId);
    
    const systemPrompt = this.contextManager.buildCachedSystemPrompt(
      '',
      cache.cachedContext
    );

    return this.contextManager.calculateContextStats(
      messages,
      systemPrompt,
      []
    );
  }

  private applyContextEditing(sessionId: string): void {
    const messages = this.store.getMessages(sessionId);
    
    const apiMessages: Anthropic.MessageParam[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const result = this.contextManager.applyContextEditing(apiMessages);

    if (result.clearedCount > 0) {

      const keepCount = messages.length - (result.clearedCount * 2); // Each tool use = 2 messages
      this.store.clearOldMessages(sessionId, Math.max(0, keepCount));
    }
  }

  completeSession(sessionId: string, status: AutomationStatus, error?: string): void {
    this.store.updateSession(sessionId, {
      status,
      completedAt: Date.now(),
      metadata: {
        finalError: error
      }
    });
  }

  close(): void {
    this.store.close();
  }
}
