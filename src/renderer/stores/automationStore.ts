import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  AutomationEventType,
  AutomationProgressEvent,
  AutomationStatus,
} from '@/shared/types';

export type AgentMode = 'ask' | 'automate' | 'autopilot';

export interface AutomationEventItem {
  id: string;
  sessionId: string;
  type: AutomationEventType;
  data: any;
  timestamp: number;
}

export interface AutomationSession {
  sessionId: string;
  userGoal: string;
  recordingId: string | null;
  agentMode: AgentMode;
  status: AutomationStatus;
  events: AutomationEventItem[];
  result?: any;
  error?: string;
  startTime: number;
  endTime?: number;
}

interface AutomationStore {
  agentMode: AgentMode;
  currentSession: AutomationSession | null;
  selectedRecordingId: string | null;
  userGoal: string;

  setAgentMode: (mode: AgentMode) => void;
  setSelectedRecording: (recordingId: string | null) => void;
  setUserGoal: (goal: string) => void;

  startSession: (
    userGoal: string,
    agentMode: AgentMode,
    recordingId: string | null,
    sessionId: string
  ) => void;
  addEvent: (sessionId: string, event: AutomationProgressEvent) => void;
  updateSessionStatus: (
    sessionId: string,
    status: AutomationStatus,
    result?: any,
    error?: string
  ) => void;
  clearSession: () => void;
}

export const useAutomationStore = create<AutomationStore>()(
  persist(
    (set, get) => ({
      agentMode: 'automate',
      currentSession: null,
      selectedRecordingId: null,
      userGoal: '',

      setAgentMode: (mode) => {
        set({ agentMode: mode });
      },

      setSelectedRecording: (recordingId) => {
        set({ selectedRecordingId: recordingId });
      },

      setUserGoal: (goal) => {
        set({ userGoal: goal });
      },

      startSession: (userGoal, agentMode, recordingId, sessionId) => {
        const newSession: AutomationSession = {
          sessionId,
          userGoal,
          recordingId,
          agentMode,
          status: AutomationStatus.RUNNING,
          events: [],
          startTime: Date.now(),
        };

        set({
          currentSession: newSession,
          userGoal: '',
          selectedRecordingId: agentMode === 'automate' ? recordingId : null,
        });
      },

      addEvent: (sessionId, event) => {
        const { currentSession } = get();

        if (!currentSession || sessionId !== currentSession.sessionId) return;

        if (event.type === 'step_complete' || event.type === 'step_error') {
          const toolUseId = event.data.toolUseId;
          const existingIndex = currentSession.events.findIndex(
            (e) => e.data.toolUseId === toolUseId && e.type === 'step_start'
          );

          if (existingIndex !== -1) {
            const updatedEvents = [...currentSession.events];
            updatedEvents[existingIndex] = {
              ...updatedEvents[existingIndex],
              type: event.type,
              data: {
                ...updatedEvents[existingIndex].data,
                ...event.data,
              },
            };

            set({
              currentSession: {
                ...currentSession,
                events: updatedEvents,
              },
            });
            return;
          }
        }

        const eventItem: AutomationEventItem = {
          id: `${sessionId}-${Date.now()}-${Math.random()}`,
          sessionId,
          type: event.type,
          data: event.data,
          timestamp: Date.now(),
        };

        set({
          currentSession: {
            ...currentSession,
            events: [...currentSession.events, eventItem],
          },
        });
      },

      updateSessionStatus: (sessionId, status, result, error) => {
        const { currentSession } = get();

        if (!currentSession || currentSession.sessionId !== sessionId) return;

        set({
          currentSession: {
            ...currentSession,
            status,
            result,
            error,
            endTime: Date.now(),
          },
        });
      },

      clearSession: () => {
        set({
          currentSession: null,
          userGoal: '',
        });
      },
    }),
    {
      name: 'automation-storage',
      partialize: (state) => ({
        agentMode: state.agentMode,
        selectedRecordingId: state.selectedRecordingId,
      }),
    }
  )
);
