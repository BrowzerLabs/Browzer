import type {
  BrowserAPI,
  AuthAPI,
  SubscriptionAPI,
  NotificationAPI,
  UpdaterAPI,
  RecordingAPI,
} from './preload/preload';

declare global {
  interface Window {
    browserAPI: BrowserAPI;
    authAPI: AuthAPI;
    subscriptionAPI: SubscriptionAPI;
    notificationAPI: NotificationAPI;
    updaterAPI: UpdaterAPI;
    recordingAPI: RecordingAPI;
  }

  // Vite Electron Forge globals
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
}

export {};
