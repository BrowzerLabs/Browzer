import { useState, useEffect } from 'react';
import {
  Search,
  Eye,
  Trash2,
  Edit2,
  Download,
  Key,
  Globe,
  MoreVertical,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import { Card } from '@/renderer/ui/card';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';
import { CopyableInput } from '@/renderer/components/common/CopyableInput';
import { Checkbox } from '@/renderer/ui/checkbox';
import { PasswordCredential } from '@/shared/types';

interface PasswordStats {
  totalPasswords: number;
  mostUsedSites: Array<{ url: string; count: number }>;
}

export function PasswordSettings() {
  const [passwords, setPasswords] = useState<PasswordCredential[]>([]);
  const [filteredPasswords, setFilteredPasswords] = useState<
    PasswordCredential[]
  >([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPasswords, setSelectedPasswords] = useState<Set<string>>(
    new Set()
  );
  const [stats, setStats] = useState<PasswordStats | null>(null);

  // Dialog states
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    credential: PasswordCredential | null;
    username: string;
    password: string;
  }>({
    open: false,
    credential: null,
    username: '',
    password: '',
  });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    ids: string[];
  }>({
    open: false,
    ids: [],
  });
  const [viewPasswordDialog, setViewPasswordDialog] = useState<{
    open: boolean;
    id: string;
    password: string;
  }>({
    open: false,
    id: '',
    password: '',
  });

  useEffect(() => {
    loadPasswords();
    loadStats();
  }, []);

  useEffect(() => {
    if (searchQuery.trim()) {
      window.passwordAPI.search(searchQuery).then(setFilteredPasswords);
    } else {
      setFilteredPasswords(passwords);
    }
  }, [searchQuery, passwords]);

  const loadPasswords = async () => {
    try {
      const allPasswords = await window.passwordAPI.getAll();
      setPasswords(allPasswords);
      setFilteredPasswords(allPasswords);
    } catch (error) {
      console.error('Failed to load passwords:', error);
      toast.error('Failed to load passwords');
    }
  };

  const loadStats = async () => {
    try {
      const allPasswords = await window.passwordAPI.getAll();
      const passwordStats: PasswordStats = {
        totalPasswords: allPasswords.length,
        mostUsedSites: allPasswords
          .sort((a, b) => (b.timesUsed || 0) - (a.timesUsed || 0))
          .slice(0, 5)
          .map((p) => ({ url: p.url, count: p.timesUsed || 0 })),
      };
      setStats(passwordStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleDelete = async (ids: string[]) => {
    try {
      for (const id of ids) {
        await window.passwordAPI.delete(id);
      }

      toast.success(
        `Deleted ${ids.length} password${ids.length > 1 ? 's' : ''}`
      );
      setSelectedPasswords(new Set());
      setDeleteDialog({ open: false, ids: [] });
      await loadPasswords();
      await loadStats();
    } catch (error) {
      console.error('Failed to delete passwords:', error);
      toast.error('Failed to delete passwords');
    }
  };

  const handleViewPassword = async (id: string) => {
    try {
      const credential = await window.passwordAPI.get(id);
      if (credential) {
        setViewPasswordDialog({
          open: true,
          id,
          password: credential.password,
        });
      }
    } catch (error) {
      console.error('Failed to get password:', error);
      toast.error('Failed to retrieve password');
    }
  };

  const handleEditPassword = async (credential: PasswordCredential) => {
    try {
      const fullCredential = await window.passwordAPI.get(credential.id);
      if (fullCredential) {
        setEditDialog({
          open: true,
          credential,
          username: fullCredential.username,
          password: fullCredential.password,
        });
      }
    } catch (error) {
      console.error('Failed to get password for editing:', error);
      toast.error('Failed to retrieve password');
    }
  };

  const handleSavePassword = async () => {
    if (!editDialog.credential) return;

    try {
      await window.passwordAPI.update(editDialog.credential.id, {
        username: editDialog.username,
        password: editDialog.password,
      });

      toast.success('Password updated successfully');
      setEditDialog({
        open: false,
        credential: null,
        username: '',
        password: '',
      });
      await loadPasswords();
      await loadStats();
    } catch (error) {
      console.error('Failed to save password:', error);
      toast.error('Failed to save password');
    }
  };

  const handleExport = async () => {
    try {
      const data = await window.passwordAPI.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `browzer-passwords-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Passwords exported successfully');
    } catch (error) {
      console.error('Failed to export passwords:', error);
      toast.error('Failed to export passwords');
    }
  };

  const toggleSelectPassword = (id: string) => {
    const newSelected = new Set(selectedPasswords);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPasswords(newSelected);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Passwords</h2>
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Passwords</p>
                <p className="text-lg font-semibold">{stats.totalPasswords}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/10 text-blue-500 flex h-10 w-10 items-center justify-center rounded-lg">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Most Used</p>
                <p className="text-lg font-medium truncate">
                  {stats.mostUsedSites[0]?.url
                    ? getDomain(stats.mostUsedSites[0].url)
                    : 'None'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Search and Actions */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search passwords by site or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>

        {selectedPasswords.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() =>
              setDeleteDialog({
                open: true,
                ids: Array.from(selectedPasswords),
              })
            }
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete ({selectedPasswords.size})
          </Button>
        )}
      </div>

      {/* Passwords List */}
      <Card>
        <ScrollArea className="h-[240px]">
          <div className="divide-y">
            {filteredPasswords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Key className="text-muted-foreground mb-4 h-12 w-12" />
                <h3 className="text-lg font-semibold">No passwords saved</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Passwords you save will appear here
                </p>
              </div>
            ) : (
              filteredPasswords.map((credential) => (
                <div
                  key={credential.id}
                  className="hover:bg-accent/50 flex items-center gap-4 p-4 transition-colors"
                >
                  <Checkbox
                    checked={selectedPasswords.has(credential.id)}
                    onCheckedChange={() => toggleSelectPassword(credential.id)}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                      <span className="font-medium truncate">
                        {getDomain(credential.url)}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1 flex items-center gap-4 text-sm">
                      <span className="truncate">{credential.username}</span>
                      {credential.lastUsed && (
                        <>
                          <span>•</span>
                          <span>
                            Last used {formatDate(credential.lastUsed)}
                          </span>
                        </>
                      )}
                      {credential.timesUsed > 1 && (
                        <>
                          <span>•</span>
                          <span>Used {credential.timesUsed} times</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewPassword(credential.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleViewPassword(credential.id)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleEditPassword(credential)}
                        >
                          <Edit2 className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            setDeleteDialog({
                              open: true,
                              ids: [credential.id],
                            })
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* View Password Dialog */}
      <Dialog
        open={viewPasswordDialog.open}
        onOpenChange={(open) =>
          setViewPasswordDialog({ ...viewPasswordDialog, open })
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>View Password</DialogTitle>
            <DialogDescription>
              Copy your password to clipboard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <CopyableInput
              value={viewPasswordDialog.password}
              label="Password"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                setViewPasswordDialog({ open: false, id: '', password: '' })
              }
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Password Dialog */}
      <Dialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog({ ...editDialog, open })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Password</DialogTitle>
            <DialogDescription>
              Update your password for{' '}
              {editDialog.credential?.url
                ? getDomain(editDialog.credential.url)
                : 'this site'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Username</label>
              <Input
                value={editDialog.username}
                onChange={(e) =>
                  setEditDialog({ ...editDialog, username: e.target.value })
                }
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Password</label>
              <Input
                value={editDialog.password}
                onChange={(e) =>
                  setEditDialog({ ...editDialog, password: e.target.value })
                }
                placeholder="Enter new password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setEditDialog({
                  open: false,
                  credential: null,
                  username: '',
                  password: '',
                })
              }
            >
              Cancel
            </Button>
            <Button onClick={handleSavePassword}>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <DialogContent className="max-w-96">
          <DialogHeader>
            <DialogTitle>
              Delete Password{deleteDialog.ids.length > 1 ? 's' : ''}?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.{' '}
              {deleteDialog.ids.length > 1
                ? `This will permanently delete ${deleteDialog.ids.length} passwords.`
                : 'This will permanently delete this password.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, ids: [] })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(deleteDialog.ids)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
