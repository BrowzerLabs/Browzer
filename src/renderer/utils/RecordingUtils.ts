import {
  MousePointer2,
  Keyboard,
  Navigation,
  Circle,
  ArrowLeftRight,
  ChevronRight,
  PencilIcon,
} from 'lucide-react';

import { RecordingAction } from '@/shared/types';

export class RecordingUtils {
  public static getActionDisplay(action: RecordingAction): {
    icon: any;
    title: string;
    description: string;
    color: string;
  } {
    switch (action.type) {
      case 'click':
        return {
          icon: MousePointer2,
          title: `Clicked ${action.element?.role || 'Element'}`,
          description:
            `Text: ${action.element?.name}` +
            (action.element?.value ? ` | ${action.element?.value}` : '') +
            (action.element?.attributes?.href
              ? ` | ${action.element?.attributes?.href}`
              : ''),
          color: 'bg-blue-500/10 text-blue-400 border-blue-500/70',
        };

      case 'context-menu':
        return {
          icon: Navigation,
          title: 'Context Menu',
          description:
            action.element?.value ||
            action.element?.role ||
            'Element right-clicked',
          color: 'bg-purple-500/10 text-purple-400 border-purple-500/70',
        };

      case 'type': {
        return {
          icon: PencilIcon,
          title: `Entered in ${action.element?.role || 'textbox'}`,
          description: `${action.element?.name} | ${action.element?.value}`,
          color: 'bg-green-500/10 text-green-400 border-green-500/70',
        };
      }

      case 'navigate': {
        const url = action.url || '';
        return {
          icon: ChevronRight,
          title: 'Navigate',
          description: url,
          color: 'bg-teal-500/10 text-teal-400 border-teal-500',
        };
      }

      case 'key': {
        const shortcut = action.keys?.join(' + ');
        return {
          icon: Keyboard,
          title: 'Keypress',
          description: `Pressed ${shortcut}`,
          color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500',
        };
      }

      case 'tab-switch': {
        return {
          icon: ArrowLeftRight,
          title: 'Tab Switch',
          description: 'Switched to new tab',
          color: 'bg-slate-500/10 text-slate-400 border-slate-500/70',
        };
      }

      default:
        return {
          icon: Circle,
          title: action.type,
          description: 'Action recorded',
          color: 'bg-gray-500/10 text-gray-400 border-gray-500/70',
        };
    }
  }
}
