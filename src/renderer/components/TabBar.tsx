import { X, Plus, Loader2, Globe } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import type { TabInfo } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';
import { Button } from '@/renderer/ui/button';
import { ICON_MAP } from '@/shared/routes';

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
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  const handleDoubleClick = () => {
    window.browserAPI.toggleMaximize();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!containerRef.current || draggedTabId === null) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const paddingLeft = 80;
    const gap = tabs.length > 10 ? 2 : 4;
    let currentX = paddingLeft;
    let targetIndex = 0;
    const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
    const lastTabEnd = paddingLeft + (tabs.length * (tabWidth + gap)) - gap;
    if (x > lastTabEnd) {
      targetIndex = tabs.length;
    } else {
      for (let i = 0; i < tabs.length; i++) {
        const tabStart = currentX;
        const tabEnd = currentX + tabWidth;
        const tabMid = (tabStart + tabEnd) / 2;
        
        if (x >= tabStart && x < tabEnd) {
          targetIndex = x < tabMid ? i : i + 1;
          break;
        }
        currentX = tabEnd + gap;
        targetIndex = i + 1;
      }
      targetIndex = Math.max(0, Math.min(targetIndex, tabs.length));
    }
    
    if (targetIndex === draggedIndex || (targetIndex === draggedIndex + 1 && draggedIndex < tabs.length - 1)) {
      setDragOverIndex(null);
    } else {
      setDragOverIndex(targetIndex);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    
    const droppedTabId = e.dataTransfer.getData('text/plain');
    if (!droppedTabId) return;
    
    const currentIndex = tabs.findIndex(t => t.id === droppedTabId);
    if (currentIndex === -1) return;
    
    let newIndex = dragOverIndex !== null ? dragOverIndex : currentIndex;
    
    if (newIndex === currentIndex || (newIndex === currentIndex + 1 && currentIndex < tabs.length - 1)) {
      setDraggedTabId(null);
      setDragOverIndex(null);
      return;
    }
    
    newIndex = Math.max(0, Math.min(newIndex, tabs.length));
    
    const apiIndex = newIndex === tabs.length ? tabs.length - 1 : newIndex;
    
    await window.browserAPI.reorderTab(droppedTabId, apiIndex);
    
    setDraggedTabId(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
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
      className="flex items-center h-9 pl-20 pr-2 gap-1 tab-bar-draggable overflow-hidden bg-background"
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      {/* Tabs */}
      {tabs.map((tab, index) => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onClick={() => onTabClick(tab.id)}
          onClose={() => onTabClose(tab.id)}
          width={tabWidth}
          isDragging={draggedTabId === tab.id}
          isDragOver={dragOverIndex === index}
          onDragStart={() => setDraggedTabId(tab.id)}
          onDragEnd={() => {
            setDraggedTabId(null);
            setDragOverIndex(null);
          }}
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
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function Tab({ tab, isActive, onClick, onClose, width, isDragging, isDragOver, onDragStart, onDragEnd }: TabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.id);
    onDragStart();
  };

  const handleDragEnd = () => {
    onDragEnd();
  };

  const renderIcon = () => {
    if (tab.isLoading) {
      return <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-muted-foreground" />;
    }
    
    if (tab.favicon) {
      if(ICON_MAP[tab.favicon]){
        const IconComponent = ICON_MAP[tab.favicon];
        return <IconComponent className="w-4 h-4 flex-shrink-0" />;
      }
      return <img src={tab.favicon} alt="" className="w-4 h-4 flex-shrink-0 rounded-sm" />;
    }
    
    return <Globe className="w-4 h-4 flex-shrink-0 text-muted-foreground" />;
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      style={{ width: `${width}px` }}
      className={cn(
        'flex items-center gap-1.5 h-7 px-2.5 rounded-xl cursor-grab group tab-item flex-shrink-0',
        'transition-all duration-150',
        isDragging && 'opacity-50 cursor-grabbing',
        isDragOver && 'ring-2 ring-primary ring-offset-1',
        isActive
          ? 'dark:bg-slate-900 bg-slate-50'
          : 'bg-slate-300 dark:bg-slate-600 dark:hover:bg-[#2a2a2a]'
      )}
    >
      {renderIcon()}

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