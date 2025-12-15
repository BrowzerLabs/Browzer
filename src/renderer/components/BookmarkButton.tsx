import { useState, useEffect, useCallback, useRef } from 'react';
import { Star, Loader2, Folder } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/renderer/ui/popover';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import { cn } from '@/renderer/lib/utils';
import type { Bookmark, BookmarkTreeNode } from '@/shared/types';
import { BOOKMARK_BAR_ID } from '@/shared/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/ui/tooltip';

interface BookmarkButtonProps {
  url: string;
  title: string;
  favicon?: string;
  onBookmarkChange?: (isBookmarked: boolean) => void;
}

export function BookmarkButton({
  url,
  title,
  favicon,
  onBookmarkChange,
}: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentBookmark, setCurrentBookmark] = useState<Bookmark | null>(null);
  const [editTitle, setEditTitle] = useState(title);
  const [selectedFolder, setSelectedFolder] = useState<string>(BOOKMARK_BAR_ID);
  const [folders, setFolders] = useState<{ id: string; title: string; depth: number }[]>([]);
  
  const lastBrowserViewStateRef = useRef<boolean | null>(null);

  const extractFolders = useCallback((nodes: BookmarkTreeNode[]): { id: string; title: string; depth: number }[] => {
    const result: { id: string; title: string; depth: number }[] = [];
    
    const traverse = (node: BookmarkTreeNode, depth: number) => {
      if (node.isFolder) {
        result.push({ id: node.id, title: node.title || 'Untitled', depth });
        node.children?.forEach(child => traverse(child, depth + 1));
      }
    };
    
    nodes.forEach(node => traverse(node, 0));
    return result;
  }, []);

  useEffect(() => {
    const loadFolders = async () => {
      try {
        const tree = await window.browserAPI.getBookmarkTree();
        setFolders(extractFolders(tree));
      } catch (err) {
        console.error('[BookmarkButton] Failed to load folders:', err);
      }
    };

    if (isOpen) {
      loadFolders();
    }
  }, [isOpen, extractFolders]);

  useEffect(() => {
    if (lastBrowserViewStateRef.current === isOpen) {
      return;
    }
    lastBrowserViewStateRef.current = isOpen;

    if (isOpen) {
      window.browserAPI.bringBrowserViewToFront();
    } else {
      window.browserAPI.bringBrowserViewToBottom();
    }
  }, [isOpen]);

  const checkBookmarkStatus = useCallback(async () => {
    if (!url) {
      setIsBookmarked(false);
      setCurrentBookmark(null);
      return;
    }

    try {
      const bookmark = await window.browserAPI.getBookmarkByUrl(url);
      setIsBookmarked(!!bookmark);
      setCurrentBookmark(bookmark);
      if (bookmark) {
        setEditTitle(bookmark.title || '');
        setSelectedFolder(bookmark.parentId || BOOKMARK_BAR_ID);
      } else {
        setEditTitle(title || '');
        setSelectedFolder(BOOKMARK_BAR_ID);
      }
    } catch (err) {
      console.error('[BookmarkButton] Failed to check bookmark status:', err);
    }
  }, [url, title]);

  useEffect(() => {
    checkBookmarkStatus();
  }, [checkBookmarkStatus]);

  useEffect(() => {
    const unsubscribe = window.browserAPI.onBookmarkChanged(() => {
      checkBookmarkStatus();
    });
    return () => unsubscribe();
  }, [checkBookmarkStatus]);

  const closePopover = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleStarClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!url || isLoading) return;

    if (isBookmarked && currentBookmark) {
      setEditTitle(currentBookmark.title || '');
      setSelectedFolder(currentBookmark.parentId || BOOKMARK_BAR_ID);
      setIsOpen(true);
    } else {
      setIsLoading(true);
      try {
        const bookmark = await window.browserAPI.createBookmark({
          url,
          title,
          favicon,
          parentId: selectedFolder,
        });
        setIsBookmarked(true);
        setCurrentBookmark(bookmark);
        setEditTitle(bookmark.title || '');
        setSelectedFolder(bookmark.parentId || BOOKMARK_BAR_ID);
        setIsOpen(true);
        onBookmarkChange?.(true);
      } catch (err) {
        console.error('[BookmarkButton] Failed to create bookmark:', err);
      } finally {
        setIsLoading(false);
      }
    }
  }, [url, title, favicon, isLoading, isBookmarked, currentBookmark, selectedFolder, onBookmarkChange]);

  const handleSave = useCallback(async () => {
    if (!currentBookmark) {
      closePopover();
      return;
    }

    setIsLoading(true);
    try {
      if (editTitle !== currentBookmark.title) {
        await window.browserAPI.updateBookmark({
          id: currentBookmark.id,
          title: editTitle,
        });
      }

      if (selectedFolder !== currentBookmark.parentId) {
        await window.browserAPI.moveBookmark({
          id: currentBookmark.id,
          parentId: selectedFolder,
        });
      }

      setCurrentBookmark({ ...currentBookmark, title: editTitle, parentId: selectedFolder });
      closePopover();
    } catch (err) {
      console.error('[BookmarkButton] Failed to update bookmark:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentBookmark, editTitle, selectedFolder, closePopover]);

  const handleRemove = useCallback(async () => {
    if (!currentBookmark) {
      closePopover();
      return;
    }

    setIsLoading(true);
    try {
      await window.browserAPI.deleteBookmark(currentBookmark.id);
      setIsBookmarked(false);
      setCurrentBookmark(null);
      setEditTitle(title || '');
      setSelectedFolder(BOOKMARK_BAR_ID);
      onBookmarkChange?.(false);
      closePopover();
    } catch (err) {
      console.error('[BookmarkButton] Failed to remove bookmark:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentBookmark, title, onBookmarkChange, closePopover]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  if (!url || url.startsWith('browzer://')) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger 
            onClick={handleStarClick}
            disabled={isLoading || !url}
          >
            <Star
              className={cn(
                'w-4 h-4 transition-colors',
                isBookmarked
                  ? 'fill-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {isBookmarked ? 'Edit bookmark' : 'Bookmark this page'}
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm">
              {isBookmarked ? 'Edit bookmark' : 'Bookmark added'}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isBookmarked ? 'Update your bookmark details' : 'Edit your bookmark details'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bookmark-name" className="text-xs">Name</Label>
            <Input
              id="bookmark-name"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Leave empty to show only favicon"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Folder</Label>
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Folder className="w-3 h-3 text-yellow-500" />
                      <span style={{ paddingLeft: `${folder.depth * 8}px` }}>
                        {folder.title}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="pt-1">
            <p className="text-xs text-muted-foreground truncate">{url}</p>
          </div>
          <div className="flex justify-between pt-1">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRemove} 
              disabled={isLoading}
              className="h-7 text-xs"
            >
              Remove
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              disabled={isLoading}
              className="h-7 text-xs"
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
