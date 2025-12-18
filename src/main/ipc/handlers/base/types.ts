import { BaseWindow } from 'electron';
import { BrowserService } from '@/main/BrowserService';
import { AuthService } from '@/main/auth';
import { SubscriptionService } from '@/main/subscription/SubscriptionService';
import { ThemeService } from '@/main/theme';
import { PasswordManager } from '@/main/password/PasswordManager';
import { BookmarkService } from '@/main/bookmark';
import { TabService } from '@/main/browser';
import { SettingsService } from '@/main/settings/SettingsService';
import { EventEmitter } from 'events';

export interface IPCContext {
  baseWindow: BaseWindow;
  browserService: BrowserService;
  authService: AuthService;
  subscriptionService: SubscriptionService;
  themeService: ThemeService;
  passwordManager: PasswordManager;
  bookmarkService: BookmarkService;
  tabService: TabService;
  settingsService: SettingsService;
  eventEmitter: EventEmitter;
}

export interface IIPCHandler {
  getChannels(): string[];
  register(): void;
  cleanup(): void;
}

export interface HandlerDefinition<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  channel: string;
  handler: (...args: TArgs) => Promise<TReturn> | TReturn;
}
