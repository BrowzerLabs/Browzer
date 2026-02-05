import { useState } from 'react';
import { X, Eye, EyeOff, Key } from 'lucide-react';

import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import { CredentialSavePrompt } from '@/shared/types/password';

interface CredentialSaveDialogProps {
  prompt: CredentialSavePrompt;
  onDismiss: (promptId: string) => void;
}

export function CredentialSaveDialog({
  prompt,
  onDismiss,
}: CredentialSaveDialogProps) {
  const [username, setUsername] = useState(prompt.username);
  const [password, setPassword] = useState(prompt.password);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) return;

    setIsSaving(true);
    try {
      await window.passwordAPI.save({
        url: prompt.url,
        hostname: prompt.hostname,
        username,
        password,
        usernameField: prompt.usernameField,
        passwordField: prompt.passwordField,
      });
      onDismiss(prompt.id);
    } catch (error) {
      console.error('Failed to save credential:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-4 mb-3 animate-in slide-in-from-top-2">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Key className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-sm text-foreground">
              Save password for {prompt.hostname}?
            </h3>
          </div>
        </div>
        <Button
          onClick={() => onDismiss(prompt.id)}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 mb-4">
        <div className="space-y-1.5">
          <Label htmlFor={`username-${prompt.id}`} className="text-xs">
            Username
          </Label>
          <Input
            id={`username-${prompt.id}`}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-9 text-sm"
            placeholder="Enter username"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`password-${prompt.id}`} className="text-xs">
            Password
          </Label>
          <div className="relative">
            <Input
              id={`password-${prompt.id}`}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 text-sm pr-10"
              placeholder="Enter password"
            />
            <Button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-9 w-9 hover:bg-transparent"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={isSaving || !username.trim() || !password.trim()}
          className="flex-1"
          size="sm"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          onClick={() => onDismiss(prompt.id)}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          Never
        </Button>
      </div>
    </div>
  );
}
