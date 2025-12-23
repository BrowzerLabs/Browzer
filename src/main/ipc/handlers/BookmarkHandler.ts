import { BaseHandler } from './base';

import {
  CreateBookmarkParams,
  CreateFolderParams,
  UpdateBookmarkParams,
  MoveBookmarkParams,
} from '@/shared/types';

export class BookmarkHandler extends BaseHandler {
  register(): void {
    const { bookmarkService } = this.context;

    this.handle('bookmark:create', async (_, params: CreateBookmarkParams) => {
      return bookmarkService.createBookmark(params);
    });
    this.handle(
      'bookmark:create-folder',
      async (_, params: CreateFolderParams) => {
        return bookmarkService.createFolder(params);
      }
    );
    this.handle('bookmark:get', async (_, id: string) => {
      return bookmarkService.getById(id);
    });
    this.handle('bookmark:get-by-url', async (_, url: string) => {
      return bookmarkService.getByUrl(url);
    });
    this.handle('bookmark:is-bookmarked', async (_, url: string) => {
      return bookmarkService.isBookmarked(url);
    });
    this.handle('bookmark:get-children', async (_, parentId: string) => {
      return bookmarkService.getChildren(parentId);
    });
    this.handle('bookmark:get-tree', async () => {
      return bookmarkService.getTree();
    });
    this.handle('bookmark:get-bar', async () => {
      return bookmarkService.getBookmarkBar();
    });
    this.handle('bookmark:update', async (_, params: UpdateBookmarkParams) => {
      return bookmarkService.update(params);
    });
    this.handle('bookmark:move', async (_, params: MoveBookmarkParams) => {
      return bookmarkService.move(params);
    });
    this.handle('bookmark:delete', async (_, id: string) => {
      return bookmarkService.delete(id);
    });
    this.handle('bookmark:search', async (_, query: string, limit?: number) => {
      return bookmarkService.search(query, limit);
    });
    this.handle('bookmark:get-all', async () => {
      return bookmarkService.getAllBookmarks();
    });
    this.handle('bookmark:get-recent', async (_, limit?: number) => {
      return bookmarkService.getRecentBookmarks(limit);
    });
  }
}
