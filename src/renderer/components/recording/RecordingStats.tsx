import { Video, MousePointerClick, Clock } from 'lucide-react';

import { formatDuration } from '@/renderer/lib/utils';

interface RecordingStatsProps {
  total: number;
  totalActions: number;
  totalDuration: number;
}

export function RecordingStats({
  total,
  totalActions,
  totalDuration,
}: RecordingStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <StatCard
        icon={<Video className="w-5 h-5 text-blue-600" />}
        label="Total Recordings"
        value={total.toString()}
        bgColor="bg-blue-100"
      />

      <StatCard
        icon={<MousePointerClick className="w-5 h-5 text-green-600" />}
        label="Total Actions"
        value={totalActions.toString()}
        bgColor="bg-green-100"
      />

      <StatCard
        icon={<Clock className="w-5 h-5 text-purple-600" />}
        label="Total Duration"
        value={formatDuration(totalDuration)}
        bgColor="bg-purple-100"
      />
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  bgColor: string;
  subtitle?: string;
}

function StatCard({ icon, label, value, bgColor, subtitle }: StatCardProps) {
  return (
    <div className="rounded-xl border p-4 shadow-sm bg-white dark:bg-black">
      <div className="flex items-center gap-3">
        <div className={`p-2 ${bgColor} rounded-lg`}>{icon}</div>
        <div className="flex-1">
          <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
