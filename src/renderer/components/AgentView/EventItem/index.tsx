import { EventItemProps } from '../types';

import { ThinkingEvent } from './ThinkingEvent';
import { StepEvent } from './StepEvent';
import { ErrorEvent } from './ErrorEvent';
import { TextEvent } from './TextEvent';
import { AutomationStoppedEvent } from './AutomationStoppedEvent';
import { AutomationCompleteEvent } from './AutomationCompleteEvent';
import { InputRequiredEvent } from './InputRequiredEvent';

interface ExtendedEventItemProps extends EventItemProps {
  sessionId?: string;
  onInputSubmit?: (requestId: string, value: string) => void;
  onInputCancel?: (requestId: string) => void;
  submittedInputs?: Map<string, string>;
}

export function EventItem({
  event,
  isLatest,
  sessionId,
  onInputSubmit,
  onInputCancel,
  submittedInputs,
}: ExtendedEventItemProps) {
  switch (event.type) {
    case 'thinking':
      return <ThinkingEvent event={event} isLatest={isLatest} />;

    case 'text_response':
      return <TextEvent event={event} isLatest={isLatest} />;

    case 'step_start':
    case 'step_complete':
    case 'step_error':
      return <StepEvent event={event} isLatest={isLatest} />;

    case 'input_required':
      if (!sessionId || !onInputSubmit || !onInputCancel) {
        return null;
      }
      const requestId = event.data.requestId;
      const isSubmitted = submittedInputs?.has(requestId) ?? false;
      const submittedValue = submittedInputs?.get(requestId);
      return (
        <InputRequiredEvent
          event={event}
          isLatest={isLatest}
          sessionId={sessionId}
          onSubmit={onInputSubmit}
          onCancel={onInputCancel}
          isSubmitted={isSubmitted}
          submittedValue={submittedValue}
        />
      );

    case 'automation_error':
      return <ErrorEvent event={event} isLatest={isLatest} />;

    case 'automation_stopped':
      return <AutomationStoppedEvent event={event} isLatest={isLatest} />;

    case 'automation_complete':
      return <AutomationCompleteEvent event={event} isLatest={isLatest} />;

    default:
      // Generic event display for unknown types
      return (
        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded">
          {event.type}: {JSON.stringify(event.data)}
        </div>
      );
  }
}
