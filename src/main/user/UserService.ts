import { randomUUID } from 'crypto';
import { app } from 'electron';

import Store from 'electron-store';

import {
  User,
  Session,
  SubscriptionStatus,
  SubscriptionPlan,
  UserPreferences,
  Subscription,
} from '@/shared/types';

/**
 * UserService
 *
 * Handles user authentication, session management, and profile operations.
 *
 * Architecture:
 * - Uses electron-store for local persistence
 * - Session-based authentication (ready for JWT tokens)
 * - Scalable for future backend integration
 * - Supports subscription management
 *
 * Future Backend Integration:
 * - Replace local storage with API calls
 * - Implement JWT token refresh
 * - Add OAuth providers (Google, GitHub, etc.)
 * - Sync user data with cloud database
 */
export class UserService {
  private userStore: Store<{ users: Record<string, User> }>;
  private sessionStore: Store<{ currentSession: Session | null }>;
  private currentUser: User | null = null;
  private currentSession: Session | null = null;

  // Session configuration
  private readonly SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days
  private readonly SESSION_REFRESH_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor() {
    // Initialize stores
    this.userStore = new Store<{ users: Record<string, User> }>({
      name: 'users',
      defaults: {
        users: {},
      },
    });

    this.sessionStore = new Store<{ currentSession: Session | null }>({
      name: 'session',
      defaults: {
        currentSession: null,
      },
    });

    // Restore session on startup
    this.restoreSession();
  }

  /**
   * Restore session from storage
   * Called on app startup
   */
  private restoreSession(): void {
    const session = this.sessionStore.get('currentSession');

    if (!session) {
      console.log('No existing session found');
      return;
    }

    // Check if session is expired
    if (Date.now() > session.expiresAt) {
      console.log('Session expired, clearing...');
      this.clearSession();
      return;
    }

    // Restore user
    const users = this.userStore.get('users');
    const user = users[session.userId];

    if (!user) {
      console.log('User not found for session, clearing...');
      this.clearSession();
      return;
    }

    this.currentSession = session;
    this.currentUser = user;

    // Update last activity
    this.updateSessionActivity();

    console.log(`Session restored for user: ${user.email}`);
  }

  /**
   * Create a new user (sign up)
   * In production, this would call your backend API
   */
  public async createUser(data: {
    email: string;
    name: string;
    password?: string; // For future authentication
  }): Promise<User> {
    const users = this.userStore.get('users');

    // Check if user already exists
    const existingUser = Object.values(users).find(
      (u) => u.email === data.email
    );
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create new user
    const user: User = {
      id: randomUUID(),
      email: data.email,
      name: data.name,
      isVerified: false, // Would be verified via email in production
      createdAt: Date.now(),
      subscription: {
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.FREE,
      },
      preferences: {
        theme: 'system',
        language: 'en',
        notifications: true,
      },
    };

    // Save user
    users[user.id] = user;
    this.userStore.set('users', users);

    console.log(`User created: ${user.email}`);
    return user;
  }

  /**
   * Sign in user
   * In production, this would authenticate with your backend
   */
  public async signIn(
    email: string,
    password?: string
  ): Promise<{ user: User; session: Session }> {
    const users = this.userStore.get('users');
    const user = Object.values(users).find((u) => u.email === email);

    if (!user) {
      throw new Error('User not found');
    }

    // TODO: In production, verify password with backend
    // const isValid = await this.verifyPassword(password, user.passwordHash);

    // Create session
    const session = this.createSession(user.id);

    // Update user
    user.lastLoginAt = Date.now();
    users[user.id] = user;
    this.userStore.set('users', users);

    // Set current user and session
    this.currentUser = user;
    this.currentSession = session;
    this.sessionStore.set('currentSession', session);

    console.log(`User signed in: ${user.email}`);
    return { user, session };
  }

  /**
   * Sign out current user
   */
  public async signOut(): Promise<void> {
    if (!this.currentUser) {
      return;
    }

    console.log(`User signed out: ${this.currentUser.email}`);

    this.clearSession();
  }

  /**
   * Get current user
   */
  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * Get current session
   */
  public getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.currentUser !== null && this.currentSession !== null;
  }

  /**
   * Update user profile
   */
  public async updateProfile(
    updates: Partial<Pick<User, 'name' | 'avatar' | 'preferences'>>
  ): Promise<User> {
    if (!this.currentUser) {
      throw new Error('No user signed in');
    }

    const users = this.userStore.get('users');
    const user = users[this.currentUser.id];

    if (!user) {
      throw new Error('User not found');
    }

    // Update user
    Object.assign(user, updates);
    users[user.id] = user;
    this.userStore.set('users', users);

    // Update current user
    this.currentUser = user;

    console.log(`Profile updated for user: ${user.email}`);
    return user;
  }

  /**
   * Update user preferences
   */
  public async updatePreferences(
    preferences: Partial<UserPreferences>
  ): Promise<User> {
    if (!this.currentUser) {
      throw new Error('No user signed in');
    }

    const users = this.userStore.get('users');
    const user = users[this.currentUser.id];

    if (!user) {
      throw new Error('User not found');
    }

    // Update preferences
    user.preferences = { ...user.preferences, ...preferences };
    users[user.id] = user;
    this.userStore.set('users', users);

    // Update current user
    this.currentUser = user;

    console.log(`Preferences updated for user: ${user.email}`);
    return user;
  }

  /**
   * Update subscription status
   * For future use with payment integration
   */
  public async updateSubscription(
    subscription: Partial<Subscription>
  ): Promise<User> {
    if (!this.currentUser) {
      throw new Error('No user signed in');
    }

    const users = this.userStore.get('users');
    const user = users[this.currentUser.id];

    if (!user) {
      throw new Error('User not found');
    }

    // Update subscription
    user.subscription = { ...user.subscription, ...subscription };
    users[user.id] = user;
    this.userStore.set('users', users);

    // Update current user
    this.currentUser = user;

    console.log(`Subscription updated for user: ${user.email}`);
    return user;
  }

  /**
   * Create a new session
   */
  private createSession(userId: string): Session {
    const now = Date.now();

    return {
      sessionId: randomUUID(),
      userId,
      createdAt: now,
      expiresAt: now + this.SESSION_DURATION,
      lastActivityAt: now,
      deviceInfo: {
        platform: process.platform,
        version: app.getVersion(),
      },
    };
  }

  /**
   * Update session activity
   * Called on user actions to keep session alive
   */
  public updateSessionActivity(): void {
    if (!this.currentSession) {
      return;
    }

    const now = Date.now();
    this.currentSession.lastActivityAt = now;

    // Refresh session if close to expiry
    const timeUntilExpiry = this.currentSession.expiresAt - now;
    if (timeUntilExpiry < this.SESSION_REFRESH_THRESHOLD) {
      this.currentSession.expiresAt = now + this.SESSION_DURATION;
      console.log('Session refreshed');
    }

    this.sessionStore.set('currentSession', this.currentSession);
  }

  /**
   * Clear current session
   */
  private clearSession(): void {
    this.currentUser = null;
    this.currentSession = null;
    this.sessionStore.set('currentSession', null);
  }

  /**
   * Delete user account
   * For GDPR compliance
   */
  public async deleteAccount(): Promise<void> {
    if (!this.currentUser) {
      throw new Error('No user signed in');
    }

    const users = this.userStore.get('users');
    delete users[this.currentUser.id];
    this.userStore.set('users', users);

    console.log(`Account deleted for user: ${this.currentUser.email}`);

    this.clearSession();
  }

  /**
   * Get all users (admin only, for development)
   */
  public getAllUsers(): User[] {
    const users = this.userStore.get('users');
    return Object.values(users);
  }

  /**
   * Create a guest user for trial
   * Useful for onboarding without signup
   */
  public async createGuestUser(): Promise<{ user: User; session: Session }> {
    const guestEmail = `guest_${Date.now()}@browzer.local`;

    const user = await this.createUser({
      email: guestEmail,
      name: 'Guest User',
    });

    // Set trial subscription
    user.subscription = {
      status: SubscriptionStatus.ACTIVE,
      plan: SubscriptionPlan.FREE,
      trialEndsAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    const users = this.userStore.get('users');
    users[user.id] = user;
    this.userStore.set('users', users);

    // Create session
    const session = this.createSession(user.id);
    this.currentUser = user;
    this.currentSession = session;
    this.sessionStore.set('currentSession', session);

    console.log(`Guest user created: ${user.email}`);
    return { user, session };
  }
}
