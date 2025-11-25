import { useEffect, useState } from 'react';
import { SessionListItem } from '@/renderer/stores/automationStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/renderer/ui/dialog';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import { Separator } from '@/renderer/ui/separator';
import { Play, Trash2, Clock, CheckCircle2, XCircle, Pause, MessageSquare, ListChecks, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { AutomationStatus } from '@/shared/types';

interface AutomationDialogProps {
  session: SessionListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResume: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
}

export function AutomationDialog({ session, open, onOpenChange, onResume, onDelete }: AutomationDialogProps) {
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && session) {
      loadSessionDetails();
    }
  }, [open, session]);

  const loadSessionDetails = async () => {
    if (!session) return;

    try {
      setLoading(true);
      const details = await window.browserAPI.getAutomationSessionDetails(session.sessionId);
      setSessionDetails(details);
    } catch (error) {
      console.error('Failed to load session details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!session) return null;

  const getStatusIcon = () => {
    switch (session.status) {
      case AutomationStatus.RUNNING:
        return <Clock className="w-5 h-5 animate-pulse text-blue-600" />;
      case AutomationStatus.COMPLETED:
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case AutomationStatus.STOPPED:
        return <Pause className="w-5 h-5 text-orange-600" />;
      case AutomationStatus.FAILED:
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (session.status) {
      case AutomationStatus.RUNNING:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case AutomationStatus.COMPLETED:
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case AutomationStatus.STOPPED:
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case AutomationStatus.FAILED:
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-4 pr-5">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                {getStatusIcon()}
                Automation Session
              </DialogTitle>
              <DialogDescription className="mt-2 line-clamp-2" title={session.userGoal}>
                {session.userGoal}
              </DialogDescription>
            </div>
            <Badge className={`${getStatusColor()} flex-shrink-0`}>
              {session.status}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0  overflow-auto">
          <div className="space-y-6 pr-5">
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Session Information</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-gray-600 dark:text-gray-400 mb-1 text-xs font-medium">Session ID</p>
                  <p className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded truncate" title={session.sessionId}>
                    {session.sessionId}
                  </p>
                </div>

                {session.recordingId && (
                  <div className="min-w-0">
                    <p className="text-gray-600 dark:text-gray-400 mb-1 text-xs font-medium">Recording ID</p>
                    <p className="font-mono text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded truncate" title={session.recordingId}>
                      {session.recordingId}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1 text-xs font-medium">
                    <Calendar className="w-3 h-3" />
                    Created
                  </p>
                  <p className="text-gray-900 dark:text-white text-sm">
                    {format(session.createdAt, 'PPpp')}
                  </p>
                </div>

                <div>
                  <p className="text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1 text-xs font-medium">
                    <Calendar className="w-3 h-3" />
                    Updated
                  </p>
                  <p className="text-gray-900 dark:text-white text-sm">
                    {format(session.updatedAt, 'PPpp')}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Statistics</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded">
                    <ListChecks className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Steps Executed</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{session.stepCount}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/20 rounded">
                    <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Messages</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{session.messageCount}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Session Details (if loaded) */}
            {sessionDetails && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Session Details</h3>
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg overflow-hidden">
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(sessionDetails, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t flex-shrink-0">
          {/* {(session.status === AutomationStatus.STOPPED || session.status === AutomationStatus.FAILED) && (
            <Button
              onClick={() => {
                onResume(session.sessionId);
                onOpenChange(false);
              }}
              className="flex-1"
            >
              <Play className="w-4 h-4 mr-2" />
              Resume Session
            </Button>
          )} */}

          <Button
            variant="destructive"
            onClick={() => {
              onDelete(session.sessionId);
              onOpenChange(false);
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>

          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
