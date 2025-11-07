import { create } from 'zustand';
import type { TabInfo } from '../../preload';

interface BrowserState {
  tabs: TabInfo[];
  activeTabId: string | null;
  setTabs: (tabs: TabInfo[]) => void;
  setActiveTabId: (tabId: string | null) => void;
  updateTabsData: (data: { tabs: TabInfo[]; activeTabId: string | null }) => void;
}

/**
 * Zustand store for browser state
 * 
 * This provides a centralized state management for the browser UI
 */
export const useBrowserStore = create<BrowserState>((set) => ({
  tabs: [],
  activeTabId: null,
  
  setTabs: (tabs) => set({ tabs }),
  
  setActiveTabId: (tabId) => set({ activeTabId: tabId }),
  
  updateTabsData: (data) => set({ tabs: data.tabs, activeTabId: data.activeTabId }),
}));
