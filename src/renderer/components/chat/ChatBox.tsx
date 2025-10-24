import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { Textarea } from '@/renderer/ui/textarea';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import { useChatStore, type ChatMessage } from '@/renderer/store/useChatStore';
import { 
  classifyQuery, 
  handleAskQuery, 
  handleDoQuery, 
  type LLMContext,
  type QueryClassification 
} from '@/renderer/services/llmService';
import { useBrowserAPI } from '@/renderer/hooks/useBrowserAPI';
import { convertHtmlToMarkdown } from '@/renderer/services/htmlToMarkdown';
import { formatTime } from '@/renderer/lib/utils';

interface ChatBoxProps {
  className?: string;
}

export function ChatBox({ className }: ChatBoxProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState<number | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [selectedContexts, setSelectedContexts] = useState<LLMContext[]>([]);
  
  const { messages, isLoading, addMessage, setLoading, clearMessages } = useChatStore();
  const { tabs, activeTab, activeTabId } = useBrowserAPI();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputValue]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setIsMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(null);
    
    // Add user message
    addMessage({
      content: userMessage,
      role: 'user',
    });

    // Set loading state
    setLoading(true);

    try {
      const classificationResult = await classifyQuery(userMessage);
      const queryType: QueryClassification = classificationResult.success 
        ? classificationResult.classification 
        : 'ask';

      let contextsToSend: LLMContext[] | undefined = undefined;
      if (selectedContexts.length > 0) {
        const enriched: LLMContext[] = [];
        for (const c of selectedContexts) {
          if (c.type === 'tab') {
            const html = await window.browserAPI.getTabOuterHTML(c.tabId);
            const markdown = html ? convertHtmlToMarkdown(html) : undefined;
            enriched.push({ ...c, markdown });
          }
        }
        contextsToSend = enriched;
      } else if (activeTab && activeTabId) {
        const html = await window.browserAPI.getTabOuterHTML(activeTabId);
        const markdown = html ? convertHtmlToMarkdown(html) : undefined;
        contextsToSend = [{
          type: 'tab',
          tabId: activeTabId,
          title: activeTab.title,
          url: activeTab.url,
          markdown
        }];
      }

      let response;
      
      if (queryType === 'ask') {
        response = await handleAskQuery(userMessage, contextsToSend);
      } else {
        response = await handleDoQuery(userMessage, contextsToSend);
      }
      
      if (response.success) {
        // Add assistant response
        addMessage({
          content: response.content,
          role: 'assistant',
        });
      } else {
        // Add error message
        addMessage({
          content: `Error: ${response.error || 'Failed to get response'}`,
          role: 'assistant',
        });
      }
    } catch (error) {
      addMessage({
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        role: 'assistant',
      });
    } finally {
      setLoading(false);
      setSelectedContexts([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention navigation
    if (isMentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => i + 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSelectMention(highlightIndex);
        return;
      }
      if (e.key === 'Escape') {
        setIsMentionOpen(false);
        setMentionQuery('');
        setMentionIndex(null);
        return;
      }
    }

    // Send on Enter when not selecting mention
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const openMentionIfNeeded = (value: string) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart ?? value.length;
    // Find last '@' before cursor
    const before = value.slice(0, cursor);
    const atIndex = before.lastIndexOf('@');
    if (atIndex === -1) {
      setIsMentionOpen(false);
      setMentionQuery('');
      setMentionIndex(null);
      return;
    }
    // Ensure '@' starts a token (start of line or preceded by whitespace)
    const prevChar = atIndex > 0 ? before[atIndex - 1] : ' ';
    if (!/\s|\n|\t/.test(prevChar)) {
      setIsMentionOpen(false);
      setMentionQuery('');
      setMentionIndex(null);
      return;
    }
    // Extract query until next whitespace/newline
    const after = value.slice(atIndex + 1, cursor);
    if (after.includes('\n') || after.includes(' ')) {
      setIsMentionOpen(false);
      setMentionQuery('');
      setMentionIndex(null);
      return;
    }
    setIsMentionOpen(true);
    setMentionIndex(atIndex);
    setMentionQuery(after);
    setHighlightIndex(0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    openMentionIfNeeded(value);
  };

  const mentionOptions = (() => {
    const base = tabs.map((t) => ({ kind: 'tab' as const, id: t.id, label: t.title || t.url || 'Untitled tab', url: t.url, title: t.title }));
    if (!mentionQuery) return base;
    const q = mentionQuery.toLowerCase();
    return base.filter((o) =>
      o.label.toLowerCase().includes(q) || (o.kind === 'tab' && ((o.url || '').toLowerCase().includes(q)))
    );
  })();

  const handleSelectMention = (index: number) => {
    const option = mentionOptions[Math.max(0, Math.min(index, mentionOptions.length - 1))];
    if (!option) return;
    if (mentionIndex == null) return;
    const before = inputValue.slice(0, mentionIndex);
    const afterAll = inputValue.slice((textareaRef.current?.selectionStart ?? inputValue.length));
    const insertText = `@${option.label} `;
    const nextValue = before + insertText + afterAll;
    setInputValue(nextValue);
    setIsMentionOpen(false);
    setMentionQuery('');
    setMentionIndex(null);
    // add selected context (avoid duplicates)
    if (!selectedContexts.some(c => c.type === 'tab' && c.tabId === option.id)) {
      setSelectedContexts((prev) => [...prev, { type: 'tab', tabId: option.id, title: option.title, url: option.url }]);
    }
    // move cursor to end of inserted mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = (before + insertText).length;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    });
  };

  const handleClearChat = async () => {
    if (messages.length > 0) {
      clearMessages();
      try {
        await window.browserAPI.clearMemory();
        console.log('Memory cleared successfully');
      } catch (error) {
        console.error('Failed to clear memory:', error);
      }
    }
  };


  return (
    <div className={`flex flex-col h-full min-h-0 ${className}`}>
      {/* Chat Header with Clear Button */}
      <div className="flex justify-between items-center p-3 border-b border-gray-700 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <span className="text-sm text-gray-400">
          {messages.length} message{messages.length !== 1 ? 's' : ''}
        </span>
        <Button
          onClick={handleClearChat}
          variant="ghost"
          size="sm"
          disabled={isLoading || messages.length === 0}
          className="text-gray-400 hover:text-gray-200"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Clear All
        </Button>
      </div>
      
      {/* Messages Area */}
      <ScrollArea className="flex-1 h-0 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="w-8 h-8 mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-500">
                Start a conversation with the AI agent
              </p>
            </div>
          )}
          
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          
          {isLoading && (
            <div className="flex items-center space-x-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">AI is thinking...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex space-x-2 items-start relative">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here..."
            className="flex-1 min-h-[40px] max-h-[120px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
            className="shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>

          {isMentionOpen && mentionOptions.length > 0 && (
            <div className="absolute bottom-[56px] left-0 right-12 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden z-10">
              <div className="max-h-60 overflow-auto">
                {mentionOptions.map((opt, idx) => (
                  <button
                    key={`${opt.kind}-${opt.id}`}
                    className={`w-full text-left px-3 py-2 text-sm ${idx === highlightIndex % mentionOptions.length ? 'bg-gray-700 text-white' : 'text-gray-200 hover:bg-gray-700/70'}`}
                    onMouseDown={(e) => { e.preventDefault(); handleSelectMention(idx); }}
                  >
                    <div className="flex items-center justify-between">
                      <span>{opt.label}</span>
                      {opt.kind === 'tab' && (
                        <span className="ml-3 text-xs text-gray-400 truncate max-w-[50%]">{opt.url}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-start space-x-2 max-w-[80%] ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? 'bg-blue-600' : 'bg-gray-600'
        }`}>
          {isUser ? (
            <User className="w-4 h-4 text-white" />
          ) : (
            <Bot className="w-4 h-4 text-white" />
          )}
        </div>
        
        <div className={`rounded-lg px-3 py-2 break-words break-all whitespace-pre-wrap overflow-hidden ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-700 text-gray-200'
        }`}>
          <p className="text-sm whitespace-pre-wrap break-words break-all">{message.content}</p>
          <p className={`text-xs mt-1 ${
            isUser ? 'text-blue-100' : 'text-gray-400'
          }`}>
            {formatTime(message.timestamp)}
          </p>
        </div>
      </div>
    </div>
  );
}


