import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  MousePointerClick,
  Type,
  Navigation,
  KeyRound,
  Upload,
  Bell,
} from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

import { EventItemProps } from '../types';

import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';

interface StepDescription {
  action: string;
  target?: string;
  detail?: string;
  icon: LucideIcon;
}

const getStepDescription = (toolName: string, params: any): StepDescription => {
  const truncate = (str: string, maxLength: number) => {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  };

  switch (toolName) {
    case 'navigate':
      return {
        action: 'Navigating to',
        target: truncate(params?.url || 'page', 60),
        icon: Navigation,
      };

    case 'click':
      const target =
        params?.name || (params?.nodeId ? `element (node ${params.nodeId})` : params?.role || 'element');
      const detail =
        params?.role ??
        (params?.attributes?.href ? truncate(params.attributes.href, 50) : undefined);
        
      return {
        action: 'Clicking on',
        target,
        detail,
        icon: MousePointerClick,
      };

    case 'type':
      const targetName = params?.name || params?.role || 'field';
      const value = params?.value || '';
      return {
        action: params?.clearFirst === false ? 'Appending to' : 'Typing into',
        target: targetName,
        detail: value ? truncate(value, 50) : undefined,
        icon: Type,
      };

    case 'key':
      const modifiers = params?.modifiers || [];
      const key = params?.key || 'key';
      const keyCombo =
        modifiers.length > 0 ? `${modifiers.join(' + ')} + ${key}` : key;
      return {
        action: 'Pressing',
        target: keyCombo,
        icon: KeyRound,
      };

    case 'file':
      const fileCount = params?.filePaths?.length || 0;
      const fileName = params?.filePaths?.[0]?.split('/').pop() || 'file';
      return {
        action: 'Uploading',
        target: fileCount > 1 ? `${fileCount} files` : fileName,
        detail:
          params?.name || params?.selector
            ? `to ${params.name || params.selector}`
            : undefined,
        icon: Upload,
      };

    case 'notify':
      return {
        action: 'Sending notification',
        target: params?.title || 'User notification',
        detail: params?.message ? truncate(params.message, 60) : undefined,
        icon: Bell,
      };

    default:
      return {
        action: toolName,
        target: params?.name || params?.url || 'element',
        icon: Play,
      };
  }
};

export function StepEvent({ event, isLatest }: EventItemProps) {
  const isRunning = event.type === 'step_start';
  const isSuccess = event.type === 'step_complete';
  const isError = event.type === 'step_error';

  const description = getStepDescription(
    event.data?.toolName || '',
    event.data?.params || {}
  );
  const StepIcon = description.icon;

  const getStatusColor = () => {
    if (isRunning)
      return 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20';
    if (isSuccess)
      return 'border-l-green-500 bg-green-50/50 dark:bg-green-950/20';
    if (isError) return 'border-l-red-500 bg-red-50/50 dark:bg-red-950/20';
    return '';
  };

  const getIcon = () => {
    if (isRunning)
      return <Loader2 className="w-5 h-5 text-yellow-600 animate-spin" />;
    if (isSuccess) return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (isError) return <XCircle className="w-5 h-5 text-red-600" />;
    return <Play className="w-5 h-5" />;
  };

  const getTextColor = () => {
    if (isRunning) return 'text-yellow-900 dark:text-yellow-100';
    if (isSuccess) return 'text-green-900 dark:text-green-100';
    if (isError) return 'text-red-900 dark:text-red-100';
    return '';
  };

  return (
    <Card
      className={cn(
        'p-4 border-l-4',
        getStatusColor(),
        isLatest && 'animate-in fade-in slide-in-from-bottom-2 duration-300'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-muted-foreground">
              Step {event.data.stepNumber}
            </span>
            <div
              className={cn(
                'p-1 rounded',
                isRunning
                  ? 'bg-yellow-100 dark:bg-yellow-950'
                  : isSuccess
                    ? 'bg-green-100 dark:bg-green-950'
                    : isError
                      ? 'bg-red-100 dark:bg-red-950'
                      : 'bg-muted'
              )}
            >
              <StepIcon className="w-3 h-3" />
            </div>
          </div>

          <div className="text-sm mb-1">
            <span className="text-muted-foreground">{description.action}</span>{' '}
            {description.target && (
              <strong className={cn('font-medium', getTextColor())}>
                {description.target}
              </strong>
            )}
          </div>

          {description.detail && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {description.detail}
            </p>
          )}

          {event.data && event.data?.error && (
            <p className="mt-2 p-3 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-700 dark:text-red-300">
              {event.data.error}
            </p>
          )}

          {event.data.params && (
            <details className="cursor-pointer mt-2">
              <summary className="text-xs text-muted-foreground hover:text-foreground">
                View raw params
              </summary>
              <pre className="mt-2 p-2 bg-muted/50 rounded overflow-x-auto text-xs">
                {JSON.stringify(event.data.params, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </Card>
  );
}
