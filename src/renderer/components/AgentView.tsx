import { useState, useRef, useEffect } from 'react';
import { Send, Square, Trash2, Settings } from 'lucide-react';
import { useAgent } from '../hooks/useAgent';
import { RecordingSelector, MessageContent } from './agent';
import { Button } from '@/renderer/ui/button';
import { Textarea } from '@/renderer/ui/textarea';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import { Separator } from '@/renderer/ui/separator';
import { Toggle } from '@/renderer/ui/toggle';
import { toast } from 'sonner';

/**
 * Agent View Component
 * 
 * Main chat interface for LLM agent orchestration
 * Features:
 * - Chat-style interface similar to Cursor/Windsurf
 * - Recording context selector
 * - Real-time streaming responses
 * - Thought, action, and observation display
 * - Agent configuration
 */
export default function AgentView() {
  const {
    messages,
    isExecuting,
    config,
    stats,
    executeTask,
    cancelTask,
    clearMessages
  } = useAgent();

  const [input, setInput] = useState('');
  const [selectedRecording, setSelectedRecording] = useState<string | undefined>();
  const [mode, setMode] = useState<'autonomous' | 'semi-supervised' | 'supervised'>('autonomous');
  
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!input.trim() || isExecuting) return;

    const message = input.trim();
    setInput('');

    try {
      await executeTask(message, selectedRecording, mode);
    } catch (error) {
      console.error('Failed to execute task:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleClear = () => {
    if (messages.length === 0) return;
    
    if (confirm('Clear all messages? This cannot be undone.')) {
      clearMessages();
      toast.success('Messages cleared');
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">AI Agent</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {config?.model || 'Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={handleClear}
              disabled={messages.length === 0}
              title="Clear messages"
            >
              <Trash2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title="Settings"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </div>

        {/* Recording Context Selector */}
        <RecordingSelector
          selectedRecording={selectedRecording}
          onSelect={setSelectedRecording}
        />

        {/* Mode Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Mode:</span>
          <div className="flex gap-1">
            <Toggle
              size="sm"
              pressed={mode === 'autonomous'}
              onPressedChange={() => setMode('autonomous')}
              className="text-xs h-7 px-2"
            >
              Auto
            </Toggle>
            <Toggle
              size="sm"
              pressed={mode === 'semi-supervised'}
              onPressedChange={() => setMode('semi-supervised')}
              className="text-xs h-7 px-2"
            >
              Semi
            </Toggle>
            <Toggle
              size="sm"
              pressed={mode === 'supervised'}
              onPressedChange={() => setMode('supervised')}
              className="text-xs h-7 px-2"
            >
              Supervised
            </Toggle>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <div className="p-4 space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 mb-4">
                <Send className="size-8 text-white" />
              </div>
              <h4 className="text-lg font-semibold mb-2">Ready to assist</h4>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Ask me to automate tasks, analyze pages, or execute workflows.
                {selectedRecording && " I'll use your selected recording as context."}
              </p>
              
              {/* Example prompts */}
              <div className="mt-6 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Try asking:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "Search for AI news",
                    "Fill out the login form",
                    "Navigate to the pricing page"
                  ].map((example) => (
                    <button
                      key={example}
                      onClick={() => setInput(example)}
                      className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stats */}
              {stats && stats.totalSessions > 0 && (
                <div className="mt-8 pt-6 border-t">
                  <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
                    <div>
                      <div className="font-semibold text-foreground">{stats.totalSessions}</div>
                      <div>Sessions</div>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div>
                      <div className="font-semibold text-foreground">{stats.totalMessages}</div>
                      <div>Messages</div>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div>
                      <div className="font-semibold text-foreground">${stats.totalCost.toFixed(4)}</div>
                      <div>Cost</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            messages.map((message) => (
              <MessageContent key={message.id} message={message} />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedRecording 
                ? "Describe the task to automate (using recording context)..."
                : "Describe the task to automate..."
            }
            className="min-h-[60px] max-h-[200px] resize-none"
            disabled={isExecuting}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {isExecuting ? (
                <span className="text-amber-600 dark:text-amber-400">Agent is working...</span>
              ) : (
                <span>Press <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Enter</kbd> to send, <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Shift+Enter</kbd> for new line</span>
              )}
            </p>
            <div className="flex gap-2">
              {isExecuting && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={cancelTask}
                  className="gap-2"
                >
                  <Square className="size-3.5" />
                  Stop
                </Button>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={!input.trim() || isExecuting}
                className="gap-2"
              >
                <Send className="size-3.5" />
                Send
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
