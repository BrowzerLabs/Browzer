import { useEffect, useState, useCallback } from 'react';
import {
  CalendarClock,
  Loader2Icon,
  RefreshCcw,
  Plus,
  Pause,
  Play,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  History,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/renderer/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/renderer/ui/dialog';
import { useSchedulerStore } from '@/renderer/stores/schedulerStore';
import { CreateScheduleDialog } from '@/renderer/components/automation';
import {
  ScheduledAutomation,
  ScheduledAutomationStatus,
  ScheduledAutomationRunLog,
  AutomationStatus,
  RecordingSession,
} from '@/shared/types';

const STATUS_CONFIG: Record<
  ScheduledAutomationStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  [ScheduledAutomationStatus.ACTIVE]: {
    label: 'Active',
    color: 'text-green-600 bg-green-50 dark:bg-green-900/20',
    icon: <Play className="size-3" />,
  },
  [ScheduledAutomationStatus.PAUSED]: {
    label: 'Paused',
    color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20',
    icon: <Pause className="size-3" />,
  },
  [ScheduledAutomationStatus.RUNNING]: {
    label: 'Running',
    color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
    icon: <Loader2Icon className="size-3 animate-spin" />,
  },
  [ScheduledAutomationStatus.COMPLETED]: {
    label: 'Completed',
    color: 'text-gray-600 bg-gray-50 dark:bg-gray-900/20',
    icon: <CheckCircle2 className="size-3" />,
  },
  [ScheduledAutomationStatus.FAILED]: {
    label: 'Failed',
    color: 'text-red-600 bg-red-50 dark:bg-red-900/20',
    icon: <XCircle className="size-3" />,
  },
};

function formatFrequency(automation: ScheduledAutomation): string {
  const time = `${String(automation.hour).padStart(2, '0')}:${String(automation.minute).padStart(2, '0')}`;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  switch (automation.frequency) {
    case 'one-time': {
      const date = new Date(automation.scheduledTime);
      return `Once on ${date.toLocaleDateString()} at ${time}`;
    }
    case 'hourly':
      return `Every hour at :${String(automation.minute).padStart(2, '0')}`;
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly':
      return `Weekly on ${days[automation.dayOfWeek ?? 0]} at ${time}`;
    case 'monthly':
      return `Monthly on day ${automation.dayOfMonth ?? 1} at ${time}`;
    default:
      return automation.frequency;
  }
}

function formatNextRun(nextRunAt?: string): string {
  if (!nextRunAt) return 'N/A';
  const date = new Date(nextRunAt);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return 'Overdue';
  if (diff < 60000) return 'Less than a minute';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000)
    return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
  return (
    date.toLocaleDateString() +
    ' ' +
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

export function Automation() {
  const {
    scheduledAutomations,
    isLoading,
    loadScheduledAutomations,
    deleteScheduledAutomation,
    pauseScheduledAutomation,
    resumeScheduledAutomation,
    getRunLogs,
  } = useSchedulerStore();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [runLogsAutomation, setRunLogsAutomation] =
    useState<ScheduledAutomation | null>(null);
  const [runLogs, setRunLogs] = useState<ScheduledAutomationRunLog[]>([]);
  const [runLogsLoading, setRunLogsLoading] = useState(false);

  const loadRecordings = useCallback(async () => {
    try {
      const allRecordings = await window.recordingAPI.getAllRecordings();
      setRecordings(allRecordings);
    } catch (error) {
      console.error('[ScheduledAutomations] Failed to load recordings:', error);
    }
  }, []);

  useEffect(() => {
    loadScheduledAutomations();
    loadRecordings();

    const unsubscribe = window.browserAPI.onSchedulerUpdated((data) => {
      useSchedulerStore.getState().setScheduledAutomations(data);
    });

    return () => {
      unsubscribe();
    };
  }, [loadScheduledAutomations, loadRecordings]);

  const handleDelete = async (id: string) => {
    if (
      !confirm('Are you sure you want to delete this scheduled automation?')
    ) {
      return;
    }
    const success = await deleteScheduledAutomation(id);
    if (success) {
      toast.success('Scheduled automation deleted');
    } else {
      toast.error('Failed to delete');
    }
  };

  const handlePause = async (id: string) => {
    const success = await pauseScheduledAutomation(id);
    if (success) toast.success('Automation paused');
    else toast.error('Failed to pause');
  };

  const handleResume = async (id: string) => {
    const success = await resumeScheduledAutomation(id);
    if (success) toast.success('Automation resumed');
    else toast.error('Failed to resume');
  };

  const handleViewLogs = async (automation: ScheduledAutomation) => {
    setRunLogsAutomation(automation);
    setRunLogsLoading(true);
    const logs = await getRunLogs(automation.id);
    setRunLogs(logs);
    setRunLogsLoading(false);
  };

  const getRecordingName = (recordingId: string): string => {
    const recording = recordings.find((r) => r.id === recordingId);
    return recording?.name ?? recordingId.slice(0, 8) + '...';
  };

  const stats = {
    total: scheduledAutomations.length,
    active: scheduledAutomations.filter(
      (a) => a.status === ScheduledAutomationStatus.ACTIVE
    ).length,
    paused: scheduledAutomations.filter(
      (a) => a.status === ScheduledAutomationStatus.PAUSED
    ).length,
    running: scheduledAutomations.filter(
      (a) => a.status === ScheduledAutomationStatus.RUNNING
    ).length,
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-black">
        <Loader2Icon className="size-4 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-slate-100 dark:bg-slate-800 min-h-screen">
      <div className="max-w-7xl mx-auto px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <CalendarClock className="w-6 h-6 text-blue-600" />
              Scheduled Automations
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {stats.total} scheduled • {stats.active} active • {stats.paused}{' '}
              paused • {stats.running} running
            </p>
          </div>

          <section className="flex items-center gap-2">
            <Button
              onClick={() => {
                loadScheduledAutomations();
                toast.success('Refreshed');
              }}
              disabled={isLoading}
              size="icon-lg"
              variant="outline"
            >
              <RefreshCcw />
            </Button>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="size-4 mr-2" />
              Schedule
            </Button>
          </section>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.total}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-sm text-green-600">Active</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-sm text-yellow-600">Paused</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.paused}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-sm text-blue-600">Running</p>
            <p className="text-2xl font-bold text-blue-600">{stats.running}</p>
          </div>
        </div>

        {/* Automations List */}
        {scheduledAutomations.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center">
            <CalendarClock className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              No scheduled automations yet
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Schedule an automation to run at specific times automatically
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="size-4 mr-2" />
              Create Schedule
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scheduledAutomations.map((automation) => {
              const statusConfig = STATUS_CONFIG[automation.status];
              return (
                <div
                  key={automation.id}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5 flex flex-col gap-3"
                >
                  {/* Title + Status */}
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate pr-2">
                      {automation.name}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusConfig.color}`}
                    >
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </div>

                  {/* Goal */}
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {automation.userGoal}
                  </p>

                  {/* Recording */}
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    Recording:{' '}
                    <span className="font-medium">
                      {getRecordingName(automation.recordingId)}
                    </span>
                  </p>

                  {/* Schedule Info */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="size-3" />
                    <span>{formatFrequency(automation)}</span>
                  </div>

                  {/* Next Run */}
                  {automation.nextRunAt &&
                    automation.status === ScheduledAutomationStatus.ACTIVE && (
                      <div className="flex items-center gap-2 text-xs text-blue-600">
                        <AlertCircle className="size-3" />
                        <span>
                          Next run: {formatNextRun(automation.nextRunAt)}
                        </span>
                      </div>
                    )}

                  {/* Run count + last run */}
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    {automation.runCount > 0
                      ? `${automation.runCount} runs • Last: ${automation.lastRunAt ? new Date(automation.lastRunAt).toLocaleString() : 'N/A'}`
                      : 'No runs yet'}
                  </div>

                  {/* Last run output */}
                  {automation.lastRunOutput && (
                    <div className="rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 p-2.5">
                      <p className="text-[10px] font-medium text-green-700 dark:text-green-400 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="size-3" />
                        Last Output
                      </p>
                      <p className="text-xs text-green-800 dark:text-green-300 line-clamp-4 whitespace-pre-wrap">
                        {automation.lastRunOutput}
                      </p>
                    </div>
                  )}

                  {/* Last run error */}
                  {automation.lastRunError && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 p-2.5">
                      <p className="text-[10px] font-medium text-red-700 dark:text-red-400 mb-1 flex items-center gap-1">
                        <XCircle className="size-3" />
                        Last Error
                      </p>
                      <p className="text-xs text-red-800 dark:text-red-300 line-clamp-3 whitespace-pre-wrap">
                        {automation.lastRunError}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-slate-800">
                    {automation.status === ScheduledAutomationStatus.ACTIVE && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePause(automation.id)}
                      >
                        <Pause className="size-3 mr-1" />
                        Pause
                      </Button>
                    )}
                    {automation.status === ScheduledAutomationStatus.PAUSED && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResume(automation.id)}
                      >
                        <Play className="size-3 mr-1" />
                        Resume
                      </Button>
                    )}
                    {automation.runCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewLogs(automation)}
                      >
                        <History className="size-3 mr-1" />
                        Logs
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 ml-auto"
                      onClick={() => handleDelete(automation.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateScheduleDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        recordings={recordings}
      />

      <Dialog
        open={!!runLogsAutomation}
        onOpenChange={(open) => {
          if (!open) {
            setRunLogsAutomation(null);
            setRunLogs([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Run Logs</DialogTitle>
            <DialogDescription>
              {runLogsAutomation?.name} — {runLogs.length} run
              {runLogs.length !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {runLogsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2Icon className="size-5 animate-spin text-blue-600" />
              </div>
            ) : runLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No run logs found
              </p>
            ) : (
              runLogs.map((log) => {
                const isSuccess = log.status === AutomationStatus.COMPLETED;
                const isFailed = log.status === AutomationStatus.FAILED;
                const isRunning = log.status === AutomationStatus.RUNNING;
                return (
                  <div
                    key={log.id}
                    className="rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isSuccess && (
                          <CheckCircle2 className="size-4 text-green-600" />
                        )}
                        {isFailed && (
                          <XCircle className="size-4 text-red-600" />
                        )}
                        {isRunning && (
                          <Loader2Icon className="size-4 animate-spin text-blue-600" />
                        )}
                        <span
                          className={`text-sm font-medium ${
                            isSuccess
                              ? 'text-green-700 dark:text-green-400'
                              : isFailed
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-blue-700 dark:text-blue-400'
                          }`}
                        >
                          {isSuccess
                            ? 'Completed'
                            : isFailed
                              ? 'Failed'
                              : 'Running'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(log.startedAt).toLocaleString()}
                      </span>
                    </div>

                    {log.completedAt && (
                      <p className="text-xs text-gray-400">
                        Duration:{' '}
                        {Math.round((log.completedAt - log.startedAt) / 1000)}s
                      </p>
                    )}

                    {log.output && (
                      <div className="rounded-md bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 p-2.5">
                        <p className="text-[10px] font-medium text-green-700 dark:text-green-400 mb-1">
                          Output
                        </p>
                        <p className="text-xs text-green-800 dark:text-green-300 whitespace-pre-wrap">
                          {log.output}
                        </p>
                      </div>
                    )}

                    {log.error && (
                      <div className="rounded-md bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 p-2.5">
                        <p className="text-[10px] font-medium text-red-700 dark:text-red-400 mb-1">
                          Error
                        </p>
                        <p className="text-xs text-red-800 dark:text-red-300 whitespace-pre-wrap">
                          {log.error}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
