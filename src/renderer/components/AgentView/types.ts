/**
 * AgentView Component Types
 * 
 * Local types specific to the AgentView component tree
 */

import { AutomationProgressEvent, RecordingSession } from '@/shared/types';
import { AutomationSession, SessionListItem } from '@/renderer/stores/automationStore';

/**
 * View mode for AgentView
 */
export type AgentViewMode = 'new_session' | 'existing_session';

/**
 * Props for AgentHeader
 */
export interface AgentHeaderProps {
  viewMode: AgentViewMode;
  selectedRecordingId: string | null;
  recordings: RecordingSession[];
  currentSession: AutomationSession | null;
  onRecordingSelect: (recordingId: string | null) => void;
  onNewSession: () => void;
  isDisabled: boolean;
}

/**
 * Props for AgentChatArea
 */
export interface AgentChatAreaProps {
  viewMode: AgentViewMode;
  currentSession: AutomationSession | null;
  sessionHistory: SessionListItem[];
  isLoadingSession: boolean;
  isLoadingHistory: boolean;
  onSessionSelect: (sessionId: string) => void;
}

/**
 * Props for AgentFooter
 */
export interface AgentFooterProps {
  userPrompt: string;
  selectedRecordingId: string | null;
  isSubmitting: boolean;
  isDisabled: boolean;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

/**
 * Props for SessionHistory
 */
export interface SessionHistoryProps {
  sessions: SessionListItem[];
  isLoading: boolean;
  onSessionSelect: (sessionId: string) => void;
}

/**
 * Props for Event Items
 */
export interface EventItemProps {
  event: AutomationProgressEvent;
  isLatest?: boolean;
}
