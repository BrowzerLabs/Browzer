import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  Bookmark,
  BookmarkFolder,
  BookmarkTreeNode,
  CreateBookmarkParams,
  CreateFolderParams,
  UpdateBookmarkParams,
  MoveBookmarkParams,
  BOOKMARK_BAR_ID,
  OTHER_BOOKMARKS_ID,
} from '@/shared/types';

export class BookmarkService {
  private db: Database.Database;

  private stmts: {
    getById: Database.Statement;
    getByUrl: Database.Statement;
    getChildren: Database.Statement;
    insert: Database.Statement;
    update: Database.Statement;
    updateIndex: Database.Statement;
    deleteById: Database.Statement;
    getMaxIndex: Database.Statement;
    searchBookmarks: Database.Statement;
    getAllBookmarks: Database.Statement;
    getRecentBookmarks: Database.Statement;
  };

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'bookmarks.db');

    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.initializeDatabase();

    // Prepare statements
    this.stmts = {
      getById: this.db.prepare('SELECT * FROM bookmarks WHERE id = ?'),
      getByUrl: this.db.prepare('SELECT * FROM bookmarks WHERE url = ? AND is_folder = 0'),
      getChildren: this.db.prepare(
        'SELECT * FROM bookmarks WHERE parent_id = ? ORDER BY idx ASC'
      ),
      insert: this.db.prepare(`
        INSERT INTO bookmarks (id, title, url, favicon, parent_id, idx, is_folder, date_added, date_modified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      update: this.db.prepare(`
        UPDATE bookmarks 
        SET title = COALESCE(?, title),
            url = COALESCE(?, url),
            date_modified = ?
        WHERE id = ?
      `),
      updateIndex: this.db.prepare(
        'UPDATE bookmarks SET parent_id = ?, idx = ?, date_modified = ? WHERE id = ?'
      ),
      deleteById: this.db.prepare('DELETE FROM bookmarks WHERE id = ?'),
      getMaxIndex: this.db.prepare(
        'SELECT MAX(idx) as max_idx FROM bookmarks WHERE parent_id = ?'
      ),
      searchBookmarks: this.db.prepare(`
        SELECT * FROM bookmarks 
        WHERE is_folder = 0 AND (LOWER(title) LIKE ? OR LOWER(url) LIKE ?)
        ORDER BY date_added DESC
        LIMIT ?
      `),
      getAllBookmarks: this.db.prepare(
        'SELECT * FROM bookmarks WHERE is_folder = 0 ORDER BY date_added DESC'
      ),
      getRecentBookmarks: this.db.prepare(
        'SELECT * FROM bookmarks WHERE is_folder = 0 ORDER BY date_added DESC LIMIT ?'
      ),
    };

    console.log('[BookmarkService] Initialized with SQLite at:', dbPath);
  }

  private initializeDatabase(): void {
    try {
      // Create bookmarks table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS bookmarks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          url TEXT,
          favicon TEXT,
          parent_id TEXT,
          idx INTEGER NOT NULL DEFAULT 0,
          is_folder INTEGER NOT NULL DEFAULT 0,
          date_added INTEGER NOT NULL,
          date_modified INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_parent_id ON bookmarks(parent_id);
        CREATE INDEX IF NOT EXISTS idx_url ON bookmarks(url);
        CREATE INDEX IF NOT EXISTS idx_date_added ON bookmarks(date_added DESC);
      `);

      // Create default folders if they don't exist
      this.ensureDefaultFolders();

      console.log('[BookmarkService] Database initialized successfully');
    } catch (error) {
      console.error('[BookmarkService] Failed to initialize database:', error);
      throw error;
    }
  }

  private ensureDefaultFolders(): void {
    const now = Date.now();

    // Check if Bookmark Bar exists
    const bookmarkBar = this.stmts.getById.get(BOOKMARK_BAR_ID);
    if (!bookmarkBar) {
      this.stmts.insert.run(
        BOOKMARK_BAR_ID,
        'Bookmarks Bar',
        null,
        null,
        null,
        0,
        1,
        now,
        now
      );
    }

    // Check if Other Bookmarks exists
    const otherBookmarks = this.stmts.getById.get(OTHER_BOOKMARKS_ID);
    if (!otherBookmarks) {
      this.stmts.insert.run(
        OTHER_BOOKMARKS_ID,
        'Other Bookmarks',
        null,
        null,
        null,
        1,
        1,
        now,
        now
      );
    }
  }

  /**
   * Create a new bookmark
   */
  public createBookmark(params: CreateBookmarkParams): Bookmark {
    const {
      url,
      title,
      parentId = BOOKMARK_BAR_ID,
      index,
      favicon,
    } = params;

    const id = randomUUID();
    const now = Date.now();

    // Get next index if not specified
    let idx = index;
    if (idx === undefined) {
      const result = this.stmts.getMaxIndex.get(parentId) as { max_idx: number | null };
      idx = (result?.max_idx ?? -1) + 1;
    }

    this.stmts.insert.run(id, title, url, favicon || null, parentId, idx, 0, now, now);

    return {
      id,
      url,
      title,
      favicon,
      parentId,
      index: idx,
      dateAdded: now,
      dateModified: now,
    };
  }

  /**
   * Create a new folder
   */
  public createFolder(params: CreateFolderParams): BookmarkFolder {
    const { title, parentId = BOOKMARK_BAR_ID, index } = params;

    const id = randomUUID();
    const now = Date.now();

    let idx = index;
    if (idx === undefined) {
      const result = this.stmts.getMaxIndex.get(parentId) as { max_idx: number | null };
      idx = (result?.max_idx ?? -1) + 1;
    }

    this.stmts.insert.run(id, title, null, null, parentId, idx, 1, now, now);

    return {
      id,
      title,
      parentId,
      index: idx,
      dateAdded: now,
      dateModified: now,
    };
  }

  /**
   * Get a bookmark or folder by ID
   */
  public getById(id: string): BookmarkTreeNode | null {
    const row = this.stmts.getById.get(id) as any;
    if (!row) return null;
    return this.rowToNode(row);
  }

  /**
   * Get bookmark by URL (to check if already bookmarked)
   */
  public getByUrl(url: string): Bookmark | null {
    const row = this.stmts.getByUrl.get(url) as any;
    if (!row) return null;
    return this.rowToBookmark(row);
  }

  /**
   * Check if a URL is bookmarked
   */
  public isBookmarked(url: string): boolean {
    return this.getByUrl(url) !== null;
  }

  /**
   * Get children of a folder
   */
  public getChildren(parentId: string): BookmarkTreeNode[] {
    const rows = this.stmts.getChildren.all(parentId) as any[];
    return rows.map((row) => this.rowToNode(row));
  }

  /**
   * Get full bookmark tree
   */
  public getTree(): BookmarkTreeNode[] {
    const buildTree = (parentId: string | null): BookmarkTreeNode[] => {
      const children = parentId
        ? this.getChildren(parentId)
        : [this.getById(BOOKMARK_BAR_ID)!, this.getById(OTHER_BOOKMARKS_ID)!].filter(Boolean);

      return children.map((node) => {
        if (node.isFolder) {
          node.children = buildTree(node.id);
        }
        return node;
      });
    };

    return buildTree(null);
  }

  /**
   * Get bookmark bar contents
   */
  public getBookmarkBar(): BookmarkTreeNode[] {
    return this.getChildren(BOOKMARK_BAR_ID);
  }

  /**
   * Update a bookmark or folder
   */
  public update(params: UpdateBookmarkParams): boolean {
    const { id, title, url } = params;
    const now = Date.now();

    const result = this.stmts.update.run(title || null, url || null, now, id);
    return result.changes > 0;
  }

  /**
   * Move a bookmark or folder
   */
  public move(params: MoveBookmarkParams): boolean {
    const { id, parentId, index } = params;
    const now = Date.now();

    const node = this.getById(id);
    if (!node) return false;

    const newParentId = parentId ?? node.parentId;
    let newIndex = index;

    if (newIndex === undefined) {
      const result = this.stmts.getMaxIndex.get(newParentId) as { max_idx: number | null };
      newIndex = (result?.max_idx ?? -1) + 1;
    }

    const result = this.stmts.updateIndex.run(newParentId, newIndex, now, id);
    return result.changes > 0;
  }

  /**
   * Delete a bookmark or folder (and all children if folder)
   */
  public delete(id: string): boolean {
    // Don't allow deleting root folders
    if (id === BOOKMARK_BAR_ID || id === OTHER_BOOKMARKS_ID) {
      return false;
    }

    const node = this.getById(id);
    if (!node) return false;

    // If it's a folder, delete all children first
    if (node.isFolder) {
      const children = this.getChildren(id);
      for (const child of children) {
        this.delete(child.id);
      }
    }

    const result = this.stmts.deleteById.run(id);
    return result.changes > 0;
  }

  /**
   * Search bookmarks
   */
  public search(query: string, limit = 20): Bookmark[] {
    const searchPattern = `%${query.toLowerCase()}%`;
    const rows = this.stmts.searchBookmarks.all(searchPattern, searchPattern, limit) as any[];
    return rows.map((row) => this.rowToBookmark(row));
  }

  /**
   * Get all bookmarks (flat list)
   */
  public getAllBookmarks(): Bookmark[] {
    const rows = this.stmts.getAllBookmarks.all() as any[];
    return rows.map((row) => this.rowToBookmark(row));
  }

  /**
   * Get recent bookmarks
   */
  public getRecentBookmarks(limit = 10): Bookmark[] {
    const rows = this.stmts.getRecentBookmarks.all(limit) as any[];
    return rows.map((row) => this.rowToBookmark(row));
  }

  /**
   * Convert database row to BookmarkTreeNode
   */
  private rowToNode(row: any): BookmarkTreeNode {
    return {
      id: row.id,
      title: row.title,
      url: row.url || undefined,
      favicon: row.favicon || undefined,
      parentId: row.parent_id,
      index: row.idx,
      dateAdded: row.date_added,
      dateModified: row.date_modified || undefined,
      isFolder: row.is_folder === 1,
    };
  }

  /**
   * Convert database row to Bookmark
   */
  private rowToBookmark(row: any): Bookmark {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      favicon: row.favicon || undefined,
      parentId: row.parent_id,
      index: row.idx,
      dateAdded: row.date_added,
      dateModified: row.date_modified || undefined,
    };
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
  }
}
