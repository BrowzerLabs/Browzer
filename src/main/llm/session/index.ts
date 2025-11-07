/**
 * Session Management Module
 * 
 * Provides persistent storage and context management for automation sessions.
 * 
 * Key Features:
 * - SQLite-based session storage with better-sqlite3
 * - Intelligent context management with prompt caching
 * - Automatic context editing when approaching token limits
 * - Full conversation history preservation
 * - Session resume capability
 * 
 * Usage:
 * ```typescript
 * const sessionManager = new SessionManager();
 * const session = sessionManager.createSession({
 *   userGoal: "Automate login flow",
 *   recordingId: "rec_123"
 * });
 * ```
 */

export * from './types';
export * from './SessionStore';
export * from './SessionManager';
export * from './ContextManager';
