import { useEffect, useState, useCallback, useRef } from 'react';
import type { TabInfo } from '@/shared/types';

export function useBrowserAPI() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  
  const updateSequenceRef = useRef(0);
  const lastReorderTimeRef = useRef(0);

  useEffect(() => {
    const unsubscribeTabsUpdated = window.browserAPI.onTabsUpdated((data: { tabs: TabInfo[]; activeTabId: string | null }) => {
      const now = Date.now();
      if (now - lastReorderTimeRef.current < 100) {
        setActiveTabId(data.activeTabId);
        return;
      }
      
      updateSequenceRef.current++;
      setTabs(data.tabs);
      setActiveTabId(data.activeTabId);
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
          window.browserAPI.getTabs().then((freshData: { tabs: TabInfo[]; activeTabId: string | null }) => {
            setTabs(freshData.tabs);
            setActiveTabId(freshData.activeTabId);
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

    window.browserAPI.getTabs().then((data: { tabs: TabInfo[]; activeTabId: string | null }) => {
      setTabs(data.tabs);
      setActiveTabId(data.activeTabId);
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
    reorderTab,
    moveActiveTabLeft,
    moveActiveTabRight,
  };
}
