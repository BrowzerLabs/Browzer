import { Brain, Lightbulb, RefreshCw } from 'lucide-react';
import type { AgentThought } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';

interface ThoughtBlockProps {
  thought: AgentThought;
  className?: string;
}

/**
 * Thought Block Component
 * 
 * Displays agent's reasoning, planning, or reflection thoughts
 * Similar to how Cursor/Windsurf show model thinking
 */
export function ThoughtBlock({ thought, className }: ThoughtBlockProps) {
  const getIcon = () => {
    switch (thought.type) {
      case 'reasoning':
        return <Brain className="size-4" />;
      case 'planning':
        return <Lightbulb className="size-4" />;
      case 'reflection':
        return <RefreshCw className="size-4" />;
      default:
        return <Brain className="size-4" />;
    }
  };

  const getLabel = () => {
    switch (thought.type) {
      case 'reasoning':
        return 'Thinking';
      case 'planning':
        return 'Planning';
      case 'reflection':
        return 'Reflecting';
      default:
        return 'Thought';
    }
  };

  const getColor = () => {
    switch (thought.type) {
      case 'reasoning':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950';
      case 'planning':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950';
      case 'reflection':
        return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950';
    }
  };

  return (
    <div className={cn("rounded-lg border p-3", getColor(), className)}>
      <div className="flex items-center gap-2 mb-2">
        {getIcon()}
        <span className="text-xs font-medium uppercase tracking-wide">
          {getLabel()}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">
        {thought.content}
      </p>
    </div>
  );
}

