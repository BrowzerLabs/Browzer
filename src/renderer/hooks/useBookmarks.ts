import { useState, useCallback, useEffect } from 'react';

import type {
  Bookmark,
  BookmarkTreeNode,
  CreateBookmarkParams,
} from '@/shared/types';

interface UseBookmarksReturn {
  // State
  bookmarks: Bookmark[];
  bookmarkBar: BookmarkTreeNode[];
  bookmarkTree: BookmarkTreeNode[];
  isLoading: boolean;
  error: string | null;

  // Actions
  addBookmark: (params: CreateBookmarkParams) => Promise<Bookmark | null>;
  removeBookmark: (id: string) => Promise<boolean>;
  updateBookmark: (
    id: string,
    title?: string,
    url?: string
  ) => Promise<boolean>;
  isUrlBookmarked: (url: string) => Promise<boolean>;
  getBookmarkForUrl: (url: string) => Promise<Bookmark | null>;
  toggleBookmark: (
    url: string,
    title: string,
    favicon?: string
  ) => Promise<{ added: boolean; bookmark: Bookmark | null }>;
  searchBookmarks: (query: string) => Promise<Bookmark[]>;
  refreshBookmarks: () => Promise<void>;
}

export function useBookmarks(): UseBookmarksReturn {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkBar, setBookmarkBar] = useState<BookmarkTreeNode[]>([]);
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Refresh all bookmarks data
   */
  const refreshBookmarks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [allBookmarks, bar, tree] = await Promise.all([
        window.browserAPI.getAllBookmarks(),
        window.browserAPI.getBookmarkBar(),
        window.browserAPI.getBookmarkTree(),
      ]);
      setBookmarks(allBookmarks);
      setBookmarkBar(bar);
      setBookmarkTree(tree);
    } catch (err) {
      console.error('[useBookmarks] Failed to refresh bookmarks:', err);
      setError('Failed to load bookmarks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBookmarks();

    const unsubscribe = window.browserAPI.onBookmarkChanged(() => {
      refreshBookmarks();
    });

    return () => {
      unsubscribe();
    };
  }, [refreshBookmarks]);

  /**
   * Add a new bookmark
   */
  const addBookmark = useCallback(
    async (params: CreateBookmarkParams): Promise<Bookmark | null> => {
      try {
        const bookmark = await window.browserAPI.createBookmark(params);
        await refreshBookmarks();
        return bookmark;
      } catch (err) {
        console.error('[useBookmarks] Failed to add bookmark:', err);
        setError('Failed to add bookmark');
        return null;
      }
    },
    [refreshBookmarks]
  );

  /**
   * Remove a bookmark
   */
  const removeBookmark = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const result = await window.browserAPI.deleteBookmark(id);
        if (result) {
          await refreshBookmarks();
        }
        return result;
      } catch (err) {
        console.error('[useBookmarks] Failed to remove bookmark:', err);
        setError('Failed to remove bookmark');
        return false;
      }
    },
    [refreshBookmarks]
  );

  /**
   * Update a bookmark
   */
  const updateBookmark = useCallback(
    async (id: string, title?: string, url?: string): Promise<boolean> => {
      try {
        const result = await window.browserAPI.updateBookmark({
          id,
          title,
          url,
        });
        if (result) {
          await refreshBookmarks();
        }
        return result;
      } catch (err) {
        console.error('[useBookmarks] Failed to update bookmark:', err);
        setError('Failed to update bookmark');
        return false;
      }
    },
    [refreshBookmarks]
  );

  /**
   * Check if a URL is bookmarked
   */
  const isUrlBookmarked = useCallback(async (url: string): Promise<boolean> => {
    try {
      return await window.browserAPI.isBookmarked(url);
    } catch (err) {
      console.error('[useBookmarks] Failed to check bookmark status:', err);
      return false;
    }
  }, []);

  /**
   * Get bookmark for a URL
   */
  const getBookmarkForUrl = useCallback(
    async (url: string): Promise<Bookmark | null> => {
      try {
        return await window.browserAPI.getBookmarkByUrl(url);
      } catch (err) {
        console.error('[useBookmarks] Failed to get bookmark for URL:', err);
        return null;
      }
    },
    []
  );

  /**
   * Toggle bookmark for a URL (add if not bookmarked, remove if bookmarked)
   */
  const toggleBookmark = useCallback(
    async (
      url: string,
      title: string,
      favicon?: string
    ): Promise<{ added: boolean; bookmark: Bookmark | null }> => {
      try {
        const existingBookmark = await window.browserAPI.getBookmarkByUrl(url);

        if (existingBookmark) {
          // Remove existing bookmark
          await window.browserAPI.deleteBookmark(existingBookmark.id);
          await refreshBookmarks();
          return { added: false, bookmark: null };
        } else {
          // Add new bookmark
          const bookmark = await window.browserAPI.createBookmark({
            url,
            title,
            favicon,
          });
          await refreshBookmarks();
          return { added: true, bookmark };
        }
      } catch (err) {
        console.error('[useBookmarks] Failed to toggle bookmark:', err);
        setError('Failed to toggle bookmark');
        return { added: false, bookmark: null };
      }
    },
    [refreshBookmarks]
  );

  /**
   * Search bookmarks
   */
  const searchBookmarks = useCallback(
    async (query: string): Promise<Bookmark[]> => {
      try {
        return await window.browserAPI.searchBookmarks(query);
      } catch (err) {
        console.error('[useBookmarks] Failed to search bookmarks:', err);
        return [];
      }
    },
    []
  );

  return {
    bookmarks,
    bookmarkBar,
    bookmarkTree,
    isLoading,
    error,
    addBookmark,
    removeBookmark,
    updateBookmark,
    isUrlBookmarked,
    getBookmarkForUrl,
    toggleBookmark,
    searchBookmarks,
    refreshBookmarks,
  };
}
