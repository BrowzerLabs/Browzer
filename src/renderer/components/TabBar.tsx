import { X, Plus, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabWidth, setTabWidth] = useState(200);
  
  const handleDoubleClick = () => {
    window.browserAPI.toggleMaximize();
  };

  useEffect(() => {
    const calculateTabWidth = () => {
      if (!containerRef.current) return;

      const tabCount = tabs.length;
      if (tabCount === 0) return;

      const maxWidth = 180; 
      const minWidth = 60; 
      
      const containerWidth = containerRef.current.offsetWidth;
      const paddingLeft = 80; 
      const paddingRight = 8;
      const newTabButtonSpace = 40;
      const gap = tabCount > 10 ? 2 : 4;
      const gapSpace = (tabCount - 1) * gap;
      
      const availableSpace = containerWidth - paddingLeft - paddingRight - newTabButtonSpace - gapSpace;
      const calculatedWidth = Math.floor(availableSpace / tabCount);
      
      const finalWidth = Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
      setTabWidth(finalWidth);
    };

    calculateTabWidth();

    window.addEventListener('resize', calculateTabWidth);
    return () => window.removeEventListener('resize', calculateTabWidth);
  }, [tabs.length]);

  return (
    <div 
      ref={containerRef}
      className="flex items-center h-10 pl-20 pr-2 gap-1 tab-bar-draggable overflow-hidden"
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
          width={tabWidth}
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
  width: number;
}

function Tab({ tab, isActive, onClick, onClose, width }: TabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      onClick={onClick}
      style={{ width: `${width}px` }}
      className={cn(
        'flex items-center gap-1.5 h-8 px-2.5 rounded-xl cursor-pointer group tab-item flex-shrink-0',
        'transition-all duration-150',
        isActive
          ? 'dark:bg-slate-900 bg-slate-50'
          : 'bg-slate-300 dark:bg-slate-600 dark:hover:bg-[#2a2a2a]'
      )}
    >
      {/* Favicon */}
      {tab.favicon ? (
        <img src={tab.favicon} alt="" className="w-4 h-4 flex-shrink-0" />
      ) : (
        <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
      )}

      {width > 100 && (
        <span className="flex-1 truncate text-sm min-w-0">
          {tab.isLoading ? <span className="text-gray-500">Loading...</span> : tab.title || 'New Tab'}
        </span>
      )}

      <button
        onClick={handleClose}
        className={cn(
          'flex items-center justify-center size-5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600',
        )}
        title="Close Tab"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}