import { useState, useEffect } from 'react';
import { useAuth } from '@/renderer/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/renderer/ui/avatar';
import { Separator } from '@/renderer/ui/separator';
import { Alert, AlertDescription } from '@/renderer/ui/alert';
import { 
  User, 
  Mail, 
  Calendar, 
  Shield, 
  Loader2, 
  Check,
  Trash2,
  CheckCircle2Icon
} from 'lucide-react';
import { toast } from 'sonner';

export default function Profile() {
  const { user, updateProfile, loading } = useAuth();
  
  const [display_name, setdisplay_name] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setdisplay_name(user.display_name || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!display_name.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateProfile({ display_name: display_name.trim() });
      
      if (result.success) {
        toast.success('Profile updated successfully');
        setIsEditing(false);
      } else {
        toast.error(result.error?.message || 'Failed to update profile');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-7 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
       <div className="max-w-4xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Profile
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            Manage your account settings and preferences
          </p>
        </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Update your personal details and profile picture
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24">
                <AvatarImage src={user.photo_url || undefined} />
                <AvatarFallback className="text-2xl bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400">
                  {getInitials(user.display_name || user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {user.display_name || 'No name set'}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {user.email}
                </p>
                <Button variant="outline" size="sm" className="mt-3" disabled>
                  Change Photo (Coming Soon)
                </Button>
              </div>
            </div>

            <Separator />

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="display_name"
                    value={display_name}
                    onChange={(e) => setdisplay_name(e.target.value)}
                    disabled={!isEditing || isSaving}
                    className="pl-10"
                    placeholder="Enter your name"
                  />
                </div>
                {!isEditing ? (
                  <Button onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || !display_name.trim()}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setdisplay_name(user.display_name || '');
                      }}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Email (Read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  value={user.email}
                  disabled
                  className="pl-10 bg-slate-50 dark:bg-slate-900"
                />
              </div>
              <p className="text-xs text-slate-500">
                Email cannot be changed. Contact support if needed.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Details about your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-800 last:border-0">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Member Since
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {formatDate(user.created_at)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-slate-200 dark:border-slate-800 last:border-0">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Email Verified
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {user.email_verified ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
              {user.email_verified && (
                <CheckCircle2Icon className="h-5 w-5 text-green-600" />
              )}
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    User ID
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">
                    {user.id.slice(0, 20)}...
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions for your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                These actions cannot be undone. Please proceed with caution.
              </AlertDescription>
            </Alert>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">
                  Delete Account
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Permanently delete your account and all data
                </p>
              </div>
              <Button
                variant="destructive"
                disabled
                className="opacity-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Account deletion is currently disabled. Contact support to delete your account.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
