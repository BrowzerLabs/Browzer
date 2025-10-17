import { useState, useEffect, useRef } from 'react';
import { Bot, Settings } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import { toast } from 'sonner';
import { RecordingSession } from '@/shared/types';
import { ChatMessage, ChatMessageData } from './agent/ChatMessage';
import { AutomationStatus } from './agent/AutomationStatus';
import { RecordingSelector } from './agent/RecordingSelector';
import { PromptInput } from './agent/PromptInput';

interface AutomationStep {
  id: string;
  action: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export default function AgentView() {
  // State
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [userPrompt, setUserPrompt] = useState('');
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<AutomationStep[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load recordings and API key on mount
  useEffect(() => {
    loadRecordings();
    loadApiKey();
  }, []);

  // Auto-scroll to bottom when messages or steps change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, currentSteps]);

  const loadRecordings = async () => {
    try {
      const recordings = await window.browserAPI.getAllRecordings();
      setSessions(recordings || []);
    } catch (error) {
      console.error('Failed to load recordings:', error);
    }
  };

  const loadApiKey = async () => {
    try {
      const settings = await window.browserAPI.getSettingsCategory('automation');
      if (settings?.apiKey) {
        setApiKey(settings.apiKey);
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  };

  const saveApiKey = async () => {
    try {
      await window.browserAPI.updateSetting('automation', 'apiKey', apiKey);
      await window.browserAPI.initializeAutomation(apiKey);
      toast.success('API key saved successfully');
      setShowSettings(false);
    } catch (error) {
      toast.error('Failed to save API key');
      console.error(error);
    }
  };

  const addMessage = (message: Omit<ChatMessageData, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessageData = {
      ...message,
      id: `msg-${Date.now()}-${Math.random()}`,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleExecute = async () => {
    if (!userPrompt.trim() || !selectedSession) {
      toast.error('Please enter a prompt and select a recording');
      return;
    }

    if (!apiKey) {
      toast.error('Please configure your Anthropic API key in settings');
      setShowSettings(true);
      return;
    }

    setIsExecuting(true);
    setCurrentSteps([]);
    setCompletedCount(0);
    setTotalCount(0);

    // Add user message
    addMessage({
      type: 'user',
      content: userPrompt
    });

    // Find selected session
    const session = sessions.find(s => s.id === selectedSession);
    if (!session) {
      toast.error('Selected recording not found');
      setIsExecuting(false);
      return;
    }

    try {
      // Initialize automation
      await window.browserAPI.initializeAutomation(apiKey);

      // Set up progress listener
      const unsubscribe = window.browserAPI.onAutomationProgress((data: { 
        step: AutomationStep; 
        index: number; 
        total: number 
      }) => {
        const { step, index, total } = data;
        
        setTotalCount(total);
        setCompletedCount(index);
        
        setCurrentSteps(prev => {
          const newSteps = [...prev];
          const existingIndex = newSteps.findIndex(s => s.id === step.id);
          
          if (existingIndex >= 0) {
            newSteps[existingIndex] = step;
          } else {
            newSteps.push(step);
          }
          
          return newSteps;
        });
      });

      addMessage({
        type: 'system',
        content: `🤖 Generating automation plan using recording: "${session.name}"...`
      });

      // Execute automation
      const result = await window.browserAPI.executeAutomation({
        userPrompt,
        recordingSession: session,
        apiKey
      });

      unsubscribe();

      if (result.success) {
        addMessage({
          type: 'system',
          content: `✅ Automation completed successfully!\n\nCompleted: ${result.plan.completedSteps}/${result.plan.steps.length} steps\nDuration: ${(result.executionTime / 1000).toFixed(2)}s`
        });
        toast.success('Automation completed!');
      } else {
        addMessage({
          type: 'system',
          content: `❌ Automation failed: ${result.error}\n\nCompleted: ${result.plan.completedSteps}/${result.plan.steps.length} steps`
        });
        toast.error('Automation failed');
      }

    } catch (error) {
      addMessage({
        type: 'system',
        content: `❌ Error: ${(error as Error).message}`
      });
      toast.error('Automation failed');
      console.error('Automation error:', error);
    } finally {
      setIsExecuting(false);
      setUserPrompt('');
      setCurrentSteps([]);
      setCompletedCount(0);
      setTotalCount(0);
    }
  };

  const handleCancel = async () => {
    try {
      await window.browserAPI.cancelAutomation();
      addMessage({
        type: 'system',
        content: '🛑 Automation cancelled by user'
      });
      setIsExecuting(false);
      setCurrentSteps([]);
      toast.info('Automation cancelled');
    } catch (error) {
      console.error('Failed to cancel:', error);
    }
  };

  // Settings View
  if (showSettings) {
    return (
      <div className="h-full flex flex-col p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Automation Settings
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
            Back
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">Anthropic API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </div>

          <Button onClick={saveApiKey} className="w-full">
            Save API Key
          </Button>
        </div>
      </div>
    );
  }

  // Main View
  return (
    <div className="h-full flex flex-col">
      {/* Header with Recording Selector */}
      <div className="border-b bg-background">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex-1">
            <RecordingSelector
              sessions={sessions}
              selectedSession={selectedSession}
              onSessionChange={setSelectedSession}
              disabled={isExecuting}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="h-8 w-8 shrink-0"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Chat Messages Area - Scrollable */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="px-3 py-2 space-y-2 min-h-full">
            {/* Empty State */}
            {messages.length === 0 && !isExecuting && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center py-12">
                  <Bot className="w-12 h-12 mx-auto text-gray-600 mb-3" />
                  <h3 className="text-lg font-semibold text-gray-300 mb-2">
                    AI Browser Automation
                  </h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    Select a recorded session and describe what you want to automate.
                    The AI will generate and execute the automation plan.
                  </p>
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {/* Current Execution Status */}
            {isExecuting && (
              <AutomationStatus
                isExecuting={isExecuting}
                steps={currentSteps}
                completedCount={completedCount}
                totalCount={totalCount}
              />
            )}

            {/* Scroll anchor */}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input Area - Sticky at bottom */}
      <div className="border-t bg-background shrink-0">
        <div className="px-3 py-2">
          <PromptInput
            value={userPrompt}
            onChange={setUserPrompt}
            onExecute={handleExecute}
            onCancel={handleCancel}
            isExecuting={isExecuting}
            disabled={!selectedSession || !apiKey}
          />
        </div>
      </div>
    </div>
  );
}
