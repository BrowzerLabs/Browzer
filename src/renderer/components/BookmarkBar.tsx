import { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, ChevronDown, ChevronRight, Edit2, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/renderer/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/renderer/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
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
import { Label } from '@/renderer/ui/label';
import type { BookmarkTreeNode } from '@/shared/types';

interface BookmarkBarProps {
  onNavigate: (url: string) => void;
}

interface EditDialogState {
  isOpen: boolean;
  item: BookmarkTreeNode | null;
  name: string;
  url: string;
}

function useBrowserViewLayer() {
  const openOverlaysRef = useRef(new Set<string>());

  const updateBrowserViewLayer = useCallback(() => {
    const hasOpenOverlays = openOverlaysRef.current.size > 0;
    if (hasOpenOverlays) {
      void window.browserAPI.bringBrowserViewToFront();
    } else {
      void window.browserAPI.bringBrowserViewToBottom();
    }
  }, []);

  const registerOverlay = useCallback((id: string) => {
    openOverlaysRef.current.add(id);
    updateBrowserViewLayer();
  }, [updateBrowserViewLayer]);

  const unregisterOverlay = useCallback((id: string) => {
    openOverlaysRef.current.delete(id);
    updateBrowserViewLayer();
  }, [updateBrowserViewLayer]);

  const createOverlayHandler = useCallback((id: string) => {
    return (open: boolean) => {
      if (open) {
        registerOverlay(id);
      } else {
        unregisterOverlay(id);
      }
    };
  }, [registerOverlay, unregisterOverlay]);

  return { registerOverlay, unregisterOverlay, createOverlayHandler };
}

function useBookmarkBarData() {
  const [items, setItems] = useState<BookmarkTreeNode[]>([]);

  const loadItems = useCallback(async () => {
    try {
      const data = await window.browserAPI.getBookmarkBar();
      setItems(data);
    } catch (err) {
      console.error('[BookmarkBar] Failed to load:', err);
    }
  }, []);

  useEffect(() => {
    loadItems();
    const unsubscribe = window.browserAPI.onBookmarkChanged(() => {
      loadItems();
    });
    return () => unsubscribe();
  }, [loadItems]);

  return items;
}


function useVisibleItemsCount(
  containerRef: React.RefObject<HTMLDivElement>,
  measureRef: React.RefObject<HTMLDivElement>,
  itemCount: number
) {
  const [visibleCount, setVisibleCount] = useState(0);

  const calculate = useCallback(() => {
    if (!containerRef.current || !measureRef.current) return;

    const containerWidth = containerRef.current.offsetWidth;
    const overflowButtonWidth = 32;
    const availableWidth = containerWidth - overflowButtonWidth - 8;

    const items = measureRef.current.children;
    let totalWidth = 0;
    let count = 0;

    for (let i = 0; i < items.length; i++) {
      const itemWidth = (items[i] as HTMLElement).offsetWidth + 2;
      if (totalWidth + itemWidth <= availableWidth) {
        totalWidth += itemWidth;
        count++;
      } else {
        break;
      }
    }

    setVisibleCount(count === itemCount ? itemCount : count);
  }, [containerRef, measureRef, itemCount]);

  useEffect(() => {
    calculate();

    const resizeObserver = new ResizeObserver(calculate);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [calculate, containerRef, itemCount]);

  return visibleCount;
}


interface FaviconProps {
  favicon?: string;
  title?: string | null;
  url?: string;
  size?: 'sm' | 'md';
}

function Favicon({ favicon, title, url, size = 'sm' }: FaviconProps) {
  const displayChar = title?.charAt(0)?.toUpperCase() || url?.charAt(0)?.toUpperCase() || '?';
  const sizeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';

  if (favicon) {
    return <img src={favicon} alt="" className={`${sizeClass} rounded shrink-0`} />;
  }

  return (
    <div className={`${sizeClass} rounded bg-muted flex items-center justify-center shrink-0`}>
      <span className={`${textSize} text-muted-foreground`}>{displayChar}</span>
    </div>
  );
}

export function BookmarkBar({ onNavigate }: BookmarkBarProps) {
  // Data
  const bookmarkItems = useBookmarkBarData();

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const visibleCount = useVisibleItemsCount(containerRef, measureRef, bookmarkItems.length);

  const { createOverlayHandler, registerOverlay, unregisterOverlay } = useBrowserViewLayer();

  const [editDialog, setEditDialog] = useState<EditDialogState>({
    isOpen: false,
    item: null,
    name: '',
    url: '',
  });

  const dialogOverlayId = 'edit-dialog';


  const handleNavigate = useCallback((url: string) => {
    onNavigate(url);
  }, [onNavigate]);

  const openEditDialog = useCallback((item: BookmarkTreeNode) => {
    registerOverlay(dialogOverlayId);
    setEditDialog({
      isOpen: true,
      item,
      name: item.title || '',
      url: item.url || '',
    });
  }, [registerOverlay]);

  const closeEditDialog = useCallback(() => {
    setEditDialog(prev => ({ ...prev, isOpen: false, item: null }));
    unregisterOverlay(dialogOverlayId);
  }, [unregisterOverlay]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeEditDialog();
    }
  }, [closeEditDialog]);

  const handleSaveEdit = useCallback(async () => {
    if (!editDialog.item) return;

    try {
      const success = await window.browserAPI.updateBookmark({
        id: editDialog.item.id,
        title: editDialog.name.trim(),
        url: editDialog.item.isFolder ? undefined : editDialog.url.trim(),
      });

      if (success) {
        closeEditDialog();
      } else {
        toast.error('Failed to update');
      }
    } catch (err) {
      console.error('[BookmarkBar] Failed to update:', err);
      toast.error('Failed to update');
    }
  }, [editDialog, closeEditDialog]);

  const handleDelete = useCallback(async (item: BookmarkTreeNode) => {
    try {
      const success = await window.browserAPI.deleteBookmark(item.id);
      if (!success) {
        toast.error('Failed to delete');
      }
    } catch (err) {
      console.error('[BookmarkBar] Failed to delete:', err);
      toast.error('Failed to delete');
    }
  }, []);


  const renderFolderContents = (children: BookmarkTreeNode[] | undefined) => {
    if (!children?.length) return null;

    return children.map((child) => {
      if (child.isFolder) {
        return (
          <DropdownMenuSub key={child.id}>
            <DropdownMenuSubTrigger className="gap-2">
              <Folder className="w-4 h-4 text-yellow-500" />
              <span className="truncate max-w-[180px]">{child.title}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {renderFolderContents(child.children)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      }

      const hasTitle = child.title && child.title.trim().length > 0;
      return (
        <DropdownMenuItem
          key={child.id}
          onClick={() => child.url && handleNavigate(child.url)}
          className="gap-2"
        >
          <Favicon favicon={child.favicon} title={child.title} url={child.url} size="md" />
          {hasTitle && <span className="truncate max-w-[180px]">{child.title}</span>}
        </DropdownMenuItem>
      );
    });
  };

  const renderBookmarkButton = (item: BookmarkTreeNode) => {
    const hasTitle = item.title && item.title.trim().length > 0;

    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => item.url && handleNavigate(item.url)}
        className={`h-6 gap-1.5 text-xs font-normal shrink-0 ${hasTitle ? 'px-2' : 'px-1.5'}`}
        title={item.title || item.url}
      >
        <Favicon favicon={item.favicon} title={item.title} url={item.url} />
        {hasTitle && <span className="truncate max-w-[120px]">{item.title}</span>}
      </Button>
    );
  };

  const renderFolderButton = (item: BookmarkTreeNode, overlayHandler: (open: boolean) => void) => (
    <DropdownMenu onOpenChange={overlayHandler}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 gap-1.5 text-xs font-normal shrink-0">
          <Folder className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          <span className="truncate max-w-[120px]">{item.title}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        {renderFolderContents(item.children)}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderContextMenuContent = (item: BookmarkTreeNode) => (
    <ContextMenuContent className="w-48 text-sm">
      {!item.isFolder && (
        <>
          <ContextMenuItem onClick={() => item.url && handleNavigate(item.url)}>
            <ExternalLink className="mr-2" />
            Open in New Tab
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onClick={() => openEditDialog(item)}>
        <Edit2 className="mr-2" />
        Edit...
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => handleDelete(item)} variant="destructive">
        <Trash2 className="mr-2" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );

  const renderVisibleItem = (item: BookmarkTreeNode) => {
    const overlayId = `item-${item.id}`;
    const overlayHandler = createOverlayHandler(overlayId);

    if (item.isFolder) {
      return (
        <ContextMenu key={item.id} onOpenChange={overlayHandler}>
          <ContextMenuTrigger asChild>
            {renderFolderButton(item, overlayHandler)}
          </ContextMenuTrigger>
          {renderContextMenuContent(item)}
        </ContextMenu>
      );
    }

    return (
      <ContextMenu key={item.id} onOpenChange={overlayHandler}>
        <ContextMenuTrigger asChild>
          {renderBookmarkButton(item)}
        </ContextMenuTrigger>
        {renderContextMenuContent(item)}
      </ContextMenu>
    );
  };

  const renderOverflowItem = (item: BookmarkTreeNode) => {
    if (item.isFolder) {
      return (
        <DropdownMenuSub key={item.id}>
          <DropdownMenuSubTrigger className="gap-2">
            <Folder className="w-4 h-4 text-yellow-500" />
            <span className="truncate max-w-[180px]">{item.title}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {renderFolderContents(item.children)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    }

    const hasTitle = item.title && item.title.trim().length > 0;
    return (
      <DropdownMenuItem
        key={item.id}
        onClick={() => item.url && handleNavigate(item.url)}
        className="gap-2"
      >
        <Favicon favicon={item.favicon} title={item.title} url={item.url} size="md" />
        {hasTitle && <span className="truncate max-w-[180px]">{item.title}</span>}
      </DropdownMenuItem>
    );
  };

  const renderMeasureItem = (item: BookmarkTreeNode) => {
    if (item.isFolder) {
      return (
        <div key={item.id} className="h-6 px-2 gap-1.5 text-xs font-normal shrink-0 flex items-center">
          <Folder className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
          <span className="truncate max-w-[120px]">{item.title}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </div>
      );
    }

    const hasTitle = item.title && item.title.trim().length > 0;
    return (
      <div
        key={item.id}
        className={`h-6 gap-1.5 text-xs font-normal shrink-0 flex items-center ${hasTitle ? 'px-2' : 'px-1.5'}`}
      >
        <Favicon favicon={item.favicon} title={item.title} url={item.url} />
        {hasTitle && <span className="truncate max-w-[120px]">{item.title}</span>}
      </div>
    );
  };


  if (bookmarkItems.length === 0) {
    return null;
  }

  const visibleItems = bookmarkItems.slice(0, visibleCount);
  const overflowItems = bookmarkItems.slice(visibleCount);
  const hasOverflow = overflowItems.length > 0;

  return (
    <>
      <div
        ref={measureRef}
        className="fixed left-[-9999px] top-0 flex items-center gap-0.5 pointer-events-none"
        style={{ visibility: 'hidden' }}
        aria-hidden="true"
      >
        {bookmarkItems.map(renderMeasureItem)}
      </div>

      <div
        ref={containerRef}
        className="flex items-center h-7 px-2 bg-background border-b border-border/40 overflow-hidden"
      >
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
          {visibleItems.map(renderVisibleItem)}
        </div>

        {hasOverflow && (
          <DropdownMenu onOpenChange={createOverlayHandler('overflow-menu')}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 shrink-0 ml-0.5"
                title={`${overflowItems.length} more bookmarks`}
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px] max-h-[400px] overflow-y-auto">
              {overflowItems.map(renderOverflowItem)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={editDialog.isOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editDialog.item?.isFolder ? 'Edit Folder' : 'Edit Bookmark'}
            </DialogTitle>
            <DialogDescription>
              {editDialog.item?.isFolder
                ? 'Change the folder name.'
                : 'Make changes to your bookmark.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editDialog.name}
                onChange={(e) => setEditDialog(prev => ({ ...prev, name: e.target.value }))}
                placeholder={editDialog.item?.isFolder ? 'Folder name' : 'Bookmark name (optional)'}
              />
            </div>
            {!editDialog.item?.isFolder && (
              <div className="space-y-2">
                <Label htmlFor="edit-url">URL</Label>
                <Input
                  id="edit-url"
                  value={editDialog.url}
                  onChange={(e) => setEditDialog(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditDialog}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
