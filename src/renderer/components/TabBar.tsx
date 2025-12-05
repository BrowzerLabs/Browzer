import { X, Plus, Loader2, Globe, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import type { TabInfo, TabGroup } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';
import { Button } from '@/renderer/ui/button';
import { ICON_MAP } from '@/shared/routes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/renderer/ui/dialog';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';

const GROUP_COLORS = ['#4285F4', '#DB4437', '#F4B400', '#0F9D58', '#AB47BC', '#00ACC1', '#FF7043', '#5C6BC0'];

interface TabBarProps {
  tabs: TabInfo[];
  groups: TabGroup[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onCreateGroup: (name: string, color: string, tabId?: string) => void;
  onAssignGroup: (tabId: string, groupId: string) => void;
  onRemoveFromGroup: (tabId: string) => void;
  onToggleGroup: (groupId: string) => void;
}

export function TabBar({
  tabs,
  groups,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  onCreateGroup,
  onAssignGroup,
  onRemoveFromGroup,
  onToggleGroup,
}: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tabWidth, setTabWidth] = useState(200);
  const [openMenuTabId, setOpenMenuTabId] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [targetTabForGroup, setTargetTabForGroup] = useState<string | null>(null);

  const groupsMap = useMemo(() => new Map(groups.map(group => [group.id, group])), [groups]);
  const visibleTabCount = useMemo(
    () =>
      tabs.reduce((count, tab) => {
        const group = tab.groupId ? groupsMap.get(tab.groupId) : null;
        if (group?.collapsed && tab.id !== activeTabId) return count;
        return count + 1;
      }, 0),
    [tabs, groupsMap, activeTabId]
  );

  const handleDoubleClick = () => {
    window.browserAPI.toggleMaximize();
  };

  useEffect(() => {
    const overlayOpen = !!openMenuTabId || newGroupOpen;
    if (overlayOpen) {
      window.browserAPI.bringBrowserViewToFront();
    } else {
      window.browserAPI.bringBrowserViewToBottom();
    }

    return () => {
      window.browserAPI.bringBrowserViewToBottom();
    };
  }, [openMenuTabId, newGroupOpen]);

  useEffect(() => {
    const calculateTabWidth = () => {
      if (!containerRef.current) return;

      const tabCount = visibleTabCount;
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
  }, [visibleTabCount]);

  const openCreateGroupDialog = (tabId?: string) => {
    // Move BrowserView behind the UI before opening the dialog so it's not obscured
    window.browserAPI.bringBrowserViewToBottom();
    setTargetTabForGroup(tabId ?? null);
    setNewGroupName('');
    setNewGroupColor(GROUP_COLORS[0]);
    setNewGroupOpen(true);
    setOpenMenuTabId(null);
  };

  const handleCreateGroup = () => {
    const name = newGroupName.trim() || `Group ${groups.length + 1}`;
    onCreateGroup(name, newGroupColor, targetTabForGroup || undefined);
    setNewGroupOpen(false);
  };

  const handleAssignGroup = (tabId: string, groupId: string) => {
    setOpenMenuTabId(null);
    onAssignGroup(tabId, groupId);
  };

  const handleRemoveFromGroup = (tabId: string) => {
    setOpenMenuTabId(null);
    onRemoveFromGroup(tabId);
  };

  const handleToggleGroup = (groupId: string) => {
    setOpenMenuTabId(null);
    onToggleGroup(groupId);
  };

  const renderedGroupIds = new Set<string>();

  return (
    <>
      <div 
        ref={containerRef}
        className="flex items-center h-9 pl-20 pr-2 gap-1 tab-bar-draggable overflow-hidden bg-background"
        onDoubleClick={handleDoubleClick}
      >
        {/* Tabs with groups */}
        {tabs.map((tab) => {
          const group = tab.groupId ? groupsMap.get(tab.groupId) : undefined;
          const isCollapsed = group?.collapsed && tab.id !== activeTabId;
          const alreadyRenderedGroup = group ? renderedGroupIds.has(group.id) : false;
          if (group) {
            renderedGroupIds.add(group.id);
          }

          const tabNode = (
            <DropdownMenu
              key={tab.id}
              open={openMenuTabId === tab.id}
              onOpenChange={(open) => {
                // Only allow closing via Radix events; opening is driven by right-click
                if (!open) {
                  setOpenMenuTabId(null);
                }
              }}
            >
            <DropdownMenuTrigger
              asChild
              onClick={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
            >
              <div
                onContextMenu={(e) => {
                  e.preventDefault();
                  setOpenMenuTabId(tab.id);
                }}
              >
                  <Tab
                    tab={tab}
                    groupColor={group?.color}
                    isActive={tab.id === activeTabId}
                    onClick={() => onTabClick(tab.id)}
                    onClose={() => onTabClose(tab.id)}
                    width={tabWidth}
                  />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="bottom">
                <DropdownMenuItem onClick={() => openCreateGroupDialog(tab.id)}>
                  New group...
                </DropdownMenuItem>
                {groups.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Add to group
                    </DropdownMenuLabel>
                    {groups.map((g) => (
                      <DropdownMenuItem
                        key={g.id}
                        onClick={() => handleAssignGroup(tab.id, g.id)}
                        className="flex items-center gap-2"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="truncate">{g.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}

                {tab.groupId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleRemoveFromGroup(tab.id)}>
                      Remove from group
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggleGroup(tab.groupId!)}>
                      {group?.collapsed ? 'Expand group' : 'Collapse group'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );

          return (
            <div key={`wrapper-${tab.id}`} className="flex items-center gap-1">
              {group && !alreadyRenderedGroup && (
                <TabGroupChip
                  key={`group-${group.id}`}
                  group={group}
                  onToggle={() => handleToggleGroup(group.id)}
                />
              )}
              {!isCollapsed && tabNode}
            </div>
          );
        })}

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

      <Dialog
        open={newGroupOpen}
        onOpenChange={(next) => {
          setNewGroupOpen(next);
          if (!next) {
            window.browserAPI.bringBrowserViewToFront();
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create a new group</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                placeholder="Work, Research, Personal..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewGroupColor(color)}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 transition-all',
                      newGroupColor === color ? 'ring-2 ring-offset-2 ring-offset-background ring-primary' : 'border-border'
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Choose ${color}`}
                  />
                ))}
                <Input
                  type="color"
                  value={newGroupColor}
                  onChange={(e) => setNewGroupColor(e.target.value)}
                  className="w-12 h-8 p-1 border rounded"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setNewGroupOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGroup}>
              Create group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface TabProps {
  tab: TabInfo;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  width: number;
  groupColor?: string;
}

function Tab({ tab, isActive, onClick, onClose, width, groupColor }: TabProps) {
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };
  const handleCloseContext = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
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

  const borderStyle = groupColor
    ? {
        border: `2px solid ${groupColor}`,
        boxShadow: `0 0 0 1px ${groupColor} inset`,
      }
    : undefined;

  return (
    <div
      onClick={onClick}
      style={{ width: `${width}px`, ...borderStyle }}
      className={cn(
        'flex items-center gap-1.5 h-7 px-2.5 rounded-xl cursor-pointer group tab-item flex-shrink-0 border border-transparent',
        'transition-all duration-150',
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
        onContextMenu={handleCloseContext}
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

function TabGroupChip({ group, onToggle }: { group: TabGroup; onToggle: () => void }) {
  const bgColor = getColorWithAlpha(group.color);
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 px-2 h-7 rounded-full border text-xs font-medium transition-colors interactive"
      style={{ backgroundColor: bgColor, borderColor: group.color, color: group.color }}
      title={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
    >
      <span
        className="w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: group.color }}
      />
      <span className="truncate max-w-[120px]">{group.name}</span>
      {group.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
    </button>
  );
}

function getColorWithAlpha(color: string, alpha = 0.15): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}