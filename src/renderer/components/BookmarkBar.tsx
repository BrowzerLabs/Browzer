import { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, ChevronDown, ChevronRight } from 'lucide-react';
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
  const overflowButtonRef = useRef<HTMLButtonElement>(null);

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

  const calculateVisibleItems = useCallback(() => {
    if (!containerRef.current || !itemsRef.current) return;
    
    const containerWidth = containerRef.current.offsetWidth;
    const overflowButtonWidth = 32;
    const availableWidth = containerWidth - overflowButtonWidth - 8;
    
    const items = itemsRef.current.children;
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
    
    if (count === bookmarkBarItems.length) {
      setVisibleCount(bookmarkBarItems.length);
    } else {
      setVisibleCount(count);
    }
  }, [bookmarkBarItems.length]);

  useEffect(() => {
    calculateVisibleItems();
    
    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleItems();
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [calculateVisibleItems, bookmarkBarItems]);

  const handleItemClick = (item: BookmarkTreeNode) => {
    if (!item.isFolder && item.url) {
      onNavigate(item.url);
    }
  };

  const renderFolderContents = (children: BookmarkTreeNode[] | undefined) => {
    if (!children || children.length === 0) {
      return null;
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

      const displayChar = child.title?.charAt(0)?.toUpperCase() || child.url?.charAt(0)?.toUpperCase() || '?';
      
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
                {displayChar}
              </span>
            </div>
          )}
          {child.title && <span className="truncate max-w-[180px]">{child.title}</span>}
        </DropdownMenuItem>
      );
    });
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

    const displayChar = item.title?.charAt(0)?.toUpperCase() || item.url?.charAt(0)?.toUpperCase() || '?';
    
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
              {displayChar}
            </span>
          </div>
        )}
        {item.title && <span className="truncate max-w-[180px]">{item.title}</span>}
      </DropdownMenuItem>
    );
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

    const displayChar = item.title?.charAt(0)?.toUpperCase() || item.url?.charAt(0)?.toUpperCase() || '?';
    const hasTitle = item.title && item.title.trim().length > 0;
    
    return (
      <Button
        key={item.id}
        variant="ghost"
        size="sm"
        onClick={() => handleItemClick(item)}
        className={`h-6 gap-1.5 text-xs font-normal shrink-0 ${hasTitle ? 'px-2' : 'px-1.5'}`}
        title={item.title || item.url}
      >
        {item.favicon ? (
          <img src={item.favicon} alt="" className="w-3.5 h-3.5 rounded shrink-0" />
        ) : (
          <div className="w-3.5 h-3.5 rounded bg-muted flex items-center justify-center shrink-0">
            <span className="text-[9px] text-muted-foreground">
              {displayChar}
            </span>
          </div>
        )}
        {hasTitle && <span className="truncate max-w-[120px]">{item.title}</span>}
      </Button>
    );
  };

  if (bookmarkBarItems.length === 0) {
    return null;
  }

  const visibleItems = bookmarkBarItems.slice(0, visibleCount);
  const overflowItems = bookmarkBarItems.slice(visibleCount);
  const hasOverflow = overflowItems.length > 0;

  return (
    <>
      <div 
        ref={itemsRef}
        className="fixed left-[-9999px] top-0 flex items-center gap-0.5 pointer-events-none"
        style={{ visibility: 'hidden' }}
        aria-hidden="true"
      >
        {bookmarkBarItems.map((item) => renderItem(item))}
      </div>

      <div 
        ref={containerRef}
        className="flex items-center h-7 px-2 bg-background border-b border-border/40 overflow-hidden"
      >
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
          {visibleItems.map((item) => renderItem(item))}
        </div>

      {hasOverflow && (
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) {
              void window.browserAPI.bringBrowserViewToFront();
            } else {
              void window.browserAPI.bringBrowserViewToBottom();
            }
        }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              ref={overflowButtonRef}
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 shrink-0 ml-0.5"
              title={`${overflowItems.length} more bookmarks`}
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px] max-h-[400px] overflow-y-auto">
            {overflowItems.map((item) => renderOverflowItem(item))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      </div>
    </>
  );
}
