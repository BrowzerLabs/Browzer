import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription } from '../../ui/item';
import { RecordedAction } from '../../../shared/types';
import { RecordingUtils } from '../../utils';

interface ActionItemProps {
  action: RecordedAction;
  index: number;
}

export function ActionItem({ action }: ActionItemProps) {
  const { icon: Icon, title, description, color } = RecordingUtils.getActionDisplay(action);

  return (
    <Item size="sm" className="animate-in slide-in-from-top duration-200 m-1 bg-blue-50">
      <ItemMedia variant="icon" className={color}>
        <Icon />
      </ItemMedia>
      
      <ItemContent>
        <ItemTitle className="text-xs font-semibold text-black">{title}</ItemTitle>
        <ItemDescription className="text-xs">{description}</ItemDescription>
      </ItemContent>
      
      <div className="text-xs text-gray-600">
        {new Date(action.timestamp).toLocaleTimeString()}
      </div>
    </Item>
  );
}
