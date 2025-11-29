import { AutomationProgressEvent, RecordingSession } from '@/shared/types';
import { AutomationSession, SessionListItem } from '@/renderer/stores/automationStore';

export type AgentViewMode = 'new_session' | 'existing_session';
export type AgentMode = 'ask' | 'automate';

export interface AgentHeaderProps {
  viewMode: AgentViewMode;
  selectedRecordingId: string | null;
  recordings: RecordingSession[];
  currentSession: AutomationSession | null;
  onRecordingSelect: (recordingId: string | null) => void;
  onNewSession: () => void;
  isDisabled: boolean;
}

export interface AgentChatAreaProps {
  agentMode: AgentMode;
  viewMode: AgentViewMode;
  currentSession: AutomationSession | null;
  sessionHistory: SessionListItem[];
  isLoadingSession: boolean;
  isLoadingHistory: boolean;
  onSessionSelect: (sessionId: string) => void;
}

export interface AgentFooterProps {
  userPrompt: string;
  selectedRecordingId: string | null;
  isSubmitting: boolean;
  isDisabled: boolean;
  agentMode: AgentMode;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onModeChange: (mode: AgentMode) => void;
}

export interface SessionHistoryProps {
  sessions: SessionListItem[];
  isLoading: boolean;
  onSessionSelect: (sessionId: string) => void;
}

export interface EventItemProps {
  event: AutomationProgressEvent;
  isLatest?: boolean;
}
