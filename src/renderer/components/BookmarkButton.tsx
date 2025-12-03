import { useState, useEffect, useCallback } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/renderer/ui/popover';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import { cn } from '@/renderer/lib/utils';
import type { Bookmark } from '@/shared/types';

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

  // Check if current URL is bookmarked
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
        } else {
          setEditTitle(title);
        }
      } catch (err) {
        console.error('[BookmarkButton] Failed to check bookmark status:', err);
      }
    };

    checkBookmarkStatus();
  }, [url, title]);

  // Handle star click - toggle bookmark
  const handleStarClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!url) return;

    setIsLoading(true);
    try {
      if (isBookmarked && currentBookmark) {
        // Remove bookmark
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
      setCurrentBookmark({ ...currentBookmark, title: editTitle });
      setIsOpen(false);
    } catch (err) {
      console.error('[BookmarkButton] Failed to update bookmark:', err);
    }
  }, [currentBookmark, editTitle]);

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
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Bookmark added</h4>
            <p className="text-sm text-muted-foreground">
              Edit your bookmark details
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bookmark-name">Name</Label>
            <Input
              id="bookmark-name"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Bookmark name"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">URL</Label>
            <p className="text-sm text-muted-foreground truncate">{url}</p>
          </div>
          <div className="flex justify-between">
            <Button variant="destructive" size="sm" onClick={handleRemove}>
              Remove
            </Button>
            <Button size="sm" onClick={handleSave}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
