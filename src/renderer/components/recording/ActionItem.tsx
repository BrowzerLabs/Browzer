import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
} from '@/renderer/ui/item';
import { RecordingAction } from '@/shared/types';
import { RecordingUtils } from '@/renderer/utils';

interface ActionItemProps {
  action: RecordingAction;
  index: number;
}

export function ActionItem({ action, index }: ActionItemProps) {
  const {
    icon: Icon,
    title,
    description,
    color,
  } = RecordingUtils.getActionDisplay(action);

  return (
    <Item
      key={index}
      size="sm"
      className="animate-in slide-in-from-top duration-200 m-1 bg-slate-100 dark:bg-slate-800"
    >
      <ItemMedia variant="icon" className={color}>
        <Icon />
      </ItemMedia>

      <ItemContent>
        <ItemTitle className="text-xs font-semibold text-black dark:text-white">
          {title}
        </ItemTitle>
        <ItemDescription className="text-xs text-gray-600 dark:text-gray-400">
          {description}
        </ItemDescription>
      </ItemContent>

      <div className="text-xs text-gray-600 dark:text-gray-400">
        {new Date(action.timestamp).toLocaleTimeString()}
      </div>
    </Item>
  );
}
