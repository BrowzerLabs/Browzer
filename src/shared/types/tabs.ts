export interface TabErrorState {
  errorCode: number;
  errorName: string;
  failedUrl: string;
}

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  errorState?: TabErrorState;
}
