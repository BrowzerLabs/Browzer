import { X, Plus, Loader2, Globe } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import type { TabGroup, TabInfo } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';
import { Button } from '@/renderer/ui/button';
import { GROUP_COLORS, LAYOUT } from '@/shared/constants/tabs';
import { ICON_MAP } from '@/shared/routes';
import { useBrowserViewLayer } from '@/renderer/hooks/useBrowserViewLayer';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/renderer/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/ui/dialog';
import { Input } from '@/renderer/ui/input';

interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string | null;
  tabGroups: TabGroup[];
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onMoveTabLeft?: () => void;
  onMoveTabRight?: () => void;
  onCreateGroup?: (name?: string, color?: string) => Promise<TabGroup>;
  onUpdateGroup?: (groupId: string, name?: string, color?: string) => Promise<boolean>;
  onAssignGroup?: (tabId: string, groupId: string | null) => Promise<boolean>;
  onRemoveTabGroup?: (groupId: string) => Promise<boolean>;
  onToggleGroupCollapse?: (groupId: string) => Promise<boolean>;
}

export function TabBar({ 
  tabs, 
  activeTabId, 
  tabGroups,
  onTabClick, 
  onTabClose, 
  onNewTab,
  onMoveTabLeft,
  onMoveTabRight,
  onCreateGroup,
  onUpdateGroup,
  onAssignGroup,
  onRemoveTabGroup,
  onToggleGroupCollapse,
}: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabWidth, setTabWidth] = useState<number>(LAYOUT.MAX_TAB_WIDTH);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localTabs, setLocalTabs] = useState(tabs);
  
  const visibleTabs = localTabs.filter((tab) => {
    if (!tab.group) return true;
    if (!tab.group.collapsed) return true;
    if (tab.id === activeTabId) return true;
    
    const activeTabInGroup = localTabs.find(t => t.group?.id === tab.group?.id && t.id === activeTabId);
    if (activeTabInGroup) return false;
    
    const firstGroupIndex = localTabs.findIndex(t => t.group?.id === tab.group?.id);
    return localTabs[firstGroupIndex].id === tab.id;
  });

  // Calculate group labels separately - find first visible tab for each group
  const groupLabels = new Map<string, { group: TabGroup; firstTabId: string }>();
  visibleTabs.forEach((tab) => {
    if (tab.group && !groupLabels.has(tab.group.id)) {
      groupLabels.set(tab.group.id, { group: tab.group, firstTabId: tab.id });
    }
  });

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [pendingGroupTabId, setPendingGroupTabId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<string>(GROUP_COLORS[0]);
  const { createOverlayHandler } = useBrowserViewLayer();

  const handleMenuOpenChange = createOverlayHandler('tab-menu');
  const handleGroupDialogChange = createOverlayHandler('tab-group-dialog');

  const handleGroupDialogOpenChange = useCallback((open: boolean) => {
    setIsGroupDialogOpen(open);
    handleGroupDialogChange(open);
    if (!open) {
      setPendingGroupTabId(null);
      setEditingGroupId(null);
      setNewGroupName('');
    }
  }, [handleGroupDialogChange]);

  const startCreateGroup = useCallback((tabId: string) => {
    setPendingGroupTabId(tabId);
    setNewGroupName('');
    const nextColor = GROUP_COLORS[(tabGroups.length) % GROUP_COLORS.length];
    setNewGroupColor(nextColor);
    handleGroupDialogOpenChange(true);
  }, [tabGroups.length, handleGroupDialogOpenChange]);

  const startEditGroup = useCallback((group: TabGroup) => {
    setEditingGroupId(group.id);
    setNewGroupName(group.name);
    setNewGroupColor(group.color);
    handleGroupDialogOpenChange(true);
  }, [handleGroupDialogOpenChange]);

  const handleCreateGroupSubmit = useCallback(async () => {
    try {
      if (editingGroupId && onUpdateGroup) {
        await onUpdateGroup(editingGroupId, newGroupName.trim() || undefined, newGroupColor);
      } else if (onCreateGroup) {
        const group = await onCreateGroup(newGroupName.trim() || undefined, newGroupColor);
        if (group && pendingGroupTabId) {
          await onAssignGroup?.(pendingGroupTabId, group.id);
        }
      }
    } catch (error) {
      console.error('[TabBar] Failed to save group:', error);
    } finally {
      handleGroupDialogOpenChange(false);
    }
  }, [newGroupColor, newGroupName, onAssignGroup, onCreateGroup, onUpdateGroup, editingGroupId, pendingGroupTabId, handleGroupDialogOpenChange]);
  
  useEffect(() => {
    setLocalTabs(tabs);
  }, [tabs]);

  useEffect(() => {
    const initFullScreenState = async () => {
      try {
        const fullScreen = await window.browserAPI.isFullScreen?.();
        if (typeof fullScreen === 'boolean') {
          setIsFullScreen(fullScreen);
        }
      } catch (error) {
        console.error('[TabBar] Failed to get fullscreen state', error);
      }
    };

    const unsubscribe =
      window.browserAPI.onFullScreenChanged?.((full: boolean) => {
        setIsFullScreen(full);
      }) ?? (() => {});

    initFullScreenState();

    return () => unsubscribe();
  }, []);
  
  const gap = visibleTabs.length > LAYOUT.COMPACT_THRESHOLD ? LAYOUT.GAP_COMPACT : LAYOUT.GAP_NORMAL;

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

    const realOldIndex = localTabs.findIndex(t => t.id === active.id);
    const realNewIndex = localTabs.findIndex(t => t.id === over.id);
    
    if (realOldIndex === -1 || realNewIndex === -1 || realOldIndex === realNewIndex) return;
    
    setLocalTabs(prev => arrayMove(prev, realOldIndex, realNewIndex));
    
    try {
      await window.browserAPI.reorderTab(active.id as string, realNewIndex);
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

      const tabCount = visibleTabs.length;
      if (tabCount === 0) return;

      const containerWidth = containerRef.current.offsetWidth;
      const currentGap = tabCount > LAYOUT.COMPACT_THRESHOLD ? LAYOUT.GAP_COMPACT : LAYOUT.GAP_NORMAL;
      const gapSpace = (tabCount - 1) * currentGap;
      const paddingLeft = isFullScreen ? 2 : LAYOUT.PADDING_LEFT;
      
      const availableSpace = containerWidth - paddingLeft - LAYOUT.PADDING_RIGHT - LAYOUT.NEW_TAB_BUTTON_SPACE - gapSpace;
      const calculatedWidth = Math.floor(availableSpace / tabCount);
      
      setTabWidth(Math.max(LAYOUT.MIN_TAB_WIDTH, Math.min(LAYOUT.MAX_TAB_WIDTH, calculatedWidth)));
    };

    calculateTabWidth();
    window.addEventListener('resize', calculateTabWidth);
    return () => window.removeEventListener('resize', calculateTabWidth);
  }, [visibleTabs.length, isFullScreen]);

  const activeTab = activeId ? localTabs.find(t => t.id === activeId) : null;

  return (
    <>
      <div 
        ref={containerRef}
        className={cn(
          'flex items-center h-9 pr-2 tab-bar-draggable overflow-hidden bg-background',
          isFullScreen ? 'pl-2' : 'pl-20'
        )}
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
          <SortableContext items={visibleTabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
            {visibleTabs.flatMap((tab, index) => {
              const prevTab = index > 0 ? visibleTabs[index - 1] : null;
              const isGroupStart = tab.group && (!prevTab || prevTab.group?.id !== tab.group.id);
              const groupLabelInfo = isGroupStart && tab.group ? groupLabels.get(tab.group.id) : null;
              // Only show group label if this tab is actually the first tab of this group
              const shouldShowGroupLabel = groupLabelInfo && groupLabelInfo.firstTabId === tab.id;
              
              return [
                shouldShowGroupLabel && (
                  <GroupLabel
                    key={`group-label-${groupLabelInfo.group.id}`}
                    group={groupLabelInfo.group}
                    isCollapsed={tab.group?.collapsed && tab.id !== activeTabId}
                    onToggleCollapse={() => tab.group?.id ? onToggleGroupCollapse?.(tab.group.id) : undefined}
                    onEditGroup={() => tab.group ? startEditGroup(tab.group) : undefined}
                    onDeleteGroup={() => tab.group?.id ? onRemoveTabGroup?.(tab.group.id) : undefined}
                    onMenuOpenChange={(open) => handleMenuOpenChange(open)}
                  />
                ),
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  isDragging={tab.id === activeId}
                  onClick={() => onTabClick(tab.id)}
                  onClose={() => onTabClose(tab.id)}
                  width={tabWidth}
                  tabGroups={tabGroups}
                  isGroupCollapsed={tab.group?.collapsed && tab.id !== activeTabId}
                  isAnyDragging={activeId !== null}
                  onAssignGroup={(groupId) => onAssignGroup?.(tab.id, groupId)}
                  onCreateGroupRequested={() => startCreateGroup(tab.id)}
                  onEditGroupRequested={() => tab.group ? startEditGroup(tab.group) : undefined}
                  onMenuOpenChange={(open) => handleMenuOpenChange(open)}
                  onRemoveGroup={() => onAssignGroup?.(tab.id, null)}
                  onDeleteGroup={() => tab.group?.id ? onRemoveTabGroup?.(tab.group.id) : undefined}
                  onToggleCollapse={() => tab.group?.id ? onToggleGroupCollapse?.(tab.group.id) : undefined}
                />
              ].filter(Boolean);
            })}
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

      <Dialog open={isGroupDialogOpen} onOpenChange={handleGroupDialogOpenChange}>
        <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editingGroupId ? 'Edit group' : 'New group'}</DialogTitle>
            <DialogDescription className="text-sm">
              {editingGroupId ? 'Update the label and color for this group.' : 'Create a clean label and color, then assign it to the tab.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Name</label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Work, Research..."
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">Color</span>
              <div className="flex gap-2">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewGroupColor(color)}
                    className={cn(
                      'h-7 w-7 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-offset-1',
                      newGroupColor === color
                        ? 'ring-2 ring-offset-2 ring-blue-500 border-transparent'
                        : 'border-border'
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Select ${color} color`}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => handleGroupDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGroupSubmit}>
              {editingGroupId ? 'Save Changes' : 'Create & Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SortableTabProps {
  tab: TabInfo;
  isActive: boolean;
  isDragging: boolean;
  onClick: () => void;
  onClose: () => void;
  width: number;
  tabGroups: TabGroup[];
  onAssignGroup?: (groupId: string | null) => void;
  onCreateGroupRequested?: () => void;
  onEditGroupRequested?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  onRemoveGroup?: () => void;
  onDeleteGroup?: () => void;
  onToggleCollapse?: () => void;
  isGroupCollapsed?: boolean;
  isAnyDragging?: boolean;
}

interface GroupLabelProps {
  group: TabGroup;
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  onEditGroup?: () => void;
  onDeleteGroup?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}

function GroupLabel({ group, isCollapsed, onToggleCollapse, onEditGroup, onDeleteGroup, onMenuOpenChange }: GroupLabelProps) {
  const groupContextMenu = (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onSelect={() => onToggleCollapse?.()}>
        {isCollapsed ? 'Expand group' : 'Collapse group'}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onEditGroup?.()}>
        Edit group name
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onDeleteGroup?.()}>
        Delete group
      </ContextMenuItem>
    </ContextMenuContent>
  );

  return (
    <motion.div
      key={`group-label-${group.id}`}
      layout="position"
      initial={false}
      transition={{
        layout: { duration: 0.2, ease: "easeInOut" }
      }}
    >
      <ContextMenu onOpenChange={onMenuOpenChange}>
        <ContextMenuTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.();
            }}
            className={cn(
              "flex items-center px-2 h-7 rounded-sm mr-0.5 whitespace-nowrap text-xs font-medium text-white shadow-sm transition-opacity hover:opacity-90",
              "interactive focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
            )}
            style={{ backgroundColor: group.color }}
            title={isCollapsed ? "Expand group" : "Collapse group"}
          >
            {group.name}
          </button>
        </ContextMenuTrigger>
        {groupContextMenu}
      </ContextMenu>
    </motion.div>
  );
}

function SortableTab({ tab, isActive, isDragging, onClick, onClose, width, tabGroups, onAssignGroup, onCreateGroupRequested, onEditGroupRequested, onMenuOpenChange, onRemoveGroup, onDeleteGroup, onToggleCollapse, isGroupCollapsed, isAnyDragging }: SortableTabProps) {
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
    width: isGroupCollapsed ? 'auto' : `${width}px`,
  };

  const tabContextMenu = (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onSelect={() => onCreateGroupRequested?.()}>
        Create new group
      </ContextMenuItem>

      <ContextMenuSub>
        <ContextMenuSubTrigger className="gap-2">
          Assign group
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-48">
          {tabGroups.length === 0 && (
            <ContextMenuItem disabled>No groups yet</ContextMenuItem>
          )}
          {tabGroups.map((group) => (
            <ContextMenuItem
              key={group.id}
              className="gap-2"
              onSelect={() => onAssignGroup?.(group.id)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shadow-sm"
                style={{ backgroundColor: group.color }}
              />
              <span className="text-xs">{group.name}</span>
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!tab.group}
            onSelect={() => onRemoveGroup?.()}
          >
            Remove from group
          </ContextMenuItem>
          {tab.group && (
            <ContextMenuItem
              variant="destructive"
              onSelect={() => onDeleteGroup?.()}
            >
              Delete group
            </ContextMenuItem>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>

      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onSelect={() => {
          onClose();
        }}
      >
        Close tab
      </ContextMenuItem>
    </ContextMenuContent>
  );

  return (
    <motion.div 
      className="flex items-center gap-0.5"
      layout={!isAnyDragging ? "position" : false}
      transition={{
        layout: { duration: 0.2, ease: "easeInOut" }
      }}
    >
      {!isGroupCollapsed && (
        <ContextMenu onOpenChange={onMenuOpenChange}>
          <ContextMenuTrigger asChild>
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
                'relative flex items-center gap-1.5 h-7 px-2.5 rounded-xl group tab-item flex-shrink-0',
                'transition-colors duration-150',
                isDragging && 'opacity-40',
                isActive
                  ? 'dark:bg-slate-900 bg-slate-50'
                  : 'bg-slate-300 dark:bg-slate-600 dark:hover:bg-[#2a2a2a]'
              )}
            >
              {/* Colored border for grouped tabs */}
              {tab.group && (
                <div 
                  className="absolute inset-0 rounded-xl pointer-events-none"
                  style={{ 
                    border: `2px solid ${tab.group.color}`,
                  }}
                />
              )}
              
              <TabIcon tab={tab} />
              
              {width > 100 && (
                <span className="flex-1 truncate text-sm min-w-0 z-10">
                  {tab.isLoading ? <span className="text-gray-500">Loading...</span> : tab.title || 'New Tab'}
                </span>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="flex items-center justify-center size-5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 z-10"
                title="Close Tab (Ctrl+W)"
                aria-label={`Close ${tab.title || 'tab'}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </ContextMenuTrigger>
          {tabContextMenu}
        </ContextMenu>
      )}
    </motion.div>
  );
}

interface TabContentProps {
  tab: TabInfo;
  isActive: boolean;
  width: number;
  isOverlay?: boolean;
}

function TabContent({ tab, isActive, width, isOverlay }: TabContentProps) {
  const style = {
    width: `${width}px`,
    boxShadow: tab.group ? `inset 0 0 0 1.5px ${tab.group.color}` : undefined,
    backgroundColor: tab.group ? `${tab.group.color}15` : undefined,
  };

  return (
    <div
      style={style}
      className={cn(
        'relative flex items-center gap-1.5 h-7 px-2.5 rounded-xl group tab-item flex-shrink-0',
        isOverlay && 'shadow-lg scale-105',
        isActive
          ? 'dark:bg-slate-900 bg-slate-50'
          : 'bg-slate-300 dark:bg-slate-600'
      )}
    >
      {tab.group?.color && <GroupBadge color={tab.group.color} />}
      <TabIcon tab={tab} />
      {tab.group && (
        <span
          className="px-2 py-[3px] text-[10px] font-medium rounded-full border"
          style={{
            borderColor: tab.group.color,
            backgroundColor: `${tab.group.color}22`,
            color: tab.group.color,
          }}
        >
          {tab.group.name}
        </span>
      )}
      
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

function GroupBadge({ color }: { color: string }) {
  return (
    <span
      className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full shadow-sm ring-1 ring-black/5"
      style={{ backgroundColor: color }}
      aria-hidden
    />
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
