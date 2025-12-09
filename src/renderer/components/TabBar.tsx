import { X, Plus, Loader2, Globe } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localTabs, setLocalTabs] = useState(tabs);
  
  useEffect(() => {
    setLocalTabs(tabs);
  }, [tabs]);
  
  const gap = localTabs.length > LAYOUT.COMPACT_THRESHOLD ? LAYOUT.GAP_COMPACT : LAYOUT.GAP_NORMAL;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDoubleClick = () => {
    window.browserAPI.toggleMaximize();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (!over || active.id === over.id) return;
    
    const oldIndex = localTabs.findIndex(t => t.id === active.id);
    const newIndex = localTabs.findIndex(t => t.id === over.id);
    
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    
    setLocalTabs(prev => arrayMove(prev, oldIndex, newIndex));
    
    try {
      await window.browserAPI.reorderTab(active.id as string, newIndex);
    } catch (error) {
      console.error('[TabBar] Failed to reorder tab:', error);
      setLocalTabs(tabs);
    }
  };

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

      const tabCount = localTabs.length;
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
  }, [localTabs.length]);

  const activeTab = activeId ? localTabs.find(t => t.id === activeId) : null;

  return (
    <div 
      ref={containerRef}
      className="flex items-center h-9 pl-20 pr-2 tab-bar-draggable overflow-hidden bg-background"
      style={{ gap: `${gap}px` }}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      role="tablist"
      aria-label="Browser tabs"
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={localTabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
          {localTabs.map((tab) => (
            <SortableTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              isDragging={tab.id === activeId}
              onClick={() => onTabClick(tab.id)}
              onClose={() => onTabClose(tab.id)}
              width={tabWidth}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeTab ? (
            <TabContent
              tab={activeTab}
              isActive={activeTab.id === activeTabId}
              width={tabWidth}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

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

interface SortableTabProps {
  tab: TabInfo;
  isActive: boolean;
  isDragging: boolean;
  onClick: () => void;
  onClose: () => void;
  width: number;
}

function SortableTab({ tab, isActive, isDragging, onClick, onClose, width }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: `${width}px`,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        'flex items-center gap-1.5 h-7 px-2.5 rounded-xl group tab-item flex-shrink-0',
        'transition-colors duration-150',
        isDragging && 'opacity-40',
        isActive
          ? 'dark:bg-slate-900 bg-slate-50'
          : 'bg-slate-300 dark:bg-slate-600 dark:hover:bg-[#2a2a2a]'
      )}
    >
      <TabIcon tab={tab} />
      
      {width > 100 && (
        <span className="flex-1 truncate text-sm min-w-0">
          {tab.isLoading ? <span className="text-gray-500">Loading...</span> : tab.title || 'New Tab'}
        </span>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex items-center justify-center size-5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600"
        title="Close Tab (Ctrl+W)"
        aria-label={`Close ${tab.title || 'tab'}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

interface TabContentProps {
  tab: TabInfo;
  isActive: boolean;
  width: number;
  isOverlay?: boolean;
}

function TabContent({ tab, isActive, width, isOverlay }: TabContentProps) {
  return (
    <div
      style={{ width: `${width}px` }}
      className={cn(
        'flex items-center gap-1.5 h-7 px-2.5 rounded-xl group tab-item flex-shrink-0',
        isOverlay && 'shadow-lg scale-105',
        isActive
          ? 'dark:bg-slate-900 bg-slate-50'
          : 'bg-slate-300 dark:bg-slate-600'
      )}
    >
      <TabIcon tab={tab} />
      
      {width > 100 && (
        <span className="flex-1 truncate text-sm min-w-0">
          {tab.isLoading ? <span className="text-gray-500">Loading...</span> : tab.title || 'New Tab'}
        </span>
      )}

      <div className="flex items-center justify-center size-5 rounded-full">
        <X className="w-3 h-3" />
      </div>
    </div>
  );
}

function TabIcon({ tab }: { tab: TabInfo }) {
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
}
