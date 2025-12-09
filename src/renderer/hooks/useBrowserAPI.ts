import { useEffect, useState, useCallback } from 'react';
import type { TabInfo } from '@/shared/types';

export function useBrowserAPI() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Subscribe to tab updates
  useEffect(() => {
    const unsubscribeTabsUpdated = window.browserAPI.onTabsUpdated((data: { tabs: TabInfo[]; activeTabId: string | null }) => {
      setTabs(data.tabs);
      setActiveTabId(data.activeTabId);
    });

    const unsubscribeTabReordered = window.browserAPI.onTabReordered((data: { tabId: string; from: number; to: number }) => {
      setTabs(prevTabs => {
        const newTabs = [...prevTabs];
        const [movedTab] = newTabs.splice(data.from, 1);
        if (movedTab) {
          newTabs.splice(data.to, 0, movedTab);
        }
        return newTabs;
      });
    });

    // Initial load
    window.browserAPI.getTabs().then((data: { tabs: TabInfo[]; activeTabId: string | null }) => {
      setTabs(data.tabs);
      setActiveTabId(data.activeTabId);
    });

    return () => {
      unsubscribeTabsUpdated();
      unsubscribeTabReordered();
    };
  }, []);

  // Tab management
  const createTab = useCallback(async (url?: string) => {
    return await window.browserAPI.createTab(url);
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    return await window.browserAPI.closeTab(tabId);
  }, []);

  const switchTab = useCallback(async (tabId: string) => {
    return await window.browserAPI.switchTab(tabId);
  }, []);

  // Navigation
  const navigate = useCallback(async (tabId: string, url: string) => {
    return await window.browserAPI.navigate(tabId, url);
  }, []);

  const goBack = useCallback(async (tabId: string) => {
    return await window.browserAPI.goBack(tabId);
  }, []);

  const goForward = useCallback(async (tabId: string) => {
    return await window.browserAPI.goForward(tabId);
  }, []);

  const reload = useCallback(async (tabId: string) => {
    return await window.browserAPI.reload(tabId);
  }, []);

  const stop = useCallback(async (tabId: string) => {
    return await window.browserAPI.stop(tabId);
  }, []);

  // Get active tab
  const activeTab = tabs.find(tab => tab.id === activeTabId) || null;

  return {
    tabs,
    activeTabId,
    activeTab,
    createTab,
    closeTab,
    switchTab,
    navigate,
    goBack,
    goForward,
    reload,
    stop,
  };
}
