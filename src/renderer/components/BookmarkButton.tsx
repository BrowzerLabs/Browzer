import { useState, useEffect, useCallback } from 'react';
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

  const extractFolders = useCallback((nodes: BookmarkTreeNode[]): { id: string; title: string; depth: number }[] => {
    const result: { id: string; title: string; depth: number }[] = [];
    
    const traverse = (node: BookmarkTreeNode, depth: number) => {
      if (node.isFolder) {
        result.push({ id: node.id, title: node.title, depth });
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
    const checkBookmarkStatus = async () => {
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
          setEditTitle(bookmark.title);
          setSelectedFolder(bookmark.parentId || BOOKMARK_BAR_ID);
        } else {
          setEditTitle(title);
          setSelectedFolder(BOOKMARK_BAR_ID);
        }
      } catch (err) {
        console.error('[BookmarkButton] Failed to check bookmark status:', err);
      }
    };

    checkBookmarkStatus();
  }, [url, title]);

  const handleStarClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!url) return;

    setIsLoading(true);
    try {
      if (isBookmarked && currentBookmark) {
        await window.browserAPI.deleteBookmark(currentBookmark.id);
        setIsBookmarked(false);
        setCurrentBookmark(null);
        onBookmarkChange?.(false);
      } else {
        // Add bookmark and open popover for editing
        const bookmark = await window.browserAPI.createBookmark({
          url,
          title,
          favicon,
          parentId: selectedFolder,
        });
        setIsBookmarked(true);
        setCurrentBookmark(bookmark);
        setEditTitle(bookmark.title);
        setIsOpen(true);
        onBookmarkChange?.(true);
      }
    } catch (err) {
      console.error('[BookmarkButton] Failed to toggle bookmark:', err);
    } finally {
      setIsLoading(false);
    }
  }, [url, title, favicon, isBookmarked, currentBookmark, onBookmarkChange]);

  // Handle save edit
  const handleSave = useCallback(async () => {
    if (!currentBookmark) return;

    try {
      await window.browserAPI.updateBookmark({
        id: currentBookmark.id,
        title: editTitle,
      });

      if (selectedFolder !== currentBookmark.parentId) {
        await window.browserAPI.moveBookmark({
          id: currentBookmark.id,
          parentId: selectedFolder,
        });
      }

      setCurrentBookmark({ ...currentBookmark, title: editTitle, parentId: selectedFolder });
      setIsOpen(false);
    } catch (err) {
      console.error('[BookmarkButton] Failed to update bookmark:', err);
    }
  }, [currentBookmark, editTitle, selectedFolder]);

  // Handle remove from popover
  const handleRemove = useCallback(async () => {
    if (!currentBookmark) return;

    try {
      await window.browserAPI.deleteBookmark(currentBookmark.id);
      setIsBookmarked(false);
      setCurrentBookmark(null);
      setIsOpen(false);
      onBookmarkChange?.(false);
    } catch (err) {
      console.error('[BookmarkButton] Failed to remove bookmark:', err);
    }
  }, [currentBookmark, onBookmarkChange]);

  // Handle popover open change
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (open) {
      window.browserAPI.bringBrowserViewToFront();
    } else {
      window.browserAPI.bringBrowserViewToBottom();
    }
  }, []);

  // Don't show for internal pages
  if (!url || url.startsWith('browzer://')) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleStarClick}
          disabled={isLoading || !url}
          title={isBookmarked ? 'Edit bookmark' : 'Bookmark this page'}
          className="h-8 w-8"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Star
              className={cn(
                'w-4 h-4 transition-colors',
                isBookmarked
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm">Bookmark added</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edit your bookmark details
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bookmark-name" className="text-xs">Name</Label>
            <Input
              id="bookmark-name"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Bookmark name"
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
            <Button variant="outline" size="sm" onClick={handleRemove} className="h-7 text-xs">
              Remove
            </Button>
            <Button size="sm" onClick={handleSave} className="h-7 text-xs">
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
