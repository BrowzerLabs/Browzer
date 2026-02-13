import { useState, useCallback } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';

import { AutomationEventItem } from '@/renderer/stores/automationStore';
import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/ui/select';

interface InputRequiredEventProps {
  event: AutomationEventItem;
  isLatest: boolean;
  sessionId: string;
  onSubmit: (requestId: string, value: string) => void;
  onCancel: (requestId: string) => void;
  isSubmitted: boolean;
  submittedValue?: string;
}

export function InputRequiredEvent({
  event,
  isLatest,
  sessionId,
  onSubmit,
  onCancel,
  isSubmitted,
  submittedValue,
}: InputRequiredEventProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    requestId,
    fieldName,
    fieldDescription,
    inputType,
    placeholder,
    options,
  } = event.data;

  const handleSubmit = useCallback(async () => {
    if (!inputValue.trim() && inputType !== 'select') return;

    setIsSubmitting(true);
    try {
      onSubmit(requestId, inputValue);
    } finally {
      setIsSubmitting(false);
    }
  }, [inputValue, inputType, requestId, onSubmit]);

  const handleCancel = useCallback(() => {
    onCancel(requestId);
  }, [requestId, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  if (isSubmitted) {
    return (
      <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
        <MessageSquare className="size-4 text-green-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-green-500">{fieldName}</div>
          <div className="text-xs text-muted-foreground mt-1">
            Provided: {inputType === 'password' ? '••••••••' : submittedValue}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg animate-pulse-subtle">
      <div className="flex items-start gap-3">
        <MessageSquare className="size-4 text-yellow-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-yellow-500">
            Input Required: {fieldName}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {fieldDescription}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-7">
        {inputType === 'select' && options ? (
          <Select value={inputValue} onValueChange={setInputValue}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={placeholder || `Select ${fieldName}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option: string) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={
              inputType === 'password'
                ? 'password'
                : inputType === 'email'
                  ? 'email'
                  : inputType === 'number'
                    ? 'number'
                    : 'text'
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || `Enter ${fieldName}`}
            className="flex-1"
            autoFocus={isLatest}
          />
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={handleSubmit}
          disabled={
            isSubmitting || (!inputValue.trim() && inputType !== 'select')
          }
          className="shrink-0"
        >
          <Send className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCancel}
          disabled={isSubmitting}
          className="shrink-0 text-destructive"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
