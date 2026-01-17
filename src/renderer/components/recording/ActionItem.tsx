import { Item, ItemMedia, ItemContent } from '@/renderer/ui/item';
import { RecordingAction } from '@/shared/types';
import { RecordingUtils } from '@/renderer/utils';

interface ActionItemProps {
  action: RecordingAction;
  index: number;
}

export function ActionItem({ action, index }: ActionItemProps) {
  const { icon: Icon, color } = RecordingUtils.getActionDisplay(action);

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
        <h6 className="text-xs text-black dark:text-white">
          <strong>{action.type}</strong>{' '}
          {action.element?.role || action?.keys?.join('+')}
        </h6>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          {action.element?.name || action.url?.substring(0, 50)}
        </p>
        {action.element?.value && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {action.element?.value?.substring(0, 50)}
          </p>
        )}
        {action.element?.attributes && (
          <table className="text-xs text-gray-400 dark:text-gray-500">
            <tbody>
              {Object.entries(action.element.attributes).map(([key, value]) => (
                <tr key={key}>
                  <td className="py-1 font-semibold">{key}</td>
                  <td className="py-1">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ItemContent>

      <div className="text-xs text-gray-600 dark:text-gray-400">
        {new Date(action.timestamp).toLocaleTimeString()}
      </div>
    </Item>
  );
}
