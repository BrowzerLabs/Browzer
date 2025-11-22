import { AlertCircle } from 'lucide-react';
import { Card } from '@/renderer/ui/card';
import { cn } from '@/renderer/lib/utils';
import { EventItemProps } from '../types';

export function ErrorEvent({ event, isLatest }: EventItemProps) {
  // Parse error data
  const parseError = () => {
    const errorData = event.data.error || event.data;
    
    // Handle different error formats
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
  const errorType = error.type || error.error?.type;
  const requestId = error.request_id;

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
          <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-2">
            {event.type === 'recovery_failed' ? 'Recovery Failed' : 'Automation Error'}
          </p>
          
          <div className="text-sm text-red-700 dark:text-red-300 mb-2">
            {errorMessage}
          </div>

          {errorType && (
            <p className="text-xs text-red-600 dark:text-red-400 mb-1">
              <span className="font-medium">Type:</span> {errorType}
            </p>
          )}

          {requestId && (
            <p className="text-xs text-red-600 dark:text-red-400 mb-1">
              <span className="font-medium">Request ID:</span> {requestId}
            </p>
          )}

          {event.data.recoveryAttempts !== undefined && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
              <span className="font-medium">Recovery attempts:</span> {event.data.recoveryAttempts}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
