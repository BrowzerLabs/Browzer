import { BaseWindow, ipcMain } from 'electron';
import { EventEmitter } from 'events';

import {
  IPCContext,
  IIPCHandler,
  TabHandler,
  NavigationHandler,
  DownloadHandler,
  SidebarHandler,
  SettingsHandler,
  HistoryHandler,
  BookmarkHandler,
  PasswordHandler,
  WindowHandler,
  AuthHandler,
  SubscriptionHandler,
  ShellHandler,
  DeepLinkHandler,
  AutocompleteHandler,
  ThemeHandler,
  RecordingHandler,
} from './handlers';

import { BrowserService } from '@/main/BrowserService';
import { AuthService } from '@/main/auth';
import { SubscriptionService } from '@/main/subscription/SubscriptionService';
import { ThemeService } from '@/main/theme';
import { RecordingManager } from '@/main/recording';

export class IPCHandlers extends EventEmitter {
  private context: IPCContext;
  private handlers: IIPCHandler[] = [];
  private recordingHandler: RecordingHandler | null = null;

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
    this.recordingHandler = new RecordingHandler(this.context);

    this.handlers = [
      new TabHandler(this.context),
      new NavigationHandler(this.context),
      new DownloadHandler(this.context),
      new SidebarHandler(this.context),
      new SettingsHandler(this.context),
      new HistoryHandler(this.context),
      new BookmarkHandler(this.context),
      new PasswordHandler(this.context),
      new WindowHandler(this.context),
      new AuthHandler(this.context),
      new SubscriptionHandler(this.context),
      new ShellHandler(this.context),
      new DeepLinkHandler(this.context),
      new AutocompleteHandler(this.context),
      new ThemeHandler(this.context),
      this.recordingHandler,
    ];
    this.handlers.forEach((handler) => handler.register());
  }

  setRecordingManager(manager: RecordingManager): void {
    if (this.recordingHandler) {
      this.recordingHandler.setRecordingManager(manager);
    }
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
