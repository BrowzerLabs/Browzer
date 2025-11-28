
// Data that can be sent through IPC (serializable)
export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  /** Icon name for internal browzer:// pages (from lucide-react) */
  icon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}
