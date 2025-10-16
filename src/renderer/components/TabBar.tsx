import { X, Plus, Loader2 } from 'lucide-react';
import type { TabInfo } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';
import { Button } from '@/renderer/ui/button';

interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onNewTab }: TabBarProps) {
  const handleDoubleClick = () => {
    window.browserAPI.toggleMaximize();
  };

  return (
    <div 
      className="flex items-center h-10 pl-20 pr-2 gap-1 tab-bar-draggable"
      onDoubleClick={handleDoubleClick}
    >
      {/* Tabs */}
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onClick={() => onTabClick(tab.id)}
          onClose={() => onTabClose(tab.id)}
        />
      ))}

      {/* New Tab Button */}
      <Button
        onClick={onNewTab}
        title="New Tab"
        size='icon-sm'
        variant='outline'
        className="interactive"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface TabProps {
  tab: TabInfo;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
}

function Tab({ tab, isActive, onClick, onClose }: TabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 h-8 px-3 rounded-xl min-w-[160px] max-w-[200px] cursor-pointer group tab-item',
        'transition-colors',
        isActive
          ? 'bg-slate-800 text-white'
          : 'bg-slate-600 text-gray-400 hover:bg-[#2a2a2a]'
      )}
    >
      {/* Favicon */}
      {tab.favicon ? (
        <img src={tab.favicon} alt="" className="w-4 h-4 flex-shrink-0" />
      ) : (
        <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
      )}

      {/* Title */}
      <span className="flex-1 truncate text-sm">
        {tab.isLoading ? 'Loading...' : tab.title || 'New Tab'}
      </span>

      {/* Close Button */}
      <button
        onClick={handleClose}
        className={cn(
          'flex items-center justify-center w-5 h-5 rounded-full hover:bg-[#3a3a3a] transition-colors interactive',
          'opacity-0 group-hover:opacity-100',
          isActive && 'opacity-100'
        )}
        title="Close Tab"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
