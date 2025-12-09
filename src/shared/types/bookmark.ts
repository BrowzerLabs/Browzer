/**
 * Bookmark types for the browser
 */

export interface Bookmark {
  id: string;
  url: string;
  title: string | null;
  favicon?: string;
  parentId: string | null; // null for root level, folder id for nested
  index: number; // Position within parent folder
  dateAdded: number;
  dateModified?: number;
}

export interface BookmarkFolder {
  id: string;
  title: string;
  parentId: string | null;
  index: number;
  dateAdded: number;
  dateModified?: number;
}

export type BookmarkNode = (Bookmark | BookmarkFolder) & {
  isFolder: boolean;
  children?: BookmarkNode[];
};

export interface BookmarkTreeNode {
  id: string;
  title: string | null;
  url?: string;
  favicon?: string;
  parentId: string | null;
  index: number;
  dateAdded: number;
  dateModified?: number;
  isFolder: boolean;
  children?: BookmarkTreeNode[];
}

// Special folder IDs (like Chrome)
export const BOOKMARK_BAR_ID = 'bookmark-bar';
export const OTHER_BOOKMARKS_ID = 'other-bookmarks';

export interface CreateBookmarkParams {
  url: string;
  title?: string;
  parentId?: string;
  index?: number;
  favicon?: string;
}

export interface CreateFolderParams {
  title: string;
  parentId?: string;
  index?: number;
}

export interface UpdateBookmarkParams {
  id: string;
  title?: string;
  url?: string;
}

export interface MoveBookmarkParams {
  id: string;
  parentId?: string;
  index?: number;
}
