/**
 * AgentHeader Component
 * 
 * Header section with:
 * - Recording session selector (disabled in existing session)
 * - New session button (visible in existing session)
 * - Status badge
 */

import React from 'react';
import { Plus, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/ui/select';
import { Button } from '@/renderer/ui/button';
import { AgentHeaderProps } from './types';

export function AgentHeader({
  viewMode,
  selectedRecordingId,
  recordings,
  currentSession,
  onRecordingSelect,
  onNewSession,
  isDisabled,
}: AgentHeaderProps) {
  const isExistingSession = viewMode === 'existing_session';
  
  // Find the selected recording to display only its name in the trigger
  const selectedRecording = recordings.find(r => r.id === selectedRecordingId);

  return (
    <div className="flex items-center justify-between border-b bg-background/50 backdrop-blur-sm px-4 py-2 z-16 sticky top-0">
        <div className="flex items-center gap-3">
           <Select
            value={selectedRecordingId || undefined}
            onValueChange={onRecordingSelect}
            disabled={isDisabled || isExistingSession}
          >
            <SelectTrigger className='w-64 max-w-xs h-auto min-h-9'>
              <SelectValue placeholder="Select a recorded session...">
                {selectedRecording && (
                  <span className="truncate block">{selectedRecording.name}</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="bottom" className="w-96 max-w-screen">
              {recordings.map((recording) => (
                <SelectItem key={recording.id} value={recording.id}>
                  <div className="flex flex-col items-start gap-1 w-80">
                    <span className="font-medium truncate w-full">{recording.name}</span>
                    {recording.description && (
                      <span className="text-xs text-muted-foreground truncate w-full">
                        {recording.description}
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {currentSession && (
            <span>
              {currentSession.status === 'running' && <Loader2 className="size-4 animate-spin text-primary" />}
              {currentSession.status === 'completed' && <CheckCircle2 className="size-4 text-teal-600"  />}
              {currentSession.status === 'error' && <XCircle className="size-4 text-red-600" />}
            </span>
          )}
        </div>
        <Button
            variant="ghost"
            size="icon"
            onClick={onNewSession}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
        </Button>
    </div>
  );
}
