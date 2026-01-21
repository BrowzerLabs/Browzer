import {
  Type,
  Navigation,
  KeyRound,
  Clock,
  CircleDot,
  MousePointerClick,
  PointerIcon,
  ArrowLeftRight,
  UploadIcon,
} from 'lucide-react';

import { RecordingAction } from '@/shared/types';
import { cn } from '@/renderer/lib/utils';

interface ActionListProps {
  actions: RecordingAction[];
}

const getActionIcon = (action: RecordingAction) => {
  switch (action.type) {
    case 'click':
      return MousePointerClick;
    case 'type':
      return Type;
    case 'navigate':
      return Navigation;
    case 'key':
      return KeyRound;
    case 'file':
      return UploadIcon;
    case 'context-menu':
      return PointerIcon;
    case 'tab-switch':
      return ArrowLeftRight;
    default:
      return CircleDot;
  }
};

const getActionColor = (action: RecordingAction) => {
  switch (action.type) {
    case 'click':
      return 'text-blue-500';
    case 'type':
      return 'text-green-500';
    case 'navigate':
      return 'text-purple-500';
    case 'key':
      return 'text-yellow-500';
    case 'file':
      return 'text-pink-500';
    case 'context-menu':
      return 'text-orange-500';
    case 'tab-switch':
      return 'text-cyan-500';
    default:
      return 'text-gray-500';
  }
};

const getActionDescription = (action: RecordingAction) => {
  const truncate = (str: string, maxLength: number) => {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
  };

  switch (action.type) {
    case 'click':
      return {
        action: 'Clicked on',
        target: action.element?.name || action.element?.role || 'element',
      };
    case 'type':
      return {
        action: 'Typed into',
        target: action.element?.name || action.element?.role || 'field',
        detail: action.element?.value ? truncate(action.element.value, 50) : undefined,
      };
    case 'navigate':
      return {
        action: 'Navigated to',
        target: truncate(action.url, 50),
      };
    case 'key':
      return {
        action: 'Pressed',
        target: action.keys?.join(' + ') || 'key',
      };
    case 'file':
      return {
        action: 'Uploaded file',
        target: action.filePaths?.join(', ') || 'file',
      };
    case 'context-menu':
      return {
        action: 'Opened context menu on',
        target: action.element?.name || action.element?.role || 'element',
      };
    case 'tab-switch':
      return {
        action: 'Switched to tab',
        target: truncate(action.url, 50),
      };
    default:
      return {
        action: action.type,
        target: action.element?.name || 'unknown',
      };
  }
};

export function ActionList({ actions }: ActionListProps) {
  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Clock className="w-12 h-12 text-muted-foreground mb-3" />
        <h3 className="text-sm font-semibold mb-2">No Actions Yet</h3>
        <p className="text-xs text-muted-foreground">
          Perform actions in your browser to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      {actions.map((action, index) => {
        const Icon = getActionIcon(action);
        const colorClass = getActionColor(action);
        const description = getActionDescription(action);

        return (
          <div
            key={`${action.timestamp}-${index}`}
            className={cn(
              'p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors',
              'animate-in slide-in-from-top duration-200'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn('mt-0.5', colorClass)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm mb-1">
                  <span className="text-muted-foreground">{description.action}</span>{' '}
                  <strong className="font-medium">{description.target}</strong>
                </div>
                {description.detail && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {description.detail}
                  </p>
                )}
                {action.element?.role && action.type !== 'click' && (
                  <p className="text-xs text-gray-500 dark:text-gray-600 mt-0.5">
                    {action.element.role}
                  </p>
                )}
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(action.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
