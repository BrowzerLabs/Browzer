import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  AutomationEventType,
  AutomationProgressEvent,
  AutomationStatus,
} from '@/shared/types';

export interface AutomationEventItem {
  id: string;
  sessionId: string;
  type: AutomationEventType;
  data: any;
}

export interface AutomationSession {
  sessionId: string;
  userGoal: string;
  recordingId: string;
  status: AutomationStatus;
  events: AutomationEventItem[];
  result?: any;
  error?: string;
  startTime: number;
  endTime?: number;
}

export interface SessionListItem {
  sessionId: string;
  userGoal: string;
  recordingId: string;
  status: AutomationStatus;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  stepCount: number;
}

export type ViewState = 'new_session' | 'existing_session';

interface AutomationStore {
  viewState: ViewState;
  currentSession: AutomationSession | null;
  sessionHistory: SessionListItem[];
  selectedRecordingId: string | null;
  userPrompt: string;
  isLoadingSession: boolean;
  isLoadingHistory: boolean;
  setViewState: (state: ViewState) => void;
  startNewSession: () => void;
  setSelectedRecording: (recordingId: string | null) => void;
  setUserPrompt: (prompt: string) => void;
  startAutomation: (
    userGoal: string,
    recordingId: string,
    sessionId: string
  ) => void;
  loadStoredSession: (sessionId: string) => Promise<void>;
  loadSessionHistory: () => Promise<void>;
  addEvent: (sessionId: string, event: AutomationProgressEvent) => void;
  completeAutomation: (sessionId: string, result: any) => void;
  errorAutomation: (sessionId: string, error: string) => void;
  stopAutomation: (sessionId: string) => Promise<void>;
  clearSession: () => void;
  resetPrompt: () => void;
}

export const useAutomationStore = create<AutomationStore>()(
  persist(
    (set, get) => ({
      viewState: 'new_session',
      currentSession: null,
      sessionHistory: [],
      selectedRecordingId: null,
      userPrompt: '',
      isLoadingSession: false,
      isLoadingHistory: false,
      setViewState: (state) => {
        set({ viewState: state });
      },
      startNewSession: () => {
        set({
          viewState: 'new_session',
          currentSession: null,
          selectedRecordingId: null,
          userPrompt: '',
        });
      },

      setSelectedRecording: (recordingId) => {
        set({ selectedRecordingId: recordingId });
      },

      setUserPrompt: (prompt) => {
        set({ userPrompt: prompt });
      },

      startAutomation: (userGoal, recordingId, sessionId) => {
        const newSession: AutomationSession = {
          sessionId,
          userGoal,
          recordingId,
          status: AutomationStatus.RUNNING,
          events: [],
          startTime: Date.now(),
        };

        set({
          viewState: 'existing_session',
          currentSession: newSession,
          userPrompt: '', // Clear prompt after submission
          selectedRecordingId: recordingId, // Lock recording selection
        });
      },

      loadStoredSession: async (sessionId) => {
        set({ isLoadingSession: true });

        try {
          const sessionData =
            await window.browserAPI.loadAutomationSession(sessionId);

          if (sessionData) {
            const session: AutomationSession = {
              sessionId: sessionData.sessionId,
              userGoal: sessionData.userGoal,
              recordingId: sessionData.recordingId,
              status: sessionData.status,
              events: sessionData.events || [],
              result: sessionData.result,
              error: sessionData.error,
              startTime: sessionData.startTime,
              endTime: sessionData.endTime,
            };

            set({
              viewState: 'existing_session',
              currentSession: session,
              selectedRecordingId: sessionData.recordingId,
              isLoadingSession: false,
            });
          }
        } catch (error) {
          console.error('[AutomationStore] Failed to load session:', error);
          set({ isLoadingSession: false });
        }
      },

      loadSessionHistory: async () => {
        set({ isLoadingHistory: true });

        try {
          const history =
            await window.browserAPI.getAutomationSessionHistory(5);

          set({
            sessionHistory: history || [],
            isLoadingHistory: false,
          });
        } catch (error) {
          console.error('[AutomationStore] Failed to load history:', error);
          set({ isLoadingHistory: false });
        }
      },

      addEvent: (sessionId, event) => {
        const { currentSession } = get();

        if (!currentSession || sessionId !== currentSession.sessionId) {
          alert('No current session found');
          return;
        }

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
                status: event.type === 'step_complete' ? 'success' : 'error',
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
          id: `${event.data.toolUseId || sessionId}-${Date.now()}-${Math.random()}`,
          sessionId,
          type: event.type,
          data: event.data,
        };

        set({
          currentSession: {
            ...currentSession,
            events: [...currentSession.events, eventItem],
          },
        });
      },

      completeAutomation: (sessionId, result) => {
        const { currentSession } = get();

        if (!currentSession || currentSession.sessionId !== sessionId) {
          return;
        }

        set({
          currentSession: {
            ...currentSession,
            status: AutomationStatus.COMPLETED,
            result,
            endTime: Date.now(),
          },
        });
      },

      errorAutomation: (sessionId, error) => {
        const { currentSession } = get();

        if (!currentSession || currentSession.sessionId !== sessionId) {
          return;
        }

        set({
          currentSession: {
            ...currentSession,
            status: AutomationStatus.FAILED,
            error,
            endTime: Date.now(),
          },
        });
      },

      stopAutomation: async (sessionId) => {
        const { currentSession } = get();
        if (!currentSession || currentSession.sessionId !== sessionId) {
          alert('Cannot stop automation: session not found or mismatched');
          return;
        }

        await window.browserAPI.stopAutomation(sessionId);
        set({
          currentSession: {
            ...currentSession,
            status: AutomationStatus.STOPPED,
            error: 'Automation stopped by user',
            endTime: Date.now(),
          },
        });
      },

      clearSession: () => {
        set({
          viewState: 'new_session',
          currentSession: null,
          selectedRecordingId: null,
        });
      },

      resetPrompt: () => {
        set({ userPrompt: '' });
      },
    }),
    {
      name: 'automation-storage',
      partialize: (state) => ({
        currentSessionId: state.currentSession?.sessionId,
        selectedRecordingId: state.selectedRecordingId,
      }),
    }
  )
);
