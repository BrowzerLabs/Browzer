import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  Circle,
  Settings,
  MoreVertical,
  Video,
  ChevronRight,
  ChevronLeft,
  Loader2,
  LogOut,
  DiamondIcon,
  Download,
  Bookmark,
  Clock,
} from 'lucide-react';

import type { TabInfo } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import { useRecording } from '@/renderer/hooks/useRecording';
import { useAuth } from '@/renderer/hooks/useAuth';
import { useUpdateProgress } from '@/renderer/hooks/useUpdateProgress';
import { useBrowserViewLayer } from '@/renderer/hooks/useBrowserViewLayer';
import ThemeToggle from '@/renderer/ui/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/renderer/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';
import { AddressBar } from '@/renderer/components/AddressBar';
import { DownloadsDropdown } from '@/renderer/components/DownloadsDropdown';
import { BookmarkButton } from '@/renderer/components/BookmarkButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/renderer/ui/tooltip';

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
  const { isVisible: isSidebarVisible, toggleSidebar } = useSidebarStore();
  const { isRecording, isLoading, toggleRecording } = useRecording();
  const { user, signOut, loading } = useAuth();
  const { isDownloading, progress, version } = useUpdateProgress();
  const { createOverlayHandler } = useBrowserViewLayer();

  const handleSignOut = async () => {
    await signOut();
  };

  const isSecure = activeTab?.url.startsWith('https://') ?? false;

  return (
    <div className="flex items-center h-10 px-3 gap-2 bg-background">
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

      <AddressBar
        currentUrl={activeTab?.url || ''}
        isSecure={isSecure}
        onNavigate={onNavigate}
      />

      <BookmarkButton
        url={activeTab?.url || ''}
        title={activeTab?.title || ''}
        favicon={activeTab?.favicon}
      />

      {isDownloading && (
        <Tooltip>
          <TooltipTrigger>
            <p className="text-xs font-bold">{progress}%</p>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              Downloading update v{version} - {progress}%
            </p>
          </TooltipContent>
        </Tooltip>
      )}

      <DownloadsDropdown onNavigate={onNavigate} />

      <Tooltip>
        <TooltipTrigger
          onClick={toggleRecording}
          disabled={isLoading}
          title={
            isLoading
              ? 'Processing...'
              : isRecording
                ? 'Stop Recording'
                : 'Start Recording'
          }
          className={cn(
            'bg-red-50 dark:bg-red-950 p-2 rounded-full',
            isRecording && 'border-red-500',
            isLoading && 'opacity-70'
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-red-500" />
          ) : isRecording ? (
            <Circle className="w-4 h-4 fill-red-600 animate-pulse" />
          ) : (
            <Circle className="w-4 h-4 text-red-500" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </TooltipContent>
      </Tooltip>

      <ThemeToggle className="bg-blue-50 dark:bg-blue-950 p-2 rounded-full" />

      <Tooltip>
        <TooltipTrigger
          onClick={toggleSidebar}
          className="bg-blue-50 dark:bg-blue-950 p-2 rounded-full"
          title={isSidebarVisible ? 'Hide Agent Panel' : 'Show Agent Panel'}
        >
          {isSidebarVisible ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {isSidebarVisible ? 'Hide Agent Panel' : 'Show Agent Panel'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenu onOpenChange={createOverlayHandler('nav-more-menu')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger
              className="bg-blue-50 dark:bg-blue-950 p-2 rounded-full size-8"
              asChild
            >
              <MoreVertical />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>More options</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => onNavigate('browzer://profile')}>
            <Avatar className="size-7">
              <AvatarImage src={user?.photo_url || undefined} />
              <AvatarFallback className="bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-sm">
                {user?.display_name
                  ? user.display_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2)
                  : user?.email?.slice(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            {user?.display_name || 'Profile'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onNavigate('browzer://subscription')}
          >
            <DiamondIcon className="w-4 h-4 mr-2" />
            Subscription
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
          <DropdownMenuItem onClick={() => onNavigate('browzer://downloads')}>
            <Download className="w-4 h-4 mr-2" />
            Downloads
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate('browzer://bookmarks')}>
            <Bookmark className="w-4 h-4 mr-2" />
            Bookmarks
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onNavigate('browzer://recordings')}>
            <Video className="w-4 h-4 mr-2" />
            Recordings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            disabled={loading}
            variant="destructive"
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
