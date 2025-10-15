import { useState, useEffect } from 'react';
import { Video, Clock, MousePointer2, ChevronDown, X } from 'lucide-react';
import type { RecordingSession } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/renderer/ui/popover';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import { cn } from '@/renderer/lib/utils';

interface RecordingSelectorProps {
  selectedRecording?: string;
  onSelect: (recordingId: string | undefined) => void;
  className?: string;
}

/**
 * Recording Selector Component
 * 
 * Allows users to select a recording session to provide context to the agent.
 * Displays recordings in a popover with key metadata.
 */
export function RecordingSelector({ selectedRecording, onSelect, className }: RecordingSelectorProps) {
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const data = await window.browserAPI.getAllRecordings();
      // Sort by creation date (newest first)
      const sorted = data.sort((a, b) => b.createdAt - a.createdAt);
      setRecordings(sorted);
    } catch (error) {
      console.error('Failed to load recordings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (recordingId: string) => {
    if (selectedRecording === recordingId) {
      // Deselect if already selected
      onSelect(undefined);
    } else {
      onSelect(recordingId);
    }
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(undefined);
  };

  const selectedRec = recordings.find(r => r.id === selectedRecording);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className={cn(
            "justify-between gap-2 font-normal w-full",
            selectedRecording && "border-primary bg-primary/10 dark:bg-primary/10",
            className
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Video className="size-3.5 shrink-0 text-primary" />
            {selectedRec ? (
              <span className="truncate text-primary">{selectedRec.name}</span>
            ) : (
              <span className="text-muted-foreground">Select recording context...</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedRecording && (
              <X
                className="size-3.5 hover:bg-muted rounded text-primary"
                onClick={handleClear}
              />
            )}
            <ChevronDown className="size-3.5 text-primary" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm">Select Recording Context</h4>
          <p className="text-xs text-muted-foreground mt-1">
            Choose a recording to provide workflow context to the agent
          </p>
        </div>
        
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading recordings...
            </div>
          ) : recordings.length === 0 ? (
            <div className="p-8 text-center">
              <Video className="size-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No recordings found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Record a workflow first to use as context
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {recordings.map((recording) => (
                <button
                  key={recording.id}
                  onClick={() => handleSelect(recording.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg hover:bg-muted transition-colors",
                    selectedRecording === recording.id && "bg-blue-50 dark:bg-blue-950 border border-blue-500"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h5 className="font-medium text-sm truncate flex-1">
                      {recording.name}
                    </h5>
                    {recording.videoPath && (
                      <Video className="size-3.5 text-blue-600 shrink-0" />
                    )}
                  </div>
                  
                  {recording.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {recording.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MousePointer2 className="size-3" />
                      {recording.actionCount} actions
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDuration(recording.duration)}
                    </div>
                    {recording.tabs && recording.tabs.length > 1 && (
                      <div className="text-xs">
                        {recording.tabs.length} tabs
                      </div>
                    )}
                  </div>
                  
                  {recording.url && (
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {recording.url}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

