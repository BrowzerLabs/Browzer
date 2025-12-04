import { useEffect, useState, useCallback } from 'react';
import { Search, Trash2, Star, Folder, ExternalLink, Edit2, MoreVertical, Loader2, FolderPlus, ChevronRight, ChevronDown, FolderInput } from 'lucide-react';
import type { Bookmark, BookmarkTreeNode } from '../../shared/types';
import { BOOKMARK_BAR_ID, OTHER_BOOKMARKS_ID } from '../../shared/types';
import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/renderer/ui/alert-dialog';
import { Label } from '@/renderer/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/ui/select';

export function Bookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkTreeNode[]>([]);
  const [filteredBookmarks, setFilteredBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set([BOOKMARK_BAR_ID, OTHER_BOOKMARKS_ID]));
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string>(BOOKMARK_BAR_ID);

  const [editFolderDialogOpen, setEditFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<BookmarkTreeNode | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [movingItem, setMovingItem] = useState<{ id: string; title: string; isFolder: boolean } | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>(BOOKMARK_BAR_ID);

  const [deleteFolderDialogOpen, setDeleteFolderDialogOpen] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState<BookmarkTreeNode | null>(null);

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

  const handleEdit = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setEditTitle(bookmark.title);
    setEditUrl(bookmark.url);
    setEditDialogOpen(true);
  };

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

  const handleOpen = async (url: string) => {
    try {
      await window.browserAPI.createTab(url);
    } catch (error) {
      console.error('Failed to open bookmark:', error);
      toast.error('Failed to open bookmark');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }

    try {
      await window.browserAPI.createBookmarkFolder({
        title: newFolderName.trim(),
        parentId: newFolderParent,
      });
      toast.success('Folder created');
      setCreateFolderDialogOpen(false);
      setNewFolderName('');
      setNewFolderParent(BOOKMARK_BAR_ID);
      loadBookmarks();
    } catch (error) {
      console.error('Failed to create folder:', error);
      toast.error('Failed to create folder');
    }
  };

  // Edit folder handlers
  const handleEditFolder = (folder: BookmarkTreeNode) => {
    setEditingFolder(folder);
    setEditFolderName(folder.title);
    setEditFolderDialogOpen(true);
  };

  const handleSaveFolderEdit = async () => {
    if (!editingFolder || !editFolderName.trim()) return;

    try {
      await window.browserAPI.updateBookmark({
        id: editingFolder.id,
        title: editFolderName.trim(),
      });
      toast.success('Folder renamed');
      setEditFolderDialogOpen(false);
      setEditingFolder(null);
      loadBookmarks();
    } catch (error) {
      console.error('Failed to rename folder:', error);
      toast.error('Failed to rename folder');
    }
  };

  // Delete folder handlers
  const handleDeleteFolderClick = (folder: BookmarkTreeNode) => {
    setDeletingFolder(folder);
    setDeleteFolderDialogOpen(true);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!deletingFolder) return;

    try {
      await window.browserAPI.deleteBookmark(deletingFolder.id);
      toast.success('Folder deleted');
      setDeleteFolderDialogOpen(false);
      setDeletingFolder(null);
      loadBookmarks();
    } catch (error) {
      console.error('Failed to delete folder:', error);
      toast.error('Failed to delete folder');
    }
  };

  // Move item handlers (works for both bookmarks and folders)
  const handleMoveClick = (item: { id: string; title: string; isFolder: boolean; parentId?: string | null }) => {
    setMovingItem({ id: item.id, title: item.title, isFolder: item.isFolder });
    setMoveTargetFolder(item.parentId || BOOKMARK_BAR_ID);
    setMoveDialogOpen(true);
  };

  const handleConfirmMove = async () => {
    if (!movingItem) return;

    try {
      await window.browserAPI.moveBookmark({
        id: movingItem.id,
        parentId: moveTargetFolder,
      });
      toast.success(`${movingItem.isFolder ? 'Folder' : 'Bookmark'} moved`);
      setMoveDialogOpen(false);
      setMovingItem(null);
      loadBookmarks();
    } catch (error) {
      console.error('Failed to move item:', error);
      toast.error('Failed to move item');
    }
  };

  // Get folders excluding the item being moved (to prevent moving into itself)
  const getAvailableFolders = (excludeId?: string) => {
    const folders: { id: string; title: string; depth: number }[] = [];
    
    const traverse = (node: BookmarkTreeNode, depth: number) => {
      if (node.isFolder && node.id !== excludeId) {
        folders.push({ id: node.id, title: node.title, depth });
        node.children?.forEach(child => traverse(child, depth + 1));
      }
    };
    
    bookmarkTree.forEach(node => traverse(node, 0));
    return folders;
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const getAllFolders = (nodes: BookmarkTreeNode[]): { id: string; title: string; depth: number }[] => {
    const folders: { id: string; title: string; depth: number }[] = [];
    
    const traverse = (node: BookmarkTreeNode, depth: number) => {
      if (node.isFolder) {
        folders.push({ id: node.id, title: node.title, depth });
        node.children?.forEach(child => traverse(child, depth + 1));
      }
    };
    
    nodes.forEach(node => traverse(node, 0));
    return folders;
  };

  const isRootFolder = (id: string) => id === BOOKMARK_BAR_ID || id === OTHER_BOOKMARKS_ID;

  const renderTreeNode = (node: BookmarkTreeNode, depth = 0) => {
    const isExpanded = expandedFolders.has(node.id);
    const isRoot = isRootFolder(node.id);
    
    if (node.isFolder) {
      return (
        <div key={node.id}>
          <div
            className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-muted/50 cursor-pointer select-none group"
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
            onClick={() => toggleFolder(node.id)}
          >
            <button className="p-0.5 hover:bg-muted rounded">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
            <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />
            <span className="font-medium truncate flex-1">{node.title}</span>
            <span className="text-xs text-muted-foreground flex-shrink-0 mr-2">
              {node.children?.filter(c => !c.isFolder).length || 0} bookmarks
            </span>
            {/* Folder actions menu */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    handleEditFolder(node);
                  }}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  {!isRoot && (
                    <>
                      <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        handleMoveClick({ id: node.id, title: node.title, isFolder: true, parentId: node.parentId });
                      }}>
                        <FolderInput className="w-4 h-4 mr-2" />
                        Move to...
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleDeleteFolderClick(node);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {isExpanded && node.children?.map((child) => renderTreeNode(child, depth + 1))}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 group cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 36}px` }}
        onClick={() => node.url && handleOpen(node.url)}
      >
        {node.favicon ? (
          <img src={node.favicon} alt="" className="w-4 h-4 rounded flex-shrink-0" />
        ) : (
          <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{node.title}</p>
          <p className="text-xs text-muted-foreground truncate">{node.url}</p>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                node.url && handleOpen(node.url);
              }}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleEdit(node as Bookmark);
              }}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleMoveClick({ id: node.id, title: node.title, isFolder: false, parentId: node.parentId });
              }}>
                <FolderInput className="w-4 h-4 mr-2" />
                Move to...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e: React.MouseEvent) => {
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

  const folders = getAllFolders(bookmarkTree);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Centered Container */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Bookmarks</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''} saved
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateFolderDialogOpen(true)}
                className="gap-2"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </Button>
              <div className="flex items-center rounded-lg border bg-muted/30 p-1">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-7 px-3"
                >
                  List
                </Button>
                <Button
                  variant={viewMode === 'tree' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('tree')}
                  className="h-7 px-3"
                >
                  Folders
                </Button>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search bookmarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/30"
              />
            </div>
          </div>

          <div className="rounded-lg border bg-card">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : viewMode === 'list' ? (
              // List View
              <div className="divide-y">
                {filteredBookmarks.length === 0 ? (
                  <div className="text-center py-16">
                    <Star className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No bookmarks yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Click the star icon in the address bar to bookmark pages
                    </p>
                  </div>
                ) : (
                  filteredBookmarks.map((bookmark) => (
                    <div
                      key={bookmark.id}
                      className="flex items-center gap-3 p-4 hover:bg-muted/50 group cursor-pointer transition-colors"
                      onClick={() => handleOpen(bookmark.url)}
                    >
                      {bookmark.favicon ? (
                        <img src={bookmark.favicon} alt="" className="w-5 h-5 rounded flex-shrink-0" />
                      ) : (
                        <Star className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{bookmark.title}</p>
                        <p className="text-sm text-muted-foreground truncate">{bookmark.url}</p>
                      </div>
                      <span className="text-xs text-muted-foreground hidden sm:block flex-shrink-0">
                        {formatDate(bookmark.dateAdded)}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              handleOpen(bookmark.url);
                            }}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              Open in new tab
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              handleEdit(bookmark);
                            }}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              handleMoveClick({ id: bookmark.id, title: bookmark.title, isFolder: false, parentId: bookmark.parentId });
                            }}>
                              <FolderInput className="w-4 h-4 mr-2" />
                              Move to...
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e: React.MouseEvent) => {
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
              <div className="p-2">
                {bookmarkTree.length === 0 ? (
                  <div className="text-center py-16">
                    <Folder className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No bookmarks yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Click the star icon in the address bar to bookmark pages
                    </p>
                  </div>
                ) : (
                  bookmarkTree.map((node) => renderTreeNode(node))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
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

      {/* Create Folder Dialog */}
      <Dialog open={createFolderDialogOpen} onOpenChange={setCreateFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Create a folder to organize your bookmarks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="My Folder"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-parent">Location</Label>
              <Select value={newFolderParent} onValueChange={setNewFolderParent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a folder" />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <span style={{ paddingLeft: `${folder.depth * 12}px` }}>
                        {folder.title}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCreateFolderDialogOpen(false);
              setNewFolderName('');
              setNewFolderParent(BOOKMARK_BAR_ID);
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create Folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Folder Dialog */}
      <Dialog open={editFolderDialogOpen} onOpenChange={setEditFolderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-folder-name">Folder Name</Label>
              <Input
                id="edit-folder-name"
                value={editFolderName}
                onChange={(e) => setEditFolderName(e.target.value)}
                placeholder="Folder name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditFolderDialogOpen(false);
              setEditingFolder(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveFolderEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move {movingItem?.isFolder ? 'Folder' : 'Bookmark'}</DialogTitle>
            <DialogDescription>
              Choose a new location for "{movingItem?.title}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Destination Folder</Label>
              <Select value={moveTargetFolder} onValueChange={setMoveTargetFolder}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a folder" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableFolders(movingItem?.isFolder ? movingItem.id : undefined).map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-yellow-500" />
                        <span style={{ paddingLeft: `${folder.depth * 12}px` }}>
                          {folder.title}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setMoveDialogOpen(false);
              setMovingItem(null);
            }}>
              Cancel
            </Button>
            <Button onClick={handleConfirmMove}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Confirmation */}
      <AlertDialog open={deleteFolderDialogOpen} onOpenChange={setDeleteFolderDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingFolder?.title}"? 
              {deletingFolder?.children && deletingFolder.children.length > 0 && (
                <span className="block mt-2 font-medium text-destructive">
                  This folder contains {deletingFolder.children.length} item(s) that will also be deleted.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteFolderDialogOpen(false);
              setDeletingFolder(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteFolder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
