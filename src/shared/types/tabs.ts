
// Data that can be sent through IPC (serializable)
export interface TabInfo {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  groupId?: string;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  tabIds: string[];
}

export interface TabsState {
  tabs: TabInfo[];
  groups: TabGroup[];
  activeTabId: string | null;
}
