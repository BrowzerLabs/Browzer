import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { ChatMessage, AgentEvent, AgentConfig } from '@/shared/types';

/**
 * React hook for Agent Orchestration
 * 
 * Handles:
 * - Sending messages to agent
 * - Receiving real-time streaming events
 * - Managing chat history
 * - Agent configuration
 */
export function useAgent() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [stats, setStats] = useState<{
    totalSessions: number;
    activeSessions: number;
    totalMessages: number;
    totalTokens: number;
    totalCost: number;
  } | null>(null);
  
  // Track current streaming message
  const streamingMessageRef = useRef<ChatMessage | null>(null);

  // Load config on mount
  useEffect(() => {
    loadConfig();
    loadStats();
  }, []);

  // Setup agent event listener
  useEffect(() => {
    const unsubscribe = window.browserAPI.onAgentEvent((event: AgentEvent) => {
      handleAgentEvent(event);
    });

    return unsubscribe;
  }, []);

  /**
   * Handle real-time agent events
   */
  const handleAgentEvent = useCallback((event: AgentEvent) => {
    console.log('[Agent Event]', event.type, event);

    switch (event.type) {
      case 'message_start':
        // Start new streaming message
        streamingMessageRef.current = {
          id: event.sessionId,
          role: 'assistant',
          content: '',
          timestamp: event.timestamp,
          thoughts: [],
          actions: [],
          observations: [],
          isStreaming: true,
          isComplete: false
        };
        setCurrentSessionId(event.sessionId);
        break;

      case 'thought':
        // Add thought to current message
        if (streamingMessageRef.current) {
          streamingMessageRef.current.thoughts = [
            ...(streamingMessageRef.current.thoughts || []),
            event.data
          ];
          updateStreamingMessage();
        }
        break;

      case 'action':
        // Add action to current message
        if (streamingMessageRef.current) {
          streamingMessageRef.current.actions = [
            ...(streamingMessageRef.current.actions || []),
            event.data
          ];
          updateStreamingMessage();
        }
        break;

      case 'observation':
        // Add observation to current message
        if (streamingMessageRef.current) {
          streamingMessageRef.current.observations = [
            ...(streamingMessageRef.current.observations || []),
            event.data
          ];
          updateStreamingMessage();
        }
        break;

      case 'text_delta':
        // Append text delta to current message
        if (streamingMessageRef.current) {
          streamingMessageRef.current.content += event.delta;
          updateStreamingMessage();
        }
        break;

      case 'complete':
        // Finalize streaming message
        if (streamingMessageRef.current) {
          streamingMessageRef.current.content = event.data.response;
          streamingMessageRef.current.isStreaming = false;
          streamingMessageRef.current.isComplete = true;
          streamingMessageRef.current.metadata = event.data.metadata;
          updateStreamingMessage();
          streamingMessageRef.current = null;
        }
        setIsExecuting(false);
        setCurrentSessionId(null);
        
        // Show completion toast
        if (event.data.success) {
          toast.success('Task completed successfully', {
            description: `${event.data.metadata.stepsExecuted} steps • ${event.data.metadata.tokensUsed} tokens`
          });
        } else {
          toast.error('Task failed', {
            description: event.data.error || 'Unknown error'
          });
        }
        
        // Reload stats
        loadStats();
        break;

      case 'error':
        // Handle error
        if (streamingMessageRef.current) {
          streamingMessageRef.current.content = `Error: ${event.data.error}`;
          streamingMessageRef.current.isStreaming = false;
          streamingMessageRef.current.isComplete = true;
          updateStreamingMessage();
          streamingMessageRef.current = null;
        }
        setIsExecuting(false);
        setCurrentSessionId(null);
        toast.error('Agent error', {
          description: event.data.error
        });
        break;
    }
  }, []);

  /**
   * Update streaming message in messages array
   */
  const updateStreamingMessage = useCallback(() => {
    const currentMsg = streamingMessageRef.current;
    if (!currentMsg) return;

    setMessages(prev => {
      const existing = prev.find(m => m.id === currentMsg.id);
      if (existing) {
        // Update existing message
        return prev.map(m => 
          m.id === currentMsg.id ? { ...currentMsg } : m
        );
      } else {
        // Add new message
        return [...prev, { ...currentMsg }];
      }
    });
  }, []);

  /**
   * Execute agent task
   */
  const executeTask = useCallback(async (
    message: string,
    recordingId?: string,
    mode?: 'autonomous' | 'semi-supervised' | 'supervised'
  ) => {
    if (isExecuting) {
      toast.error('Agent is already executing a task');
      return;
    }

    // Add user message to chat
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsExecuting(true);

    try {
      // Execute via IPC (streaming handled via events)
      await window.browserAPI.executeAgentTask(message, recordingId, mode);
      
    } catch (error) {
      console.error('Failed to execute agent task:', error);
      setIsExecuting(false);
      toast.error('Failed to execute task', {
        description: String(error)
      });
      
      // Add error message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Failed to execute task: ${error}`,
        timestamp: Date.now(),
        isComplete: true
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  }, [isExecuting]);

  /**
   * Cancel current execution
   */
  const cancelTask = useCallback(async () => {
    if (!currentSessionId) {
      toast.error('No task to cancel');
      return;
    }

    try {
      await window.browserAPI.cancelAgentTask(currentSessionId);
      setIsExecuting(false);
      setCurrentSessionId(null);
      toast.success('Task cancelled');
    } catch (error) {
      console.error('Failed to cancel task:', error);
      toast.error('Failed to cancel task');
    }
  }, [currentSessionId]);

  /**
   * Clear chat history
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
    streamingMessageRef.current = null;
  }, []);

  /**
   * Load agent configuration
   */
  const loadConfig = useCallback(async () => {
    try {
      const agentConfig = await window.browserAPI.getAgentConfig();
      setConfig(agentConfig);
    } catch (error) {
      console.error('Failed to load agent config:', error);
    }
  }, []);

  /**
   * Update agent configuration
   */
  const updateConfig = useCallback(async (newConfig: Partial<AgentConfig>) => {
    try {
      await window.browserAPI.updateAgentConfig(newConfig);
      await loadConfig();
      toast.success('Configuration updated');
    } catch (error) {
      console.error('Failed to update config:', error);
      toast.error('Failed to update configuration');
    }
  }, [loadConfig]);

  /**
   * Load global stats
   */
  const loadStats = useCallback(async () => {
    try {
      const agentStats = await window.browserAPI.getAgentStats();
      setStats(agentStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }, []);

  return {
    messages,
    isExecuting,
    config,
    stats,
    executeTask,
    cancelTask,
    clearMessages,
    updateConfig,
    loadStats
  };
}

