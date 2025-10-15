import { Eye, Globe, CheckSquare, MessageSquare } from 'lucide-react';
import type { AgentObservation } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';

interface ObservationBlockProps {
  observation: AgentObservation;
  className?: string;
}

/**
 * Observation Block Component
 * 
 * Displays agent's observations (browser state, tool results, user input)
 */
export function ObservationBlock({ observation, className }: ObservationBlockProps) {
  const getIcon = () => {
    switch (observation.type) {
      case 'browser_state':
        return <Globe className="size-4" />;
      case 'tool_result':
        return <CheckSquare className="size-4" />;
      case 'user_input':
        return <MessageSquare className="size-4" />;
      default:
        return <Eye className="size-4" />;
    }
  };

  const getLabel = () => {
    switch (observation.type) {
      case 'browser_state':
        return 'Browser State';
      case 'tool_result':
        return 'Tool Result';
      case 'user_input':
        return 'User Input';
      default:
        return 'Observation';
    }
  };

  return (
    <div className={cn(
      "rounded-lg border p-3 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700",
      className
    )}>
      <div className="flex items-center gap-2 mb-2">
        <div className="text-slate-600 dark:text-slate-400">
          {getIcon()}
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {getLabel()}
        </span>
      </div>

      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
        {observation.summary}
      </p>
    </div>
  );
}

