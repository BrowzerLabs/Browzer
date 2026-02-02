import { useState, useEffect, useCallback, useRef } from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';

import { Button } from '@/renderer/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/renderer/ui/popover';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/ui/tooltip';
import { cn } from '@/renderer/lib/utils';
import { CredentialSavePrompt } from '@/shared/types/password';

export function CredentialSavePopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [credentialPrompts, setCredentialPrompts] = useState<
    CredentialSavePrompt[]
  >([]);
  const [currentPrompt, setCurrentPrompt] =
    useState<CredentialSavePrompt | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const lastBrowserViewStateRef = useRef<boolean | null>(null);

  // Handle browser view layer
  useEffect(() => {
    if (lastBrowserViewStateRef.current === isOpen) {
      return;
    }
    lastBrowserViewStateRef.current = isOpen;

    if (isOpen) {
      window.browserAPI.bringBrowserViewToFront();
    } else {
      window.browserAPI.bringBrowserViewToBottom();
    }
  }, [isOpen]);

  // Listen for credential save prompts
  useEffect(() => {
    const unsubPrompt = window.passwordAPI.onSavePrompt(
      (prompt: CredentialSavePrompt) => {
        setCredentialPrompts((prev) => [...prev, prompt]);

        // Auto-open popover when first prompt arrives
        if (credentialPrompts.length === 0) {
          setCurrentPrompt(prompt);
          setUsername(prompt.username);
          setPassword(prompt.password);
          setIsOpen(true);
        }
      }
    );

    return () => {
      unsubPrompt();
    };
  }, [credentialPrompts.length]);

  // Update current prompt when prompts change
  useEffect(() => {
    if (credentialPrompts.length > 0 && !currentPrompt) {
      const prompt = credentialPrompts[0];
      setCurrentPrompt(prompt);
      setUsername(prompt.username);
      setPassword(prompt.password);
    } else if (credentialPrompts.length === 0) {
      setCurrentPrompt(null);
      setUsername('');
      setPassword('');
      setIsOpen(false);
    }
  }, [credentialPrompts, currentPrompt]);

  const handleSave = useCallback(async () => {
    if (!currentPrompt || !username.trim() || !password.trim()) return;

    setIsSaving(true);
    try {
      await window.passwordAPI.save({
        url: currentPrompt.url,
        hostname: currentPrompt.hostname,
        username,
        password,
        usernameField: currentPrompt.usernameField,
        passwordField: currentPrompt.passwordField,
      });

      // Remove current prompt and move to next
      setCredentialPrompts((prev) =>
        prev.filter((p) => p.id !== currentPrompt.id)
      );
      setCurrentPrompt(null);
    } catch (error) {
      console.error('Failed to save credential:', error);
    } finally {
      setIsSaving(false);
    }
  }, [currentPrompt, username, password]);

  const handleNever = useCallback(() => {
    if (!currentPrompt) return;

    // Remove current prompt and move to next
    setCredentialPrompts((prev) =>
      prev.filter((p) => p.id !== currentPrompt.id)
    );
    setCurrentPrompt(null);
  }, [currentPrompt]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);

      // If closing and there are prompts, clear them
      if (!open && credentialPrompts.length > 0) {
        setCredentialPrompts([]);
        setCurrentPrompt(null);
      }
    },
    [credentialPrompts.length]
  );

  const handleKeyClick = useCallback(() => {
    if (credentialPrompts.length > 0 && !isOpen) {
      setIsOpen(true);
    }
  }, [credentialPrompts.length, isOpen]);

  // Don't render if no prompts
  if (credentialPrompts.length === 0) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger onClick={handleKeyClick}>
            <div className="relative">
              <Key
                className={cn(
                  'w-4 h-4 transition-colors',
                  credentialPrompts.length > 0
                    ? 'text-primary animate-pulse'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              />
              {credentialPrompts.length > 1 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                  {credentialPrompts.length}
                </span>
              )}
            </div>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {credentialPrompts.length === 1
            ? 'Save password'
            : `${credentialPrompts.length} passwords to save`}
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80" align="end">
        {currentPrompt && (
          <div className="space-y-3">
            <div>
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Key className="w-4 h-4 text-primary" />
                Save password for {currentPrompt.hostname}?
              </h4>
              {credentialPrompts.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {credentialPrompts.length - 1} more password
                  {credentialPrompts.length - 1 > 1 ? 's' : ''} pending
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <Label htmlFor="credential-username" className="text-xs">
                  Username
                </Label>
                <Input
                  id="credential-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="Enter username"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="credential-password" className="text-xs">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="credential-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-8 text-sm pr-9"
                    placeholder="Enter password"
                  />
                  <Button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-8 w-8 hover:bg-transparent"
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <p className="text-xs text-muted-foreground truncate">
                {currentPrompt.url}
              </p>
            </div>

            <div className="flex justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNever}
                disabled={isSaving}
                className="h-7 text-xs"
              >
                Never
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !username.trim() || !password.trim()}
                className="h-7 text-xs"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
