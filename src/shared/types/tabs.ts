import { NavigationError } from './navigation-error';

// Data that can be sent through IPC (serializable)
export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: NavigationError | null;
  failedUrl?: string;
}
