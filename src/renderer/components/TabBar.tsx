import { X, Plus, Loader2, Globe } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
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
  onMoveTabLeft?: () => void;
  onMoveTabRight?: () => void;
}

const LAYOUT = {
  PADDING_LEFT: 80,
  PADDING_RIGHT: 8,
  NEW_TAB_BUTTON_SPACE: 40,
  MAX_TAB_WIDTH: 180,
  MIN_TAB_WIDTH: 60,
  GAP_NORMAL: 4,
  GAP_COMPACT: 2,
  COMPACT_THRESHOLD: 10,
} as const;

export function TabBar({ 
  tabs, 
  activeTabId, 
  onTabClick, 
  onTabClose, 
  onNewTab,
  onMoveTabLeft,
  onMoveTabRight,
}: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabWidth, setTabWidth] = useState<number>(LAYOUT.MAX_TAB_WIDTH);
  const [dragState, setDragState] = useState<{
    draggedTabId: string | null;
    dropIndex: number | null;
  }>({ draggedTabId: null, dropIndex: null });
  
  const rafRef = useRef<number | null>(null);
  const gap = tabs.length > LAYOUT.COMPACT_THRESHOLD ? LAYOUT.GAP_COMPACT : LAYOUT.GAP_NORMAL;

  const handleDoubleClick = () => {
    window.browserAPI.toggleMaximize();
  };

  const getDropIndex = useCallback((clientX: number): number | null => {
    if (!containerRef.current || !dragState.draggedTabId) return null;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const draggedIndex = tabs.findIndex(t => t.id === dragState.draggedTabId);
    
    if (draggedIndex === -1) return null;

    let dropIndex = 0;
    let currentX = LAYOUT.PADDING_LEFT;
    
    for (let i = 0; i < tabs.length; i++) {
      const tabCenter = currentX + tabWidth / 2;
      
      if (x < tabCenter) {
        dropIndex = i;
        break;
      }
      currentX += tabWidth + gap;
      dropIndex = i + 1;
    }

    dropIndex = Math.max(0, Math.min(dropIndex, tabs.length));
    
    if (dropIndex > draggedIndex) {
      dropIndex = dropIndex - 1;
    }
    
    if (dropIndex === draggedIndex) {
      return null;
    }
    
    return dropIndex;
  }, [dragState.draggedTabId, tabs, tabWidth, gap]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    rafRef.current = requestAnimationFrame(() => {
      const dropIndex = getDropIndex(e.clientX);
      setDragState(prev => ({ ...prev, dropIndex }));
    });
  }, [getDropIndex]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    const { draggedTabId, dropIndex } = dragState;
    
    if (!draggedTabId || dropIndex === null) {
      setDragState({ draggedTabId: null, dropIndex: null });
      return;
    }
    
    try {
      await window.browserAPI.reorderTab(draggedTabId, dropIndex);
    } catch (error) {
      console.error('[TabBar] Failed to reorder tab:', error);
    }
    
    setDragState({ draggedTabId: null, dropIndex: null });
  }, [dragState]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const { clientX, clientY } = e;
    const isOutside = clientX < rect.left || clientX > rect.right || 
                      clientY < rect.top || clientY > rect.bottom;
    
    if (isOutside) {
      setDragState(prev => ({ ...prev, dropIndex: null }));
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setDragState({ draggedTabId: null, dropIndex: null });
  }, []);

  const handleTabDragStart = useCallback((tabId: string) => {
    setDragState({ draggedTabId: tabId, dropIndex: null });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onMoveTabLeft?.();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onMoveTabRight?.();
      }
    }
  }, [onMoveTabLeft, onMoveTabRight]);

  useEffect(() => {
    const calculateTabWidth = () => {
      if (!containerRef.current) return;

      const tabCount = tabs.length;
      if (tabCount === 0) return;

      const containerWidth = containerRef.current.offsetWidth;
      const currentGap = tabCount > LAYOUT.COMPACT_THRESHOLD ? LAYOUT.GAP_COMPACT : LAYOUT.GAP_NORMAL;
      const gapSpace = (tabCount - 1) * currentGap;
      
      const availableSpace = containerWidth - LAYOUT.PADDING_LEFT - LAYOUT.PADDING_RIGHT - LAYOUT.NEW_TAB_BUTTON_SPACE - gapSpace;
      const calculatedWidth = Math.floor(availableSpace / tabCount);
      
      setTabWidth(Math.max(LAYOUT.MIN_TAB_WIDTH, Math.min(LAYOUT.MAX_TAB_WIDTH, calculatedWidth)));
    };

    calculateTabWidth();
    window.addEventListener('resize', calculateTabWidth);
    return () => window.removeEventListener('resize', calculateTabWidth);
  }, [tabs.length]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const getDropIndicatorPosition = (): { beforeIndex: number } | null => {
    const { draggedTabId, dropIndex } = dragState;
    if (!draggedTabId || dropIndex === null) return null;
    
    const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
    if (draggedIndex === -1) return null;
    
    if (dropIndex < draggedIndex) {
      return { beforeIndex: dropIndex };
    } else {
      return { beforeIndex: dropIndex + 1 };
    }
  };

  const dropIndicator = getDropIndicatorPosition();

  return (
    <div 
      ref={containerRef}
      className="flex items-center h-9 pl-20 pr-2 tab-bar-draggable overflow-hidden bg-background"
      style={{ gap: `${gap}px` }}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      onKeyDown={handleKeyDown}
      role="tablist"
      aria-label="Browser tabs"
    >
      {tabs.map((tab, index) => (
        <div key={tab.id} className="relative flex items-center">
          {dropIndicator?.beforeIndex === index && (
            <DropIndicator />
          )}
          
          <Tab
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => onTabClick(tab.id)}
            onClose={() => onTabClose(tab.id)}
            width={tabWidth}
            isDragging={dragState.draggedTabId === tab.id}
            onDragStart={() => handleTabDragStart(tab.id)}
            onDragEnd={handleDragEnd}
          />
        </div>
      ))}
      
      {dropIndicator?.beforeIndex === tabs.length && (
        <DropIndicator />
      )}

      <Button
        onClick={onNewTab}
        title="New Tab (Ctrl+T)"
        size='icon-sm'
        variant='outline'
        className="interactive"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

function DropIndicator() {
  return (
    <div 
      className="w-4 h-6 rounded-lg bg-gradient-to-b from-blue-400 to-blue-600 dark:from-blue-500 dark:to-blue-700 opacity-90 shadow-lg shadow-blue-500/30 animate-pulse flex-shrink-0"
      aria-hidden="true"
    />
  );
}

interface TabProps {
  tab: TabInfo;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  width: number;
  isDragging?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function Tab({ tab, isActive, onClick, onClose, width, isDragging, onDragStart, onDragEnd }: TabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tab.id);
    onDragStart();
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
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{ width: `${width}px` }}
      role="tab"
      aria-selected={isActive}
      aria-label={tab.title || 'New Tab'}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        'flex items-center gap-1.5 h-7 px-2.5 rounded-xl group tab-item flex-shrink-0',
        'transition-all duration-150',
        isDragging && 'opacity-40 scale-95',
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
        title="Close Tab (Ctrl+W)"
        aria-label={`Close ${tab.title || 'tab'}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
