import React from 'react';
import { Play, StopCircle } from 'lucide-react';

import { Textarea } from '@/renderer/ui/textarea';
import { Button } from '@/renderer/ui/button';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: () => void;
  onCancel: () => void;
  isExecuting: boolean;
  disabled: boolean;
}

export function PromptInput({
  value,
  onChange,
  onExecute,
  onCancel,
  isExecuting,
  disabled,
}: PromptInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!disabled && !isExecuting) {
        onExecute();
      }
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="E.g., Create a repository called 'my-awesome-project'"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isExecuting}
        className="min-h-[50px] max-h-[100px] resize-none text-xs"
        onKeyDown={handleKeyDown}
      />

      <div className="flex gap-2">
        {!isExecuting ? (
          <Button
            onClick={onExecute}
            disabled={disabled}
            className="flex-1 h-8 text-xs"
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Execute
          </Button>
        ) : (
          <Button
            onClick={onCancel}
            variant="destructive"
            className="flex-1 h-8 text-xs"
          >
            <StopCircle className="w-3.5 h-3.5 mr-1.5" />
            Cancel
          </Button>
        )}
      </div>

      <p className="text-[10px] text-gray-500 text-center">
        Press {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + Enter to
        execute
      </p>
    </div>
  );
}
