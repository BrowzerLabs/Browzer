import { User, Bot, Loader2 } from 'lucide-react';
import type { ChatMessage } from '@/shared/types';
import { ThoughtBlock } from './ThoughtBlock';
import { ActionBlock } from './ActionBlock';
import { ObservationBlock } from './ObservationBlock';
import { cn } from '@/renderer/lib/utils';

interface MessageContentProps {
  message: ChatMessage;
  className?: string;
}

/**
 * Message Content Component
 * 
 * Main message display component that shows:
 * - User or assistant avatar and message
 * - Thoughts, actions, observations (for assistant messages)
 * - Streaming indicators
 * - Metadata (tokens, cost, time)
 */
export function MessageContent({ message, className }: MessageContentProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn("group relative", className)}>
      {/* Avatar and Message Container */}
      <div className="flex gap-3">
        {/* Avatar */}
        <div className={cn(
          "shrink-0 flex size-8 items-center justify-center rounded-full",
          isUser 
            ? "bg-blue-600 text-white"
            : "bg-gradient-to-br from-purple-600 to-blue-600 text-white"
        )}>
          {isUser ? (
            <User className="size-4" />
          ) : (
            <Bot className="size-4" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 space-y-2 min-w-0">
          {/* Role Label */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {isUser ? 'You' : 'Agent'}
            </span>
            {message.isStreaming && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                <span>Working...</span>
              </div>
            )}
          </div>

          {/* Thoughts (Assistant only) */}
          {!isUser && message.thoughts && message.thoughts.length > 0 && (
            <div className="space-y-2">
              {message.thoughts.map((thought) => (
                <ThoughtBlock key={thought.id} thought={thought} />
              ))}
            </div>
          )}

          {/* Actions (Assistant only) */}
          {!isUser && message.actions && message.actions.length > 0 && (
            <div className="space-y-2">
              {message.actions.map((action) => (
                <ActionBlock key={action.id} action={action} />
              ))}
            </div>
          )}

          {/* Observations (Assistant only) */}
          {!isUser && message.observations && message.observations.length > 0 && (
            <div className="space-y-2">
              {message.observations.map((observation) => (
                <ObservationBlock 
                  key={`${observation.type}-${observation.timestamp}`} 
                  observation={observation} 
                />
              ))}
            </div>
          )}

          {/* Main Message Content */}
          {message.content && (
            <div className={cn(
              "prose prose-sm dark:prose-invert max-w-none",
              "rounded-lg p-3",
              isUser 
                ? "bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100"
                : "bg-muted"
            )}>
              <p className="whitespace-pre-wrap m-0">
                {message.content}
              </p>
            </div>
          )}

          {/* Metadata */}
          {message.metadata && message.isComplete && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {message.metadata.tokensUsed !== undefined && (
                <span>{message.metadata.tokensUsed} tokens</span>
              )}
              {message.metadata.cost !== undefined && (
                <span>${message.metadata.cost.toFixed(4)}</span>
              )}
              {message.metadata.executionTime !== undefined && (
                <span>{(message.metadata.executionTime / 1000).toFixed(1)}s</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

