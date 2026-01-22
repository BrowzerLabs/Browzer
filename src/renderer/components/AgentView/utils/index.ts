import { RecordingAction } from '@/shared/types';

export * from './RecordingActionIcon';

export function getActionColor(action: RecordingAction): string {
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
}

export const truncate = (str: string, maxLength: number) => {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
};

export function getActionDescription(action: RecordingAction): {
  action: string;
  target: string;
  detail?: string;
} {
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
        detail: action.element?.value
          ? truncate(action.element.value, 50)
          : undefined,
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
}
