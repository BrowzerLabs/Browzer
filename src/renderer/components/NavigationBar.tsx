import { useState, useEffect, KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Lock, Globe, Circle, Square, Settings, Clock, User, MoreVertical, Video, ChevronRight, ChevronLeft, Loader2, LogOut } from 'lucide-react';
import type { TabInfo } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import { useRecording } from '@/renderer/hooks/useRecording';
import { useAuth } from '@/renderer/hooks/useAuth';
import { Input } from '@/renderer/ui/input';
import ThemeToggle from '@/renderer/ui/theme-toggle';
import { Button } from '@/renderer/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/renderer/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';

interface NavigationBarProps {
  activeTab: TabInfo | null;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
}

export function NavigationBar({
  activeTab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onStop,
}: NavigationBarProps) {
  const [urlInput, setUrlInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const { isVisible: isSidebarVisible, toggleSidebar } = useSidebarStore();
  const { isRecording, isLoading, toggleRecording } = useRecording();
  const { user, signOut, loading } = useAuth();

  // Update URL input when active tab changes
  useEffect(() => {
    if (activeTab && !isEditing) {
      setUrlInput(activeTab.url);
    }
  }, [activeTab, isEditing]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onNavigate(urlInput);
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setUrlInput(activeTab?.url || '');
      setIsEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const isSecure = activeTab?.url.startsWith('https://');

  return (
    <div className="flex items-center h-12 px-3 gap-2">
      {/* Navigation Buttons */}
      <div className="flex items-center gap-1">
        <NavButton
          onClick={onBack}
          disabled={!activeTab?.canGoBack}
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </NavButton>

        <NavButton
          onClick={onForward}
          disabled={!activeTab?.canGoForward}
          title="Forward"
        >
          <ArrowRight className="w-4 h-4" />
        </NavButton>

        <NavButton
          onClick={activeTab?.isLoading ? onStop : onReload}
          disabled={!activeTab}
          title={activeTab?.isLoading ? 'Stop' : 'Reload'}
        >
          {activeTab?.isLoading ? (
            <X className="w-4 h-4" />
          ) : (
            <RotateCw className="w-4 h-4" />
          )}
        </NavButton>
      </div>

      {/* Address Bar */}
      <div className="flex-1 flex items-center rounded-lg pl-3 h-9 gap-2">
        {/* Security Icon */}
        <div className="flex-shrink-0">
          {isSecure ? (
            <Lock className="w-4 h-4 text-green-500" />
          ) : (
            <Globe className="w-4 h-4 text-gray-500" />
          )}
        </div>

        {/* URL Input */}
        <Input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={handleKeyDown}
          placeholder="Search or enter address"
          className="rounded-full focus-visible:ring-1 focus-visible:ring-gray-300 focus-visible:border-gray-300"
        />
      </div>

      {/* Record Button */}
      <Button 
        variant="outline" 
        size="icon" 
        onClick={toggleRecording}
        disabled={isLoading}
        title={isLoading ? 'Processing...' : isRecording ? 'Stop Recording' : 'Start Recording'}
        className={cn(
          isRecording && 'border-red-500 bg-red-50 dark:bg-red-950',
          isLoading && 'opacity-70'
        )}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-red-500" />
        ) : isRecording ? (
          <Square className="w-4 h-4 fill-red-600 animate-pulse" />
        ) : (
          <Circle className="w-4 h-4 text-red-500" />
        )}
      </Button>

      {/* Theme Toggle */}
      <ThemeToggle />

      {/* Sidebar Toggle Button */}
      <Button 
        variant="outline" 
        size="icon" 
        onClick={toggleSidebar} 
        title={isSidebarVisible ? 'Hide Agent Panel' : 'Show Agent Panel'}
      >
        {isSidebarVisible ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </Button>

      {/* Menu Dropdown */}
      {
        isSidebarVisible && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" title="More options">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => onNavigate('browzer://profile')}>
                <Avatar className="size-7">
                  <AvatarImage src={user?.photo_url || undefined} />
                  <AvatarFallback className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-sm">
                    {user?.display_name 
                      ? user.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                      : user?.email?.slice(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                {user?.display_name || 'Profile'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onNavigate('browzer://settings')}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNavigate('browzer://history')}>
                <Clock className="w-4 h-4 mr-2" />
                History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onNavigate('browzer://recordings')}>
                <Video className="w-4 h-4 mr-2" />
                Recordings
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={() => onNavigate('browzer://automation')}>
                <Clock className="w-4 h-4 mr-2" />
                Automation
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleSignOut}
                disabled={loading}
                variant='destructive'
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4 mr-2" />
                )}
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    </div>
  );
}

interface NavButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function NavButton({ onClick, disabled, title, children }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors',
        disabled && 'opacity-30 cursor-not-allowed hover:bg-transparent'
      )}
    >
      {children}
    </button>
  );
}
