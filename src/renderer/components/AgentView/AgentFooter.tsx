import React from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { InputGroup, InputGroupTextarea, InputGroupAddon, InputGroupButton } from '@/renderer/ui/input-group';
import { AgentFooterProps } from './types';

export function AgentFooter({
  userPrompt,
  selectedRecordingId,
  isSubmitting,
  isDisabled,
  onPromptChange,
  onSubmit,
  onStop,
}: AgentFooterProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const canSubmit = userPrompt.trim() && selectedRecordingId && !isSubmitting && !isDisabled;

  return (
    <section className="p-3 flex-shrink-0">
       <InputGroup>
          <InputGroupTextarea
            placeholder={selectedRecordingId ? "Continue the conversation..." : "Describe what you want to automate..."}
            value={userPrompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled || isSubmitting}
            rows={3}
            className="resize-none"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              variant="default"
              className="rounded-full"
              size="icon-xs"
              disabled={isSubmitting ? false : !canSubmit}
              onClick={isSubmitting ? onStop : onSubmit}
              title={isSubmitting ? "Stop automation" : "Send message"}
            >
              {isSubmitting ? (
                <Square className="size-2" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
    </section>
  );
}
