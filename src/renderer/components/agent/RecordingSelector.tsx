import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
import { Badge } from '@/renderer/ui/badge';
import { RecordingSession } from '@/shared/types';

interface RecordingSelectorProps {
  sessions: RecordingSession[];
  selectedSession: string;
  onSessionChange: (sessionId: string) => void;
  disabled?: boolean;
}

export function RecordingSelector({
  sessions,
  selectedSession,
  onSessionChange,
  disabled = false
}: RecordingSelectorProps) {
  return (
    <Select value={selectedSession} onValueChange={onSessionChange} disabled={disabled}>
      <SelectTrigger className="w-full h-8 text-xs">
        <SelectValue placeholder="Select a recording..." />
      </SelectTrigger>
      <SelectContent>
        {sessions.length === 0 ? (
          <div className="p-2 text-xs text-gray-500 text-center">
            No recordings available
          </div>
        ) : (
          sessions.map((session) => (
            <SelectItem key={session.id} value={session.id}>
              <div className="flex items-center gap-2">
                <span className="truncate text-xs">{session.name}</span>
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  {session.actionCount}
                </Badge>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
