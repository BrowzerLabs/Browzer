import { AlertCircle } from 'lucide-react';
import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';
import { EventItemProps } from '../types';

export function ErrorEvent({ event, isLatest }: EventItemProps) {
  const parseError = () => {
    const errorData = event.data.error || event.data;
    
    if (typeof errorData === 'string') {
      try {
        return JSON.parse(errorData);
      } catch {
        return { message: errorData };
      }
    }
    return errorData;
  };

  const error = parseError();
  const errorMessage = error.message || error.error?.message || event.data.message || 'An unknown error occurred';
  const errorStack = error.stack

  return (
    <Card className={cn(
      "p-4 border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20",
      isLatest && "animate-in fade-in slide-in-from-bottom-2 duration-300"
    )}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <AlertCircle className="w-5 h-5 text-red-600" />
        </div>
        
        <div className="flex-1 min-w-0">
          
          <div className="text-sm text-red-700 dark:text-red-300 mb-2">
            {errorMessage}
          </div>

          {errorStack !== undefined && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              <span className="font-medium">Stack:</span> {errorStack}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
