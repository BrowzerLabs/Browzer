import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Play,
  Bot,
  CheckCircle2,
  XCircle,
  StopCircle,
  Loader2,
  Link,
  FileText,
  Zap,
  Video,
  MousePointerClick,
  Type,
  Navigation,
  KeyRound,
  Upload,
  Globe,
  Timer,
  Eye,
} from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

import type { AuditLogWithEvents, AuditEvent } from '@/shared/types/audit';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/renderer/ui/card';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import { cn } from '@/renderer/lib/utils';

interface AuditLogDetailProps {
  log: AuditLogWithEvents;
  onBack: () => void;
}

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString();

const formatDuration = (startedAt: number, endedAt?: number) => {
  if (!endedAt) return 'In progress';
  const durationMs = endedAt - startedAt;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'stopped':
      return <StopCircle className="w-5 h-5 text-yellow-500" />;
    case 'running':
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    default:
      return null;
  }
};

const getToolIcon = (toolName: string): LucideIcon => {
  switch (toolName) {
    case 'click':
      return MousePointerClick;
    case 'type':
      return Type;
    case 'navigate':
      return Navigation;
    case 'keyPress':
    case 'key':
      return KeyRound;
    case 'file':
      return Upload;
    case 'create_tab':
      return Globe;
    case 'wait':
      return Timer;
    case 'extract_context':
      return Eye;
    case 'scroll':
      return Navigation;
    default:
      return Play;
  }
};

function processEventsForAuditTrail(
  events: AuditEvent[]
): { event: AuditEvent; llmNotes: string }[] {
  const result: { event: AuditEvent; llmNotes: string }[] = [];
  let pendingLlmNotes: string[] = [];

  for (const event of events) {
    const eventType = event.eventType;

    if (eventType === 'thinking' || eventType === 'text_response') {
      const data = event.eventData as any;
      const message = data?.message || '';
      if (message) pendingLlmNotes.push(message);
      continue;
    }

    result.push({
      event,
      llmNotes: pendingLlmNotes.join(' | '),
    });
    pendingLlmNotes = [];
  }

  return result;
}

function AuditTrailRow({
  event,
  userEmail,
  llmNotes,
}: {
  event: AuditEvent;
  userEmail: string;
  llmNotes?: string;
}) {
  const data = event.eventData as any;

  const formatFullTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const inferToolName = (params: any): string => {
    if (!params || typeof params !== 'object') return 'unknown';
    if (params.url && !params.nodeId && !params.backend_node_id)
      return 'navigate';
    if (params.key) return 'keyPress';
    if (params.direction && params.amount !== undefined) return 'scroll';
    if (params.filePaths) return 'file';
    if (params.waitForNetwork || params.duration !== undefined) return 'wait';
    if (
      (params.value || params.text) &&
      (params.nodeId || params.backend_node_id)
    )
      return 'type';
    if (params.nodeId || params.backend_node_id || (params.role && params.name))
      return 'click';
    if (params.success !== undefined && params.message) return 'done';
    return 'unknown';
  };

  const getActionInfo = () => {
    switch (event.eventType) {
      case 'step_start':
      case 'step_complete':
      case 'step_error': {
        const params = data?.params || {};
        const toolName = data?.toolName || inferToolName(params);

        let description = '';
        let url = data?.url || params?.url || '-';

        switch (toolName) {
          case 'navigate':
            description = `Navigate to ${params?.url || 'page'}`;
            url = params?.url || url;
            break;
          case 'click': {
            const clickTarget =
              params?.name ||
              params?.role ||
              `node ${params?.nodeId || params?.backend_node_id || ''}`;
            description = `Click on "${clickTarget}"`;
            break;
          }
          case 'type': {
            const typeTarget =
              params?.name ||
              params?.role ||
              (params?.nodeId || params?.backend_node_id
                ? `node ${params?.nodeId || params?.backend_node_id}`
                : 'input field');
            const typeValue = params?.value || params?.text || '';
            description = `Type "${typeValue.substring(0, 50)}${typeValue.length > 50 ? '...' : ''}" into ${typeTarget}`;
            break;
          }
          case 'key':
          case 'keyPress': {
            const modifiers = params?.modifiers?.join(' + ') || '';
            const keyCombo = modifiers
              ? `${modifiers} + ${params?.key}`
              : params?.key;
            description = `Press key: ${keyCombo}`;
            break;
          }
          case 'scroll':
            description = `Scroll ${params?.direction || 'down'} by ${params?.amount || 100}px`;
            break;
          case 'wait':
            description = params?.waitForNetwork
              ? 'Wait for network idle'
              : `Wait ${params?.duration || 0}ms`;
            break;
          case 'extract_context':
            description = 'Extract page context';
            break;
          case 'file': {
            const fileName = params?.filePaths?.[0]?.split('/').pop() || 'file';
            description = `Upload file: ${fileName}`;
            break;
          }
          case 'notify':
            description = `Notification: ${params?.title || params?.message || '-'}`;
            break;
          case 'create_tab':
            description = `Create new tab: ${params?.url || 'browzer://home'}`;
            url = params?.url || url;
            break;
          case 'done':
            description = params?.success
              ? 'Task completed'
              : `Task failed: ${params?.message || ''}`;
            break;
          default: {
            const target = params?.name || params?.role || params?.url || '';
            description = target
              ? `Action on "${target}"`
              : `Action: ${JSON.stringify(params).substring(0, 80)}`;
          }
        }

        if (data?.error) {
          description += ` - Error: ${data.error}`;
        }

        return {
          toolName,
          description,
          url,
          llmNote: data?.reasoning || data?.llmNote || '-',
        };
      }
      case 'automation_complete':
      case 'autopilot_complete':
        return {
          toolName: 'done',
          description:
            data?.message ||
            (data?.success ? 'Task completed successfully' : 'Task failed'),
          url: '-',
          llmNote: '-',
        };
      case 'automation_stopped':
      case 'autopilot_stopped':
        return {
          toolName: 'stopped',
          description: data?.message || 'Stopped by user',
          url: '-',
          llmNote: '-',
        };
      case 'automation_error':
      case 'autopilot_error':
        return {
          toolName: 'error',
          description: data?.error || data?.message || 'Unknown error',
          url: '-',
          llmNote: '-',
        };
      default:
        return {
          toolName: 'unknown',
          description: JSON.stringify(data || {}).substring(0, 100),
          url: '-',
          llmNote: '-',
        };
    }
  };

  const info = getActionInfo();
  const isError =
    event.eventType.includes('error') ||
    event.eventType === 'step_error' ||
    data?.error;
  const isSuccess =
    event.eventType === 'step_complete' || event.eventType.includes('complete');
  const isPending = event.eventType === 'step_start';
  const displayLlmNote = llmNotes || info.llmNote || '-';

  const getStatusBadge = () => {
    if (isError)
      return (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          Error
        </Badge>
      );
    if (isSuccess)
      return (
        <Badge className="text-[10px] px-1.5 py-0 bg-green-600">Done</Badge>
      );
    if (isPending)
      return (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          Started
        </Badge>
      );
    return null;
  };

  const ToolIcon = getToolIcon(info.toolName);

  return (
    <tr
      className={cn(
        'hover:bg-muted/50 transition-colors',
        isError && 'bg-red-50/50 dark:bg-red-950/20',
        isSuccess && !isError && 'bg-green-50/30 dark:bg-green-950/10'
      )}
    >
      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        <span className="line-clamp-1 max-w-[120px] block" title={userEmail}>
          {userEmail}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap font-mono">
        {formatFullTimestamp(event.timestamp)}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <ToolIcon
            className={cn(
              'w-4 h-4 flex-shrink-0',
              isError
                ? 'text-red-500'
                : isSuccess
                  ? 'text-green-500'
                  : 'text-muted-foreground'
            )}
          />
          <span
            className={cn(
              'font-medium capitalize',
              isError && 'text-red-600 dark:text-red-400'
            )}
          >
            {info.toolName}
          </span>
          {getStatusBadge()}
        </div>
      </td>
      <td
        className={cn(
          'px-3 py-2.5 max-w-[300px]',
          isError && 'text-red-600 dark:text-red-400'
        )}
      >
        <span className="line-clamp-2 text-sm" title={info.description}>
          {info.description}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[180px]">
        {info.url !== '-' ? (
          <span
            className="line-clamp-1 font-mono text-blue-600 dark:text-blue-400"
            title={info.url}
          >
            {info.url}
          </span>
        ) : (
          <span className="text-muted-foreground/50">-</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px]">
        <span className="line-clamp-2 italic" title={displayLlmNote}>
          {displayLlmNote !== '-' ? (
            displayLlmNote
          ) : (
            <span className="text-muted-foreground/50">-</span>
          )}
        </span>
      </td>
    </tr>
  );
}

export function AuditLogDetail({ log, onBack }: AuditLogDetailProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(true);

  useEffect(() => {
    const loadVideoUrl = async () => {
      try {
        setVideoLoading(true);
        const url = await window.auditAPI.getVideoUrl(log.id);
        setVideoUrl(url);
      } catch {
        setVideoUrl(null);
      } finally {
        setVideoLoading(false);
      }
    };
    loadVideoUrl();
  }, [log.id]);

  const processedEvents = processEventsForAuditTrail(log.events);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 pb-4 border-b flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold line-clamp-1">{log.userGoal}</h2>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(log.status)}
          <span className="capitalize font-medium">{log.status}</span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          <Card className="mb-4">
            <CardContent className="py-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground truncate max-w-[200px]">
                    {log.userEmail}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {log.agentMode === 'automate' ? (
                    <Play className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Bot className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="capitalize">{log.agentMode}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>{formatDate(log.startedAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span>{formatDuration(log.startedAt, log.endedAt)}</span>
                  <span className="text-muted-foreground">
                    ({log.totalSteps} steps)
                  </span>
                </div>
                {log.startUrl && (
                  <div className="flex items-center gap-2">
                    <Link className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate max-w-[200px] text-blue-600 dark:text-blue-400">
                      {log.startUrl}
                    </span>
                  </div>
                )}
              </div>
              {log.resultMessage && (
                <div className="flex items-start gap-2 text-sm mt-2 pt-2 border-t">
                  <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                  <p className="text-muted-foreground">{log.resultMessage}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Video className="w-4 h-4" />
                Screen Recording
              </CardTitle>
            </CardHeader>
            <CardContent>
              {videoLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded-lg max-h-[300px] bg-black"
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <Video className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No video available</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Audit Trail
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {processedEvents.length} events
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {processedEvents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-y sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          User
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Time
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Action
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          URL
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          LLM Note
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {processedEvents.map((row) => (
                        <AuditTrailRow
                          key={row.event.id}
                          event={row.event}
                          userEmail={log.userEmail}
                          llmNotes={row.llmNotes}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  No events recorded
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
