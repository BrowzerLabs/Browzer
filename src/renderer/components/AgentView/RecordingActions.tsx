import {
  extractWorkflowVariables,
  WorkflowVariable,
} from './utils/extractVariables';
import { RecordingActionIcon } from './utils/RecordingActionIcon';
import { getActionColor, getActionDescription } from './utils';

import { RecordingAction } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';

interface RecordingActionsProps {
  actions: RecordingAction[];
}

function VariableBadge({ variable }: { variable: WorkflowVariable }) {
  return (
    <div className="flex items-center justify-center px-4 py-1 rounded-full bg-primary/20 text-xs text-primary dark:text-slate-100 dark:bg-slate-600">
      <strong className="font-semibold mr-1 truncate max-w-48">
        {variable.name}:{' '}
      </strong>
      <span className="truncate max-w-32">{variable.value}</span>
    </div>
  );
}

export function RecordingActions({ actions }: RecordingActionsProps) {
  const variables = extractWorkflowVariables(actions);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <p className="text-xs text-muted-foreground py-1 pl-3">
        Workflow Variables
      </p>
      {variables.length > 0 && (
        <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-border/50 bg-muted/20">
          {variables.map((variable, index) => (
            <VariableBadge key={index} variable={variable} />
          ))}
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

      <p className="text-xs text-muted-foreground text-center">
        Enter your automation goal below to execute this workflow
      </p>
    </div>
  );
}