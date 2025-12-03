import { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, Star, Folder, ExternalLink, Edit2, MoreVertical, Plus, Loader2 } from 'lucide-react';
import type { Bookmark, BookmarkTreeNode } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/ui/dialog';
import { Label } from '@/renderer/ui/label';

export function Bookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkTreeNode[]>([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');

  // Load bookmarks
  const loadBookmarks = useCallback(async () => {
    try {
      setLoading(true);
      const [allBookmarks, tree] = await Promise.all([
        window.browserAPI.getAllBookmarks(),
        window.browserAPI.getBookmarkTree(),
      ]);
      setBookmarks(allBookmarks);
      setBookmarkTree(tree);
      setFilteredBookmarks(allBookmarks);
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
      toast.error('Failed to load bookmarks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  // Filter bookmarks based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredBookmarks(bookmarks);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = bookmarks.filter(
      (bookmark) =>
        bookmark.title.toLowerCase().includes(query) ||
        bookmark.url.toLowerCase().includes(query)
    );
    setFilteredBookmarks(filtered);
  }, [searchQuery, bookmarks]);

  // Handle delete bookmark
  const handleDelete = async (id: string) => {
    try {
      await window.browserAPI.deleteBookmark(id);
      toast.success('Bookmark deleted');
      loadBookmarks();
    } catch (error) {
      console.error('Failed to delete bookmark:', error);
      toast.error('Failed to delete bookmark');
    }
  };

  // Handle edit bookmark
  const handleEdit = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setEditTitle(bookmark.title);
    setEditUrl(bookmark.url);
    setEditDialogOpen(true);
  };

  // Save edited bookmark
  const handleSaveEdit = async () => {
    if (!editingBookmark) return;

    try {
      await window.browserAPI.updateBookmark({
        id: editingBookmark.id,
        title: editTitle,
        url: editUrl,
      });
      toast.success('Bookmark updated');
      setEditDialogOpen(false);
      setEditingBookmark(null);
      loadBookmarks();
    } catch (error) {
      console.error('Failed to update bookmark:', error);
      toast.error('Failed to update bookmark');
    }
  };

  // Open bookmark in new tab
  const handleOpen = async (url: string) => {
    try {
      await window.browserAPI.createTab(url);
    } catch (error) {
      console.error('Failed to open bookmark:', error);
      toast.error('Failed to open bookmark');
    }
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Render tree node recursively
  const renderTreeNode = (node: BookmarkTreeNode, depth = 0) => {
    if (node.isFolder) {
      return (
        <div key={node.id} className="mb-2">
          <div
            className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50"
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            <Folder className="w-4 h-4 text-yellow-500" />
            <span className="font-medium">{node.title}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {node.children?.length || 0} items
            </span>
          </div>
          {node.children?.map((child) => renderTreeNode(child, depth + 1))}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 group cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
        onClick={() => node.url && handleOpen(node.url)}
      >
        {node.favicon ? (
          <img src={node.favicon} alt="" className="w-4 h-4 rounded" />
        ) : (
          <Star className="w-4 h-4 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{node.title}</p>
          <p className="text-xs text-muted-foreground truncate">{node.url}</p>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                node.url && handleOpen(node.url);
              }}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                handleEdit(node as Bookmark);
              }}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(node.id);
                }}
                className="text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-bold">Bookmarks</h1>
          <p className="text-muted-foreground">
            {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            List
          </Button>
          <Button
            variant={viewMode === 'tree' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('tree')}
          >
            Folders
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search bookmarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === 'list' ? (
          // List View
          <div className="space-y-1">
            {filteredBookmarks.length === 0 ? (
              <div className="text-center py-12">
                <Star className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No bookmarks yet</h3>
                <p className="text-muted-foreground">
                  Click the star icon in the address bar to bookmark pages
                </p>
              </div>
            ) : (
              filteredBookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 group cursor-pointer"
                  onClick={() => handleOpen(bookmark.url)}
                >
                  {bookmark.favicon ? (
                    <img src={bookmark.favicon} alt="" className="w-5 h-5 rounded" />
                  ) : (
                    <Star className="w-5 h-5 text-yellow-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{bookmark.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{bookmark.url}</p>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {formatDate(bookmark.dateAdded)}
                  </span>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleOpen(bookmark.url);
                        }}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Open in new tab
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(bookmark);
                        }}>
                          <Edit2 className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(bookmark.id);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          // Tree View
          <div className="space-y-1">
            {bookmarkTree.length === 0 ? (
              <div className="text-center py-12">
                <Folder className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">No bookmarks yet</h3>
                <p className="text-muted-foreground">
                  Click the star icon in the address bar to bookmark pages
                </p>
              </div>
            ) : (
              bookmarkTree.map((node) => renderTreeNode(node))
            )}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bookmark</DialogTitle>
            <DialogDescription>
              Make changes to your bookmark here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Name</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Bookmark name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
