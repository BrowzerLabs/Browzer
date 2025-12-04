import { useState, useEffect, useCallback } from 'react';
import { Folder, ChevronDown } from 'lucide-react';
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
import type { BookmarkTreeNode } from '@/shared/types';

interface BookmarkBarProps {
  onNavigate: (url: string) => void;
}

export function BookmarkBar({ onNavigate }: BookmarkBarProps) {
  const [bookmarkBarItems, setBookmarkBarItems] = useState<BookmarkTreeNode[]>([]);

  const loadBookmarkBar = useCallback(async () => {
    try {
      const items = await window.browserAPI.getBookmarkBar();
      setBookmarkBarItems(items);
    } catch (err) {
      console.error('[BookmarkBar] Failed to load bookmark bar:', err);
    }
  }, []);

  useEffect(() => {
    loadBookmarkBar();

    const unsubscribe = window.browserAPI.onBookmarkChanged(() => {
      loadBookmarkBar();
    });
    
    return () => {
      unsubscribe();
    };
  }, [loadBookmarkBar]);

  const handleItemClick = (item: BookmarkTreeNode) => {
    if (!item.isFolder && item.url) {
      onNavigate(item.url);
    }
  };

  const renderFolderContents = (children: BookmarkTreeNode[] | undefined) => {
    if (!children || children.length === 0) {
      return (
        <DropdownMenuItem disabled className="text-muted-foreground text-xs">
          (empty)
        </DropdownMenuItem>
      );
    }

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

      return (
        <DropdownMenuItem
          key={child.id}
          onClick={() => child.url && onNavigate(child.url)}
          className="gap-2"
        >
          {child.favicon ? (
            <img src={child.favicon} alt="" className="w-4 h-4 rounded flex-shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] text-muted-foreground">
                {child.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <span className="truncate max-w-[180px]">{child.title}</span>
        </DropdownMenuItem>
      );
    });
  };

  const renderItem = (item: BookmarkTreeNode) => {
    if (item.isFolder) {
      return (
        <DropdownMenu key={item.id}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 gap-1.5 text-xs font-normal shrink-0"
            >
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
    }

    return (
      <Button
        key={item.id}
        variant="ghost"
        size="sm"
        onClick={() => handleItemClick(item)}
        className="h-6 px-2 gap-1.5 text-xs font-normal shrink-0"
        title={item.url}
      >
        {item.favicon ? (
          <img src={item.favicon} alt="" className="w-3.5 h-3.5 rounded shrink-0" />
        ) : (
          <div className="w-3.5 h-3.5 rounded bg-muted flex items-center justify-center shrink-0">
            <span className="text-[9px] text-muted-foreground">
              {item.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span className="truncate max-w-[120px]">{item.title}</span>
      </Button>
    );
  };

  if (bookmarkBarItems.length === 0) {
    return (
      <div className="flex items-center h-7 px-2 bg-background border-b border-border/40 overflow-hidden">
        <span className="text-muted-foreground text-xs">No bookmarks yet</span>
      </div>
    )
  }

  return (
    <div className="flex items-center h-7 px-2 bg-background border-b border-border/40 overflow-hidden">
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
        {bookmarkBarItems.map((item) => renderItem(item))}
      </div>
    </div>
  );
}
