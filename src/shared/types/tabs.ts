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
  group?: TabGroup;
  error?: NavigationError | null;
  failedUrl?: string;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
}

export interface TabsSnapshot {
  tabs: TabInfo[];
  activeTabId: string | null;
  groups: TabGroup[];
}

export interface ClosedTabInfo {
  url: string;
  title: string;
  favicon?: string;
  index: number;
  groupId?: string;
}
