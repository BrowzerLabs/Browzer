import React from 'react';
import { ArrowUp, Square, MessageSquare, Bot } from 'lucide-react';
import { InputGroup, InputGroupTextarea, InputGroupAddon, InputGroupButton } from '@/renderer/ui/input-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';
import { AgentFooterProps } from './types';
import { Button } from '@/renderer/ui/button';

export function AgentFooter({
  userPrompt,
  selectedRecordingId,
  isSubmitting,
  isDisabled,
  agentMode,
  onPromptChange,
  onSubmit,
  onStop,
  onModeChange,
}: AgentFooterProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  // In ask mode, only need prompt content; in automate mode, need recording selection too
  const canSubmit = agentMode === 'ask' 
    ? userPrompt.trim() && !isSubmitting 
    : userPrompt.trim() && selectedRecordingId && !isSubmitting && !isDisabled;

  const placeholder = agentMode === 'ask'
    ? "Ask anything about the current page..."
    : selectedRecordingId 
      ? "Continue the conversation..." 
      : "Describe what you want to automate...";

  return (
    <section className="p-3 flex-shrink-0">
       <InputGroup>
          <InputGroupTextarea
            placeholder={placeholder}
            value={userPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={agentMode === 'automate' ? (isDisabled || isSubmitting) : isSubmitting}
            rows={3}
            className="resize-none"
          />
          <InputGroupAddon align="block-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className='rounded-full'
                >
                  {agentMode === 'ask' ? (
                    <span className='flex items-center gap-2'><MessageSquare className="size-3" /> Ask</span>
                  ) : (
                    <span className='flex items-center gap-2'><Bot className="size-3" /> Automate</span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="[--radius:0.95rem]"
              >
                <DropdownMenuItem onClick={() => onModeChange('ask')} disabled>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Ask (coming soon)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onModeChange('automate')}>
                  <Bot className="w-4 h-4 mr-2" />
                  Automate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <InputGroupButton
              variant="default"
              className="rounded-full ml-auto"
              size="icon-xs"
              disabled={isSubmitting ? false : !canSubmit}
              onClick={isSubmitting ? onStop : onSubmit}
              title={isSubmitting ? "Stop automation" : "Send message"}
            >
              {isSubmitting ? (
                <Square className="size-2 bg-white" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
    </section>
  );
}
