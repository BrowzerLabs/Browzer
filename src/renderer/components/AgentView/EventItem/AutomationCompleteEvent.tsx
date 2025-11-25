import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Card } from '@/renderer/ui/card';
import { Badge } from '@/renderer/ui/badge';
import { cn } from '@/renderer/lib/utils';
import { EventItemProps } from '../types';

export function AutomationCompleteEvent({ event, isLatest }: EventItemProps) {
  const isSuccess = event.data?.success === true;
  const isMaxStepsReached = event.data?.error?.includes?.('Maximum execution steps');
  const totalSteps = event.data?.totalSteps;
  const errorMessage = event.data?.error;

  const getStatusStyles = () => {
    if (isSuccess) {
      return {
        border: 'border-l-green-500',
        bg: 'bg-green-50/50 dark:bg-green-950/20',
        icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
        titleColor: 'text-green-900 dark:text-green-100',
        textColor: 'text-green-700 dark:text-green-300',
        title: 'Automation Complete',
        message: 'Task completed successfully'
      };
    }
    
    if (isMaxStepsReached) {
      return {
        border: 'border-l-amber-500',
        bg: 'bg-amber-50/50 dark:bg-amber-950/20',
        icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
        titleColor: 'text-amber-900 dark:text-amber-100',
        textColor: 'text-amber-700 dark:text-amber-300',
        title: 'Step Limit Reached',
        message: errorMessage || 'Maximum execution steps limit reached'
      };
    }

    return {
      border: 'border-l-red-500',
      bg: 'bg-red-50/50 dark:bg-red-950/20',
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      titleColor: 'text-red-900 dark:text-red-100',
      textColor: 'text-red-700 dark:text-red-300',
      title: 'Automation Failed',
      message: errorMessage || 'Task could not be completed'
    };
  };

  const styles = getStatusStyles();

  return (
    <Card className={cn(
      "p-4 border-l-4",
      styles.border,
      styles.bg,
      isLatest && "animate-in fade-in slide-in-from-bottom-2 duration-300"
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {styles.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className={cn("text-sm font-medium", styles.titleColor)}>
              {styles.title}
            </p>
            {isSuccess && (
              <Badge variant="success" className="text-xs">
                Success
              </Badge>
            )}
            {isMaxStepsReached && (
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-300">
                Limit Reached
              </Badge>
            )}
            {!isSuccess && !isMaxStepsReached && (
              <Badge variant="destructive" className="text-xs">
                Failed
              </Badge>
            )}
          </div>
          
          <p className={cn("text-sm", styles.textColor)}>
            {styles.message}
          </p>

          {totalSteps !== undefined && totalSteps > 0 && (
            <p className={cn("text-xs mt-2 opacity-75", styles.textColor)}>
              Total steps executed: {totalSteps}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
