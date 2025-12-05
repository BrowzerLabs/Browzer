import { useEffect, useState, useCallback } from 'react';
import type { TabInfo, TabGroup } from '@/shared/types';

export function useBrowserAPI() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [groups, setGroups] = useState<TabGroup[]>([]);

  // Subscribe to tab updates
  useEffect(() => {
    const unsubscribe = window.browserAPI.onTabsUpdated((data) => {
      setTabs(data.tabs);
      setActiveTabId(data.activeTabId);
      setGroups(data.groups || []);
    });

    // Initial load
    window.browserAPI.getTabs().then((data) => {
      setTabs(data.tabs);
      setActiveTabId(data.activeTabId);
      setGroups(data.groups || []);
    });

    return unsubscribe;
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

  // Group management
  const createTabGroup = useCallback(async (name: string, color: string, tabId?: string) => {
    return await window.browserAPI.createTabGroup(name, color, tabId);
  }, []);

  const assignTabToGroup = useCallback(async (tabId: string, groupId: string) => {
    return await window.browserAPI.assignTabToGroup(tabId, groupId);
  }, []);

  const removeTabFromGroup = useCallback(async (tabId: string) => {
    return await window.browserAPI.removeTabFromGroup(tabId);
  }, []);

  const toggleTabGroupCollapsed = useCallback(async (groupId: string) => {
    return await window.browserAPI.toggleTabGroupCollapsed(groupId);
  }, []);

  // Get active tab
  const activeTab = tabs.find(tab => tab.id === activeTabId) || null;

  return {
    tabs,
    groups,
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
    createTabGroup,
    assignTabToGroup,
    removeTabFromGroup,
    toggleTabGroupCollapsed,
  };
}
