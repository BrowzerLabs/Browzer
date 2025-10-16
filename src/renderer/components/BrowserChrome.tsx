import { useEffect } from 'react';
import { useBrowserAPI } from '@/renderer/hooks/useBrowserAPI';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import { TabBar } from './TabBar';
import { NavigationBar } from './NavigationBar';
import { Sidebar } from './Sidebar';

/**
 * BrowserChrome - Main browser UI (tabs + navigation + resizable content)
 * 
 * This is the "Agent UI" WebContentsView that contains all browser controls
 * and manages the layout between web content and the agent sidebar
 */
export function BrowserChrome() {
  const browserAPI = useBrowserAPI();
  const { isVisible: isSidebarVisible, showSidebar } = useSidebarStore();

  // Auto-open sidebar when recording starts
  useEffect(() => {
    const unsubStart = window.browserAPI.onRecordingStarted(() => {
      showSidebar();
    });
    
    return () => unsubStart();
  }, [showSidebar]);

  return (
    <div className="h-full w-full flex flex-col select-none">
      {/* Tab Bar */}
      <TabBar
        tabs={browserAPI.tabs}
        activeTabId={browserAPI.activeTabId}
        onTabClick={browserAPI.switchTab}
        onTabClose={browserAPI.closeTab}
        onNewTab={() => browserAPI.createTab()}
      />

      {/* Navigation Bar */}
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

      {/* Content Area: Web Content + Sidebar */}
      <div className="flex-1 overflow-hidden relative flex">
        {/* Web Content Area - Transparent (shows WebContentsView below) */}
        <div className="flex-1 pointer-events-none" />
        
        {/* Sidebar - Positioned on the right */}
        {isSidebarVisible && (
          <div className="absolute top-0 right-0 bottom-0 w-[30%] min-w-[300px] max-w-[600px] pointer-events-auto h-full overflow-y-auto">
            <Sidebar />
          </div>
        )}
      </div>
    </div>
  );
}
