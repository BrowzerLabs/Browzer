import { BaseWindow, ipcMain } from 'electron';
import { EventEmitter } from 'events';

import {
  IPCContext,
  IIPCHandler,
  TabHandler,
  NavigationHandler,
  DownloadHandler,
  SidebarHandler,
  RecordingHandler,
  SettingsHandler,
  HistoryHandler,
  BookmarkHandler,
  PasswordHandler,
  WindowHandler,
  AutomationHandler,
  AuthHandler,
  SubscriptionHandler,
  ShellHandler,
  DeepLinkHandler,
  AutocompleteHandler,
  ThemeHandler,
} from './handlers';

import { BrowserService } from '@/main/BrowserService';
import { AuthService } from '@/main/auth';
import { SubscriptionService } from '@/main/subscription/SubscriptionService';
import { ThemeService } from '@/main/theme';

export class IPCHandlers extends EventEmitter {
  private context: IPCContext;
  private handlers: IIPCHandler[] = [];

  constructor(
    private baseWindow: BaseWindow,
    private browserService: BrowserService,
    private authService: AuthService,
    private themeService: ThemeService
  ) {
    super();
    this.context = {
      baseWindow: this.baseWindow,
      browserService: this.browserService,
      authService: this.authService,
      subscriptionService: new SubscriptionService(),
      themeService: this.themeService,
      passwordManager: this.browserService.getPasswordManager(),
      bookmarkService: this.browserService.getBookmarkService(),
      tabService: this.browserService.getTabService(),
      settingsService: this.browserService.getSettingsService(),
      eventEmitter: this,
    };

    this.initializeHandlers();
  }

  private initializeHandlers(): void {
    this.handlers = [
      new TabHandler(this.context),
      new NavigationHandler(this.context),
      new DownloadHandler(this.context),
      new SidebarHandler(this.context),
      new RecordingHandler(this.context),
      new SettingsHandler(this.context),
      new HistoryHandler(this.context),
      new BookmarkHandler(this.context),
      new PasswordHandler(this.context),
      new WindowHandler(this.context),
      new AutomationHandler(this.context),
      new AuthHandler(this.context),
      new SubscriptionHandler(this.context),
      new ShellHandler(this.context),
      new DeepLinkHandler(this.context),
      new AutocompleteHandler(this.context),
      new ThemeHandler(this.context),
    ];
    this.handlers.forEach((handler) => handler.register());
  }

  public getRegisteredChannels(): string[] {
    return this.handlers.flatMap((handler) => handler.getChannels());
  }

  public cleanup(): void {
    this.handlers.forEach((handler) => handler.cleanup());
    this.handlers = [];
    ipcMain.removeAllListeners();
  }
}
