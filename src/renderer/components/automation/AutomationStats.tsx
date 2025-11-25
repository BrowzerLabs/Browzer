import { Card, CardContent } from '@/renderer/ui/card';
import { Bot, Clock, CheckCircle2, XCircle, Pause, MessageSquare, ListChecks } from 'lucide-react';

interface AutomationStatsProps {
  total: number;
  running: number;
  completed: number;
  failed: number;
  stopped:number;
  totalSteps: number;
  totalMessages: number;
}

export function AutomationStats({
  total,
  running,
  completed,
  failed,
  stopped,
  totalSteps,
  totalMessages,
}: AutomationStatsProps) {
  const stats = [
    {
      label: 'Total Sessions',
      value: total,
      icon: Bot,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Running',
      value: running,
      icon: Clock,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Completed',
      value: completed,
      icon: CheckCircle2,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Failed',
      value: failed,
      icon: XCircle,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      label: 'Stopped',
      value: stopped,
      icon: Pause,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
    {
      label: 'Total Steps',
      value: totalSteps,
      icon: ListChecks,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Total Messages',
      value: totalMessages,
      icon: MessageSquare,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label}>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`size-6 ${stat.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{stat.label}</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
