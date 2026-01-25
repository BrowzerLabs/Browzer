import React from 'react';
import { ArrowUp, Square, MessageSquare, Bot, Rocket } from 'lucide-react';

import { AgentFooterProps } from './types';

import {
  InputGroup,
  InputGroupTextarea,
  InputGroupAddon,
  InputGroupButton,
} from '@/renderer/ui/input-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/renderer/ui/dropdown-menu';
import { Button } from '@/renderer/ui/button';

export function AgentFooter({
  userGoal,
  selectedRecordingId,
  isRunning,
  agentMode,
  onGoalChange,
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

  const canSubmit =
    agentMode === 'ask' || agentMode === 'autopilot'
      ? userGoal.trim() && !isRunning
      : userGoal.trim() && selectedRecordingId && !isRunning;

  const placeholder =
    agentMode === 'ask'
      ? 'Ask anything about the current page...'
      : agentMode === 'autopilot'
        ? 'Describe what you want to accomplish...'
        : selectedRecordingId
          ? 'Continue the conversation...'
          : 'Describe what you want to automate...';

  return (
    <section className="p-3 flex-shrink-0">
      <InputGroup>
        <InputGroupTextarea
          placeholder={placeholder}
          value={userGoal}
          onChange={(e) => onGoalChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={
            agentMode === 'automate'
              ? !selectedRecordingId || isRunning
              : isRunning
          }
          rows={3}
          className="resize-none"
        />
        <InputGroupAddon align="block-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-full">
                {agentMode === 'ask' ? (
                  <span className="flex items-center gap-2">
                    <MessageSquare className="size-3" /> Ask
                  </span>
                ) : agentMode === 'autopilot' ? (
                  <span className="flex items-center gap-2">
                    <Rocket className="size-3" /> Autopilot
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Bot className="size-3" /> Automate
                  </span>
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
              <DropdownMenuItem onClick={() => onModeChange('autopilot')}>
                <Rocket className="w-4 h-4 mr-2" />
                Autopilot
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <InputGroupButton
            variant="default"
            className="rounded-full ml-auto"
            size="icon-xs"
            disabled={isRunning ? false : !canSubmit}
            onClick={isRunning ? onStop : onSubmit}
            title={isRunning ? 'Stop automation' : 'Send message'}
          >
            {isRunning ? (
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
