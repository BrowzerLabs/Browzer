import { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
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
  const [visibleCount, setVisibleCount] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);

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

    const handleBookmarkChange = () => {
      loadBookmarkBar();
    };

    window.addEventListener('focus', handleBookmarkChange);
    
    return () => {
      window.removeEventListener('focus', handleBookmarkChange);
    };
  }, [loadBookmarkBar]);

  useEffect(() => {
    const calculateVisibleItems = () => {
      if (!containerRef.current || !itemsRef.current) return;

      const containerWidth = containerRef.current.offsetWidth - 40;
      const items = itemsRef.current.children;
      let totalWidth = 0;
      let count = 0;

      for (let i = 0; i < items.length; i++) {
        const itemWidth = (items[i] as HTMLElement).offsetWidth + 4; // 4px gap
        if (totalWidth + itemWidth <= containerWidth) {
          totalWidth += itemWidth;
          count++;
        } else {
          break;
        }
      }

      setVisibleCount(count || bookmarkBarItems.length);
    };

    calculateVisibleItems();

    const resizeObserver = new ResizeObserver(calculateVisibleItems);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [bookmarkBarItems]);

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

  const renderItem = (item: BookmarkTreeNode, isOverflow = false) => {
    if (item.isFolder) {
      return (
        <DropdownMenu key={item.id}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 gap-1.5 text-xs font-normal max-w-[150px]",
                isOverflow && "w-full justify-start max-w-none"
              )}
            >
              <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <span className="truncate">{item.title}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
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
        className={cn(
          "h-7 px-2 gap-1.5 text-xs font-normal max-w-[150px]",
          isOverflow && "w-full justify-start max-w-none"
        )}
        title={item.url}
      >
        {item.favicon ? (
          <img src={item.favicon} alt="" className="w-4 h-4 rounded flex-shrink-0" />
        ) : (
          <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] text-muted-foreground">
              {item.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span className="truncate">{item.title}</span>
      </Button>
    );
  };

  const visibleItems = bookmarkBarItems.slice(0, visibleCount);
  const overflowItems = bookmarkBarItems.slice(visibleCount);

  return (
    <div
      ref={containerRef}
      className="bg-background fill-background h-7"
    >
      <div
        ref={itemsRef}
        className="flex items-center gap-1 flex-1 overflow-hidden"
      >
        {visibleItems.map((item) => renderItem(item))}
      </div>

      {overflowItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 flex-shrink-0"
              title={`${overflowItems.length} more bookmarks`}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px] max-h-[400px] overflow-y-auto">
            {overflowItems.map((item) => {
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

              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => item.url && onNavigate(item.url)}
                  className="gap-2"
                >
                  {item.favicon ? (
                    <img src={item.favicon} alt="" className="w-4 h-4 rounded flex-shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] text-muted-foreground">
                        {item.title.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span className="truncate max-w-[180px]">{item.title}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
