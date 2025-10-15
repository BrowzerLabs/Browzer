import { Play, CheckCircle2, MessageCircle, Wrench } from 'lucide-react';
import type { AgentAction } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';
import { Badge } from '@/renderer/ui/badge';

interface ActionBlockProps {
  action: AgentAction;
  className?: string;
}

/**
 * Action Block Component
 * 
 * Displays agent's actions (tool calls, task completion, user questions)
 * Similar to how Cursor/Windsurf show tool executions
 */
export function ActionBlock({ action, className }: ActionBlockProps) {
  const getIcon = () => {
    switch (action.type) {
      case 'tool_call':
        return <Wrench className="size-4" />;
      case 'complete_task':
        return <CheckCircle2 className="size-4" />;
      case 'ask_user':
        return <MessageCircle className="size-4" />;
      default:
        return <Play className="size-4" />;
    }
  };

  const getLabel = () => {
    switch (action.type) {
      case 'tool_call':
        return 'Tool Call';
      case 'complete_task':
        return 'Task Complete';
      case 'ask_user':
        return 'Question';
      default:
        return 'Action';
    }
  };

  const getToolName = () => {
    if (action.toolCall) {
      // Convert snake_case to Title Case
      return action.toolCall.function.name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    return null;
  };

  const getToolArgs = () => {
    if (action.toolCall) {
      try {
        return JSON.parse(action.toolCall.function.arguments);
      } catch {
        return null;
      }
    }
    return null;
  };

  return (
    <div className={cn(
      "rounded-lg border p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-green-200 dark:border-green-800",
      className
    )}>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-green-600 dark:text-green-400">
          {getIcon()}
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-green-600 dark:text-green-400">
          {getLabel()}
        </span>
        {action.toolCall && (
          <Badge variant="outline" className="ml-auto text-xs">
            {getToolName()}
          </Badge>
        )}
      </div>

      {action.reasoning && (
        <p className="text-xs text-muted-foreground mb-2 italic">
          {action.reasoning}
        </p>
      )}

      {action.toolCall && getToolArgs() && (
        <div className="mt-2 p-2 bg-white/50 dark:bg-black/20 rounded border border-green-200 dark:border-green-800">
          <div className="text-xs font-mono space-y-1">
            {Object.entries(getToolArgs()!).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-green-600 dark:text-green-400 break-all">
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

