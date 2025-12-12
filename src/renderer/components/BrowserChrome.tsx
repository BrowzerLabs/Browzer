import { useEffect, useState } from 'react';
import { useBrowserAPI } from '@/renderer/hooks/useBrowserAPI';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import { TabBar } from './TabBar';
import { NavigationBar } from './NavigationBar';
import { BookmarkBar } from './BookmarkBar';
import { Sidebar } from './Sidebar';

export function BrowserChrome() {
  const browserAPI = useBrowserAPI();
  const { isVisible: isSidebarVisible, showSidebar } = useSidebarStore();
  const [showBookmarksBar, setShowBookmarksBar] = useState(false);

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

  return (
    <div className="h-full w-full flex flex-col select-none">
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
        onNavigate={(url) => {
          if (browserAPI.activeTabId) {
            browserAPI.navigate(browserAPI.activeTabId, url);
          }
        }}
        onBack={() => {
          if (browserAPI.activeTabId) {
            browserAPI.goBack(browserAPI.activeTabId);
          }
        }}
        onForward={() => {
          if (browserAPI.activeTabId) {
            browserAPI.goForward(browserAPI.activeTabId);
          }
        }}
        onReload={() => {
          if (browserAPI.activeTabId) {
            browserAPI.reload(browserAPI.activeTabId);
          }
        }}
        onStop={() => {
          if (browserAPI.activeTabId) {
            browserAPI.stop(browserAPI.activeTabId);
          }
        }}
      />

      {showBookmarksBar && (
        <BookmarkBar onNavigate={(url) => {browserAPI.createTab(url)}} />
      )}

      <div className="flex-1 overflow-hidden relative flex">
        {isSidebarVisible && (
          <div className="absolute top-0 right-0 bottom-0 w-[30%] min-w-[300px] max-w-[600px] pointer-events-auto">
            <Sidebar />
          </div>
        )}
      </div>
    </div>
  );
}
