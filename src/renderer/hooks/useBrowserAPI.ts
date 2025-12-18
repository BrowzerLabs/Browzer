import { useEffect, useState, useCallback, useRef } from 'react';
import type { TabGroup, TabInfo, TabsSnapshot } from '@/shared/types';

export function useBrowserAPI() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabGroups, setTabGroups] = useState<TabGroup[]>([]);
  
  const updateSequenceRef = useRef(0);
  const lastReorderTimeRef = useRef(0);

  useEffect(() => {
    const unsubscribeTabsUpdated = window.browserAPI.onTabsUpdated((data: TabsSnapshot) => {
      const now = Date.now();
      if (now - lastReorderTimeRef.current < 100) {
        setActiveTabId(data.activeTabId);
        setTabGroups(data.groups || []);
        setTabs(currentTabs => {
          const incomingTabsMap = new Map(data.tabs.map(t => [t.id, t]));
          return currentTabs.map(t => incomingTabsMap.get(t.id) || t);
        });
        
        return;
      }
      
      updateSequenceRef.current++;
      setTabs(data.tabs);
      setActiveTabId(data.activeTabId);
      setTabGroups(data.groups || []);
    });

    const unsubscribeTabReordered = window.browserAPI.onTabReordered((data: { tabId: string; from: number; to: number }) => {
      lastReorderTimeRef.current = Date.now();
      
      setTabs(prevTabs => {
        if (data.from < 0 || data.from >= prevTabs.length) {
          console.warn('[useBrowserAPI] Invalid reorder from index:', data.from);
          return prevTabs;
        }
        if (data.to < 0 || data.to >= prevTabs.length) {
          console.warn('[useBrowserAPI] Invalid reorder to index:', data.to);
          return prevTabs;
        }
        
        if (prevTabs[data.from]?.id !== data.tabId) {
          console.warn('[useBrowserAPI] Tab mismatch at from index, refreshing tabs');
          window.browserAPI.getTabs().then((freshData: TabsSnapshot) => {
            setTabs(freshData.tabs);
            setActiveTabId(freshData.activeTabId);
            setTabGroups(freshData.groups || []);
          });
          return prevTabs;
        }
        
        const newTabs = [...prevTabs];
        const [movedTab] = newTabs.splice(data.from, 1);
        if (movedTab) {
          newTabs.splice(data.to, 0, movedTab);
        }
        return newTabs;
      });
    });

    window.browserAPI.getTabs().then((data: TabsSnapshot) => {
      setTabs(data.tabs);
      setActiveTabId(data.activeTabId);
      setTabGroups(data.groups || []);
    });

    return () => {
      unsubscribeTabsUpdated();
      unsubscribeTabReordered();
    };
  }, []);

  const createTab = useCallback(async (url?: string) => {
    return await window.browserAPI.createTab(url);
  }, []);

  const closeTab = useCallback(async (tabId: string) => {
    return await window.browserAPI.closeTab(tabId);
  }, []);

  const switchTab = useCallback(async (tabId: string) => {
    return await window.browserAPI.switchTab(tabId);
  }, []);

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

  const reorderTab = useCallback(async (tabId: string, newIndex: number) => {
    try {
      return await window.browserAPI.reorderTab(tabId, newIndex);
    } catch (error) {
      console.error('[useBrowserAPI] Failed to reorder tab:', error);
      const freshData = await window.browserAPI.getTabs();
      setTabs(freshData.tabs);
      setActiveTabId(freshData.activeTabId);
      return false;
    }
  }, []);

  const moveActiveTabLeft = useCallback(async () => {
    if (!activeTabId) return false;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    if (currentIndex <= 0) return false;
    return reorderTab(activeTabId, currentIndex - 1);
  }, [activeTabId, tabs, reorderTab]);

  const moveActiveTabRight = useCallback(async () => {
    if (!activeTabId) return false;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    if (currentIndex === -1 || currentIndex >= tabs.length - 1) return false;
    return reorderTab(activeTabId, currentIndex + 1);
  }, [activeTabId, tabs, reorderTab]);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || null;
  const createTabGroup = useCallback(async (name?: string, color?: string) => {
    return await window.browserAPI.createTabGroup(name, color);
  }, []);

  const updateTabGroup = useCallback(async (groupId: string, name?: string, color?: string) => {
    return await window.browserAPI.updateTabGroup(groupId, name, color);
  }, []);

  const assignTabToGroup = useCallback(async (tabId: string, groupId: string | null) => {
    try {
      return await window.browserAPI.assignTabGroup(tabId, groupId);
    } catch (error) {
      console.error('[useBrowserAPI] Failed to assign tab group:', error);
      return false;
    }
  }, []);

  const removeTabGroup = useCallback(async (groupId: string) => {
    try {
      return await window.browserAPI.removeTabGroup(groupId);
    } catch (error) {
      console.error('[useBrowserAPI] Failed to remove tab group:', error);
      return false;
    }
  }, []);

  const toggleTabGroupCollapse = useCallback(async (groupId: string) => {
    try {
      return await window.browserAPI.toggleTabGroupCollapse(groupId);
    } catch (error) {
      console.error('[useBrowserAPI] Failed to toggle tab group collapse:', error);
      return false;
    }
  }, []);

  return {
    tabs,
    activeTabId,
    activeTab,
    tabGroups,
    createTab,
    closeTab,
    switchTab,
    navigate,
    goBack,
    goForward,
    reload,
    stop,
    reorderTab,
    moveActiveTabLeft,
    moveActiveTabRight,
    createTabGroup,
    updateTabGroup,
    assignTabToGroup,
    removeTabGroup,
    toggleTabGroupCollapse,
  };
}
