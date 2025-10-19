import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'agent-step';
  timestamp: number;
  stepInfo?: {
    stepId: string;
    action: string;
    description: string;
    status: string;
    reasoning?: string;
    result?: any;
    error?: string;
  };
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

/**
 * Chat Store for managing AI chat messages and state
 */
export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [] as ChatMessage[],
      isLoading: false,
      addMessage: (message) => {
        const newMessage: ChatMessage = {
          ...message,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: [...state.messages, newMessage],
        }));
      },
      updateMessage: (id, updates) => {
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === id ? { ...message, ...updates } : message
          ),
        }));
      },
      setLoading: (loading) => set({ isLoading: loading }),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: 'browzer-chat-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
