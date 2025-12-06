import { useState, useEffect, useCallback, KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X, Lock, Globe, Circle, Square, Settings, Clock, User, MoreVertical, Video, ChevronRight, ChevronLeft, Loader2, LogOut, DiamondIcon, Download, Pause, Play, XCircle } from 'lucide-react';
import type { TabInfo } from '@/shared/types';
import { cn, formatBytes } from '@/renderer/lib/utils';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import { useRecording } from '@/renderer/hooks/useRecording';
import { useAuth } from '@/renderer/hooks/useAuth';
import { useUpdateProgress } from '@/renderer/hooks/useUpdateProgress';
import { useDownloads } from '@/renderer/hooks/useDownloads';
import { Progress } from '@/renderer/ui/progress';
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
import { AddressBar } from '@/renderer/components/AddressBar';

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
  const [downloadsOpen, setDownloadsOpen] = useState(false);

  const openDownloadsMenu = useCallback(() => {
    window.browserAPI.bringBrowserViewToFront();
    setDownloadsOpen(true);
  }, []);

  const { activeCount, downloads, pauseDownload, resumeDownload, cancelDownload } = useDownloads({
    notify: true,
    onNewDownload: () => openDownloadsMenu(),
  });

  const handleSignOut = async () => {
    await signOut();
  };

  const isSecure = activeTab?.url.startsWith('https://') ?? false;

  return (
    <div className="flex items-center h-12 px-3 gap-2 bg-background">
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

      {isDownloading && (
        <div className="relative">
          <Button 
            variant="outline" 
            size="icon"
            disabled
            title={`Downloading update v${version} - ${Math.round(progress)}%`}
            className="relative overflow-hidden"
          >
            <Download className="w-4 h-4 text-blue-500 z-10" />
            {/* Circular progress indicator */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${progress} 100`}
                className="text-blue-500 transition-all duration-300"
              />
            </svg>
          </Button>
        </div>
      )}

      {/* Downloads quick access */}
      <DropdownMenu open={downloadsOpen} onOpenChange={(open) => {
        setDownloadsOpen(open);
        if (open) {
          void window.browserAPI.bringBrowserViewToFront();
        } else {
          void window.browserAPI.bringBrowserViewToBottom();
        }
      }}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            title="Downloads"
            className="relative"
            onClick={openDownloadsMenu}
          >
            <Download className="w-4 h-4" />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white px-1">
                {activeCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Downloads</span>
            <button
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => {
                setDownloadsOpen(false);
                void window.browserAPI.bringBrowserViewToBottom();
                setTimeout(() => onNavigate('browzer://downloads'), 0);
              }}
            >
              View all
            </button>
          </div>
          <div className="space-y-2 max-h-80 overflow-auto pr-1">
            {downloads.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
                No downloads yet
              </div>
            ) : (
              downloads.map((item) => {
                const percent = Math.round((item.progress || 0) * 100);
                const isActive = item.state === 'progressing';
                const isPaused = item.state === 'paused';
                const isDone = item.state === 'completed';
                const isCancelled = item.state === 'cancelled';
                const isFailed = item.state === 'failed' || item.state === 'interrupted';
                const isTerminal = isDone || isCancelled || isFailed;
                return (
                  <div key={item.id} className="border border-gray-200 dark:border-slate-800 rounded-md p-2 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                          {item.fileName}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {item.state === 'completed'
                            ? 'Completed'
                            : item.state === 'paused'
                            ? 'Paused'
                            : isFailed
                            ? 'Failed'
                            : isCancelled
                            ? 'Cancelled'
                            : 'In progress'}
                          {!isCancelled && (
                            <>
                              {' '}• {formatBytes(item.receivedBytes)} of {item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Unknown'} ({percent}%)
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isActive && (
                          <button
                            title="Pause"
                            onClick={() => pauseDownload(item.id)}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {isPaused && (
                          <button
                            title="Resume"
                            onClick={() => resumeDownload(item.id)}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {isPaused && (
                          <button
                            title="Resume"
                            onClick={() => resumeDownload(item.id)}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {isActive && (
                          <button
                            title="Cancel"
                            onClick={() => cancelDownload(item.id)}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {!isTerminal && (
                      <Progress value={percent} className="h-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

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

      <ThemeToggle />

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
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) {
            void window.browserAPI.bringBrowserViewToFront();
          } else {
            void window.browserAPI.bringBrowserViewToBottom();
          }
        }}
      >
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
          <DropdownMenuItem onClick={() => onNavigate('browzer://subscription')}>
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
