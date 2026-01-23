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
import { shrinkUrl } from '@/shared/utils';

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
        target: shrinkUrl(params?.url || 'page'),
        icon: Navigation,
      };

    case 'click':
      const target =
        params?.nodeId || params.backend_node_id
          ? `node: ${params.nodeId || params.backend_node_id}`
          : `${params?.name} (${params?.role})`;

      return {
        action: 'Clicking on',
        target,
        icon: MousePointerClick,
      };

    case 'type':
      const targetName = params?.name
        ? `${params?.name} (${params?.role})`
        : params.nodeId || params.backend_node_id;
      let value = params?.value || params.text || '';
      targetName
        ? (value = truncate(value, 50) + ` into ${targetName}`)
        : (value = truncate(value, 50));

      return {
        action: params?.clearFirst === false ? 'Appending' : 'Typing',
        target: value,
        icon: Type,
      };

    case 'key':
    case 'keyPress':
      const modifiers = params?.modifiers || [];
      const key = params?.key || 'key';
      const keyCombo =
        modifiers.length > 0 ? `${modifiers.join(' + ')} + ${key}` : key;
      return {
        action: 'Pressing',
        target: keyCombo,
        icon: KeyRound,
      };

    case 'scroll':
      const direction = params?.direction || 'down';
      const amount = params?.amount || 100;
      return {
        action: 'Scrolling',
        target: `${direction} by ${amount}px`,
        icon: Navigation,
      };

    case 'wait':
      if (params?.waitForNetwork) {
        return {
          action: 'Waiting for',
          target: 'network idle',
          detail: params?.timeout ? `timeout: ${params.timeout}ms` : undefined,
          icon: Play,
        };
      }
      return {
        action: 'Waiting',
        target: `${params?.duration || 0}ms`,
        icon: Play,
      };

    case 'done':
      return {
        action: params?.success ? 'Completed' : 'Failed',
        target: params?.message || 'Task finished',
        icon: params?.success ? CheckCircle2 : XCircle,
      };

    case 'extract_context':
      return {
        action: 'Extracting',
        target: 'page context',
        icon: Play,
      };

    case 'file':
      const fileCount = params?.filePaths?.length || 0;
      const fileName = params?.filePaths?.[0]?.split('/').pop() || 'file';
      return {
        action: 'Uploading',
        target:
          fileCount > 1 ? `${fileCount} files` : fileName.substring(0, 40),
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
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 text-sm mb-1">
            {getIcon()}
            <span className={cn('text-muted-foreground')}>
              {description.action}{' '}
              <strong className={cn('font-medium ml-1', getTextColor())}>
                {description.target}
              </strong>
            </span>
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
                View Details
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