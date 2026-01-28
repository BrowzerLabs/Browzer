import { RecordingSession } from '@/shared/types';
import {
  AutomationSession,
  AgentMode,
} from '@/renderer/stores/automationStore';

export interface AgentHeaderProps {
  agentMode: AgentMode;
  selectedRecordingId: string | null;
  recordings: RecordingSession[];
  currentSession: AutomationSession | null;
  onRecordingSelect: (recordingId: string | null) => void;
  onNewSession: () => void;
}

export interface AgentChatAreaProps {
  agentMode: AgentMode;
  currentSession: AutomationSession | null;
  selectedRecordingId: string | null;
}

export interface AgentFooterProps {
  userGoal: string;
  selectedRecordingId: string | null;
  isRunning: boolean;
  agentMode: AgentMode;
  onGoalChange: (goal: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onModeChange: (mode: AgentMode) => void;
}

export interface EventItemProps {
  event: any;
  isLatest?: boolean;
}
