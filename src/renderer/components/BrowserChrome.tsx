import { useEffect, useState, memo, useCallback } from 'react';
import { useBrowserAPI } from '@/renderer/hooks/useBrowserAPI';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import { useOverlayVisibility } from '@/renderer/hooks/useBrowserViewLayer';
import { TabBar } from './TabBar';
import { NavigationBar } from './NavigationBar';
import { BookmarkBar } from './BookmarkBar';
import { Sidebar } from './Sidebar';
import { RestoreSessionPopup } from './RestoreSessionPopup';
import { FindBar } from './FindBar';
import { useFindStore } from '@/renderer/stores/findStore';
import { useScrollForwarding } from '@/renderer/hooks/useScrollForwarding';

export const BrowserChrome = memo(function BrowserChrome() {
  useScrollForwarding();
  const browserAPI = useBrowserAPI();
  const { isVisible: isSidebarVisible, showSidebar } = useSidebarStore();
  const [showBookmarksBar, setShowBookmarksBar] = useState(false);
  const [showRestorePopup, setShowRestorePopup] = useState(false);
  const { toggleFindBar } = useFindStore();

  useOverlayVisibility('restore-session-popup', showRestorePopup);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFindBar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const unsubscribeFindRequest = window.browserAPI.onRequestFind?.(() => {
      toggleFindBar();
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unsubscribeFindRequest?.();
    };
  }, [browserAPI.activeTabId, toggleFindBar]);

  useEffect(() => {
    const unsubRestore = window.browserAPI.onShowRestoreSession(() => {
      setShowRestorePopup(true);
    });

    return () => unsubRestore();
  }, []);

  useEffect(() => {
    const loadSetting = async () => {
      const settings = await window.browserAPI.getAllSettings();
      setShowBookmarksBar(settings.appearance.showBookmarksBar as boolean);
    };

    loadSetting();

    const unsubSettings = window.browserAPI.onSettingsChanged((data: { category: string; key: string; value: unknown }) => {
      if (data.category === 'appearance' && data.key === 'showBookmarksBar') {
        setShowBookmarksBar(data.value as boolean);
      }
    });

    return () => {
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    const unsubStart = window.browserAPI.onRecordingStarted(() => {
      showSidebar();
    });
    
    return () => unsubStart();
  }, [showSidebar]);

  // Memoize navigation handlers
  const handleNavigate = useCallback((url: string) => {
    if (browserAPI.activeTabId) {
      browserAPI.navigate(browserAPI.activeTabId, url);
    }
  }, [browserAPI]);

  const handleBack = useCallback(() => {
    if (browserAPI.activeTabId) {
      browserAPI.goBack(browserAPI.activeTabId);
    }
  }, [browserAPI]);

  const handleForward = useCallback(() => {
    if (browserAPI.activeTabId) {
      browserAPI.goForward(browserAPI.activeTabId);
    }
  }, [browserAPI]);

  const handleReload = useCallback(() => {
    if (browserAPI.activeTabId) {
      browserAPI.reload(browserAPI.activeTabId);
    }
  }, [browserAPI]);

  const handleStop = useCallback(() => {
    if (browserAPI.activeTabId) {
      browserAPI.stop(browserAPI.activeTabId);
    }
  }, [browserAPI]);

  const handleRestoreSession = useCallback(async () => {
    await window.browserAPI.restoreSession();
    setShowRestorePopup(false);
  }, []);

  const handleCloseRestorePopup = useCallback(async () => {
    await window.browserAPI.discardSession();
    setShowRestorePopup(false);
  }, []);

  return (
    <div className="h-full w-full flex flex-col select-none">
      <div className="interactive-ui">
        <TabBar
          tabs={browserAPI.tabs}
          activeTabId={browserAPI.activeTabId}
          tabGroups={browserAPI.tabGroups}
          onTabClick={browserAPI.switchTab}
          onTabClose={browserAPI.closeTab}
          onNewTab={() => browserAPI.createTab()}
          onMoveTabLeft={browserAPI.moveActiveTabLeft}
          onMoveTabRight={browserAPI.moveActiveTabRight}
          onCreateGroup={browserAPI.createTabGroup}
          onUpdateGroup={browserAPI.updateTabGroup}
          onAssignGroup={browserAPI.assignTabToGroup}
          onRemoveTabGroup={browserAPI.removeTabGroup}
          onToggleGroupCollapse={browserAPI.toggleTabGroupCollapse}
        />

        <NavigationBar
          activeTab={browserAPI.activeTab}
          onNavigate={handleNavigate}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onStop={handleStop}
        />

        {showBookmarksBar && (
          <BookmarkBar onNavigate={handleNavigate} />
        )}
      </div>

      {showRestorePopup && (
        <RestoreSessionPopup
          onRestore={handleRestoreSession}
          onClose={handleCloseRestorePopup}
        />
      )}

      <div className="flex-1 overflow-hidden relative flex">
        <FindBar />
        {isSidebarVisible && (
          <div className="interactive-ui absolute top-0 right-0 bottom-0 w-[30%] min-w-[300px] max-w-[600px] pointer-events-auto">
            <Sidebar />
          </div>
        )}
      </div>
    </div>
  );
});
