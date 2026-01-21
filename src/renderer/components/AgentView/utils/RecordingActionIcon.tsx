import {
  MousePointer,
  Globe,
  FileUp,
  Menu,
  MousePointerClickIcon,
  Type,
  Key,
  ArrowLeftRight,
} from 'lucide-react';

import { RecordingAction } from '@/shared/types';

export function RecordingActionIcon({
  type,
}: {
  type: RecordingAction['type'];
}) {
  switch (type) {
    case 'click':
      return <MousePointerClickIcon className="w-4 h-4" />;
    case 'type':
      return <Type className="w-4 h-4" />;
    case 'navigate':
      return <Globe className="w-4 h-4" />;
    case 'file':
      return <FileUp className="w-4 h-4" />;
    case 'key':
      return <Key className="w-4 h-4" />;
    case 'tab-switch':
      return <ArrowLeftRight className="w-4 h-4" />;
    case 'context-menu':
      return <Menu className="w-4 h-4" />;
    default:
      return <MousePointer className="w-4 h-4" />;
  }
}
