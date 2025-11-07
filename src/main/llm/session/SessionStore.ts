/* eslint-disable @typescript-eslint/no-explicit-any */
import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import {
  StoredSession,
  StoredMessage,
  StoredStep,
  SessionCacheMetadata,
  SessionWithHistory,
  SessionListItem,
  CreateSessionOptions,
  UpdateSessionOptions,
  AddMessageOptions,
  AddStepOptions,
  SessionMetadata
} from './types';

/**
 * SessionStore - SQLite database for automation sessions
 * 
 * Provides persistent storage for:
 * - Session metadata and status
 * - Complete conversation history
 * - Executed steps with results
 * - Cache metadata for optimization
 * 
 * Uses better-sqlite3 for synchronous, high-performance database operations.
 */
export class SessionStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    // Use app data directory by default
    const defaultPath = path.join(app.getPath('userData'), 'automation-sessions.db');
    this.db = new Database(dbPath || defaultPath);
    
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    this.initializeDatabase();
  }

  /**
   * Initialize database schema
   */
  private initializeDatabase(): void {
    // Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automation_sessions (
        id TEXT PRIMARY KEY,
        user_goal TEXT NOT NULL,
        recording_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'error', 'paused')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        metadata TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON automation_sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON automation_sessions(status);
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        tokens INTEGER,
        cached INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES automation_sessions(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id, created_at);
    `);

    // Steps table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        tool_use_id TEXT,
        effects TEXT,
        result TEXT,
        success INTEGER NOT NULL,
        error TEXT,
        tokens INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES automation_sessions(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_steps_session ON session_steps(session_id, step_number);
    `);

    // Cache metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_cache (
        session_id TEXT PRIMARY KEY,
        cached_context TEXT,
        cache_breakpoints TEXT NOT NULL,
        last_cache_hit INTEGER,
        FOREIGN KEY (session_id) REFERENCES automation_sessions(id) ON DELETE CASCADE
      );
    `);
  }

  /**
   * Create a new session
   */
  createSession(options: CreateSessionOptions): StoredSession {
    const id = this.generateSessionId();
    const now = Date.now();
    
    const metadata: SessionMetadata = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalCost: 0,
      recoveryAttempts: 0,
      totalStepsExecuted: 0,
      phaseNumber: 1,
      isInRecovery: false
    };

    const session: StoredSession = {
      id,
      userGoal: options.userGoal,
      recordingId: options.recordingId,
      status: 'running',
      createdAt: now,
      updatedAt: now,
      metadata
    };

    const stmt = this.db.prepare(`
      INSERT INTO automation_sessions (id, user_goal, recording_id, status, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.userGoal,
      session.recordingId,
      session.status,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session.metadata)
    );

    // Initialize cache metadata if cached context provided
    if (options.cachedContext) {
      this.db.prepare(`
        INSERT INTO session_cache (session_id, cached_context, cache_breakpoints)
        VALUES (?, ?, ?)
      `).run(id, options.cachedContext, JSON.stringify([]));
    }

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): StoredSession | null {
    const stmt = this.db.prepare(`
      SELECT * FROM automation_sessions WHERE id = ?
    `);

    const row = stmt.get(sessionId) as any;
    if (!row) return null;

    return this.rowToSession(row);
  }

  /**
   * Get session with full history
   */
  getSessionWithHistory(sessionId: string): SessionWithHistory | null {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const messages = this.getMessages(sessionId);
    const steps = this.getSteps(sessionId);
    const cache = this.getCacheMetadata(sessionId);

    return { session, messages, steps, cache };
  }

  /**
   * Update session
   */
  updateSession(sessionId: string, options: UpdateSessionOptions): void {
    const updates: string[] = [];
    const values: any[] = [];

    if (options.status) {
      updates.push('status = ?');
      values.push(options.status);
    }

    if (options.completedAt !== undefined) {
      updates.push('completed_at = ?');
      values.push(options.completedAt);
    }

    if (options.metadata) {
      const currentSession = this.getSession(sessionId);
      if (currentSession) {
        const updatedMetadata = { ...currentSession.metadata, ...options.metadata };
        updates.push('metadata = ?');
        values.push(JSON.stringify(updatedMetadata));
      }
    }

    updates.push('updated_at = ?');
    values.push(Date.now());

    values.push(sessionId);

    const stmt = this.db.prepare(`
      UPDATE automation_sessions
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);
  }

  /**
   * Delete session and all related data
   */
  deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM automation_sessions WHERE id = ?').run(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(limit = 50, offset = 0): SessionListItem[] {
    const stmt = this.db.prepare(`
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM session_messages WHERE session_id = s.id) as message_count,
        (SELECT COUNT(*) FROM session_steps WHERE session_id = s.id) as step_count
      FROM automation_sessions s
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as any[];
    
    return rows.map(row => {
      const metadata = JSON.parse(row.metadata) as SessionMetadata;
      return {
        id: row.id,
        userGoal: row.user_goal,
        recordingId: row.recording_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount: row.message_count,
        stepCount: row.step_count,
        totalCost: metadata.totalCost
      };
    });
  }

  /**
   * Add message to session
   */
  addMessage(options: AddMessageOptions): StoredMessage {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO session_messages (session_id, role, content, tokens, cached, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      options.sessionId,
      options.role,
      JSON.stringify(options.content),
      options.tokens || null,
      options.cached ? 1 : 0,
      now
    );

    return {
      id: info.lastInsertRowid as number,
      sessionId: options.sessionId,
      role: options.role,
      content: options.content,
      tokens: options.tokens,
      cached: options.cached || false,
      createdAt: now
    };
  }

  /**
   * Get all messages for a session
   */
  getMessages(sessionId: string): StoredMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM session_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);

    const rows = stmt.all(sessionId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: JSON.parse(row.content),
      tokens: row.tokens,
      cached: row.cached === 1,
      createdAt: row.created_at
    }));
  }

  /**
   * Add step to session
   */
  addStep(options: AddStepOptions): StoredStep {
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO session_steps (
        session_id, step_number, tool_name, tool_use_id, effects, result, success, error, tokens, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      options.sessionId,
      options.stepNumber,
      options.toolName,
      options.toolUseId || null,
      options.effects ? JSON.stringify(options.effects) : null,
      options.result ? JSON.stringify(options.result) : null,
      options.success ? 1 : 0,
      options.error || null,
      options.tokens || null,
      now
    );

    return {
      id: info.lastInsertRowid as number,
      sessionId: options.sessionId,
      stepNumber: options.stepNumber,
      toolName: options.toolName,
      toolUseId: options.toolUseId,
      effects: options.effects,
      result: options.result,
      success: options.success,
      error: options.error,
      tokens: options.tokens,
      createdAt: now
    };
  }

  /**
   * Get all steps for a session
   */
  getSteps(sessionId: string): StoredStep[] {
    const stmt = this.db.prepare(`
      SELECT * FROM session_steps
      WHERE session_id = ?
      ORDER BY step_number ASC
    `);

    const rows = stmt.all(sessionId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      stepNumber: row.step_number,
      toolName: row.tool_name,
      toolUseId: row.tool_use_id,
      effects: row.effects ? JSON.parse(row.effects) : undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      success: row.success === 1,
      error: row.error,
      tokens: row.tokens,
      createdAt: row.created_at
    }));
  }

  /**
   * Get or create cache metadata
   */
  getCacheMetadata(sessionId: string): SessionCacheMetadata {
    const stmt = this.db.prepare(`
      SELECT * FROM session_cache WHERE session_id = ?
    `);

    const row = stmt.get(sessionId) as any;
    
    if (row) {
      return {
        sessionId: row.session_id,
        cachedContext: row.cached_context,
        cacheBreakpoints: JSON.parse(row.cache_breakpoints),
        lastCacheHit: row.last_cache_hit
      };
    }

    // Create default cache metadata
    const defaultCache: SessionCacheMetadata = {
      sessionId,
      cacheBreakpoints: []
    };

    this.db.prepare(`
      INSERT INTO session_cache (session_id, cache_breakpoints)
      VALUES (?, ?)
    `).run(sessionId, JSON.stringify([]));

    return defaultCache;
  }

  /**
   * Update cache metadata
   */
  updateCacheMetadata(metadata: SessionCacheMetadata): void {
    this.db.prepare(`
      UPDATE session_cache
      SET cached_context = ?, cache_breakpoints = ?, last_cache_hit = ?
      WHERE session_id = ?
    `).run(
      metadata.cachedContext || null,
      JSON.stringify(metadata.cacheBreakpoints),
      metadata.lastCacheHit || null,
      metadata.sessionId
    );
  }

  /**
   * Clear old messages (for context editing)
   */
  clearOldMessages(sessionId: string, keepCount: number): number {
    const totalCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM session_messages WHERE session_id = ?
    `).get(sessionId) as any;

    if (totalCount.count <= keepCount) {
      return 0;
    }

    const toDelete = totalCount.count - keepCount;

    const result = this.db.prepare(`
      DELETE FROM session_messages
      WHERE id IN (
        SELECT id FROM session_messages
        WHERE session_id = ?
        ORDER BY created_at ASC
        LIMIT ?
      )
    `).run(sessionId, toDelete);

    return result.changes;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    messageCount: number;
    stepCount: number;
    totalTokens: number;
  } {
    const stats = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM session_messages WHERE session_id = ?) as message_count,
        (SELECT COUNT(*) FROM session_steps WHERE session_id = ?) as step_count,
        (SELECT COALESCE(SUM(tokens), 0) FROM session_messages WHERE session_id = ?) as message_tokens,
        (SELECT COALESCE(SUM(tokens), 0) FROM session_steps WHERE session_id = ?) as step_tokens
    `).get(sessionId, sessionId, sessionId, sessionId) as any;

    return {
      messageCount: stats.message_count,
      stepCount: stats.step_count,
      totalTokens: stats.message_tokens + stats.step_tokens
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Helper: Convert database row to StoredSession
   */
  private rowToSession(row: any): StoredSession {
    return {
      id: row.id,
      userGoal: row.user_goal,
      recordingId: row.recording_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      metadata: JSON.parse(row.metadata)
    };
  }

  /**
   * Helper: Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
