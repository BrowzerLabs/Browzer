import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

import {
  extractWorkflowVariables,
  WorkflowVariable,
} from './utils/extractVariables';
import { RecordingActionIcon } from './utils/RecordingActionIcon';
import { getActionColor, getActionDescription } from './utils';

import { RecordingAction } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';
import { AgentMode } from '@/renderer/stores/automationStore';

interface RecordingActionsProps {
  actions: RecordingAction[];
  mode?: AgentMode;
}

function VariableBadge({ variable }: { variable: WorkflowVariable }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textToCopy = `${variable.name}: ${variable.value}`;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    toast.success(`Copied "${variable.name}" to clipboard`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-xs text-primary dark:text-slate-100 dark:bg-slate-600 dark:hover:bg-slate-500 transition-colors cursor-pointer group"
      title="Click to copy - mention this variable in your goal to customize"
    >
      <span className="flex items-center">
        <strong className="font-semibold mr-1 truncate max-w-40">
          {variable.name}:
        </strong>
        <span className="truncate max-w-28">{variable.value}</span>
      </span>
      {copied ? (
        <Check className="size-3 text-green-500" />
      ) : (
        <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

export function RecordingActions({
  actions,
  mode = 'automate',
}: RecordingActionsProps) {
  const variables = extractWorkflowVariables(actions);

  const footerMessage =
    mode === 'autopilot'
      ? 'These variables are from your workflow. Describe your goal below - autopilot will use this workflow as a reference.'
      : 'Enter your automation goal below to execute this workflow';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <p className="text-xs text-muted-foreground py-1 pl-3">
        Workflow Variables
        {mode === 'autopilot' && variables.length > 0 && (
          <span className="ml-1 text-primary">(Reference)</span>
        )}
      </p>
      {variables.length > 0 && (
        <div className="border-b border-border/50 bg-muted/20">
          <div className="flex flex-wrap gap-2 px-6 py-3">
            {variables.map((variable, index) => (
              <VariableBadge key={index} variable={variable} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground px-6 pb-2 italic">
            Click to copy. Mention different values in your goal to customize
            (e.g., "use email: john@example.com")
          </p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <details className="cursor-pointer">
          <summary className="text-xs text-muted-foreground hover:text-foreground mb-3 list-none">
            <span className="inline-flex items-center gap-2">
              <svg
                className="w-4 h-4 transition-transform duration-200 [details[open]_&]:rotate-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              View {actions.length} recorded actions
            </span>
          </summary>
          <div className="space-y-3 mt-2">
            {actions.map((action, index) => {
              const description = getActionDescription(action);
              const colorClass = getActionColor(action);

              return (
                <div
                  key={`${action.timestamp}-${index}`}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/60 transition-colors"
                >
                  <div className={cn('mt-0.5', colorClass)}>
                    <RecordingActionIcon type={action.type} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm mb-1">
                      <span className="text-muted-foreground">
                        {index + 1}. {description.action}
                      </span>{' '}
                      <strong className="font-medium">
                        {description.target}
                      </strong>
                    </div>
                    {description.detail && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {description.detail}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </div>

      <p className="text-xs text-muted-foreground text-center px-4 py-2">
        {footerMessage}
      </p>
    </div>
  );
}
