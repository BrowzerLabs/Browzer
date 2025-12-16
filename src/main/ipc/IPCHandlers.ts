import { BaseWindow, ipcMain } from 'electron';
import { BrowserService } from '@/main/BrowserService';
import { AuthService } from '@/main/auth';
import { SubscriptionService } from '@/main/subscription/SubscriptionService';
import { ThemeService } from '@/main/theme';
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

export class IPCHandlers extends EventEmitter {
  private context: IPCContext;
  private handlers: IIPCHandler[] = [];

  constructor(
    baseWindow: BaseWindow,
    private browserService: BrowserService,
    authService: AuthService,
  ) {
    super();
    this.context = {
      baseWindow,
      browserService,
      authService,
      subscriptionService: new SubscriptionService(),
      themeService: ThemeService.getInstance(),
      passwordManager: browserService.getPasswordManager(),
      bookmarkService: browserService.getBookmarkService(),
      tabService: browserService.getTabService(),
      settingsService: browserService.getSettingsService(),
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
    this.handlers.forEach(handler => handler.register());
  }

  public getRegisteredChannels(): string[] {
    return this.handlers.flatMap(handler => handler.getChannels());
  }

  public cleanup(): void {
    this.handlers.forEach(handler => handler.cleanup());
    this.handlers = [];
    ipcMain.removeAllListeners();
  }
}
