import { useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/ui/select';
import { useSchedulerStore } from '@/renderer/stores/schedulerStore';
import {
  ScheduleFrequency,
  CreateScheduledAutomationInput,
} from '@/shared/types';

interface SchedulePanelProps {
  userGoal: string;
  selectedRecordingId: string | null;
  isRunning: boolean;
}

const DAYS_OF_WEEK = [
  { value: '0', label: 'Sun' },
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
];

export function SchedulePanel({
  userGoal,
  selectedRecordingId,
  isRunning,
}: SchedulePanelProps) {
  const { createScheduledAutomation } = useSchedulerStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [scheduledDate, setScheduledDate] = useState('');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSchedule =
    !isRunning &&
    userGoal.trim() &&
    selectedRecordingId &&
    name.trim() &&
    (frequency !== 'one-time' || scheduledDate);

  const handleSchedule = async () => {
    if (!userGoal.trim()) {
      toast.error('Enter a goal in the input below first');
      return;
    }
    if (!selectedRecordingId) {
      toast.error('Select a recording first');
      return;
    }
    if (!name.trim()) {
      toast.error('Enter a schedule name');
      return;
    }
    if (frequency === 'one-time' && !scheduledDate) {
      toast.error('Select a date for one-time schedule');
      return;
    }

    setIsSubmitting(true);
    try {
      const input: CreateScheduledAutomationInput = {
        name: name.trim(),
        userGoal: userGoal.trim(),
        recordingId: selectedRecordingId,
        frequency,
        scheduledTime:
          frequency === 'one-time'
            ? new Date(scheduledDate).toISOString()
            : new Date().toISOString(),
        hour,
        minute,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
      };

      const result = await createScheduledAutomation(input);
      if (result) {
        toast.success('Automation scheduled!');
        setName('');
        setIsExpanded(false);
      } else {
        toast.error('Failed to schedule automation');
      }
    } catch (error) {
      console.error('[SchedulePanel] Error:', error);
      toast.error('Failed to schedule automation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-t border-border/50">
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" />
          Schedule this automation
        </span>
        {isExpanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronUp className="size-3.5" />
        )}
      </button>

      {/* Expandable form */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2.5 animate-in slide-in-from-bottom-2 duration-200">
          {/* Name */}
          <div className="space-y-1">
            <Label className="text-xs">Schedule Name</Label>
            <Input
              placeholder="e.g., Daily report check"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-1">
            <Label className="text-xs">Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as ScheduleFrequency)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="one-time">One-time</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* One-time date */}
          {frequency === 'one-time' && (
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* Weekly day */}
          {frequency === 'weekly' && (
            <div className="space-y-1">
              <Label className="text-xs">Day</Label>
              <Select
                value={String(dayOfWeek)}
                onValueChange={(v) => setDayOfWeek(Number(v))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Monthly day */}
          {frequency === 'monthly' && (
            <div className="space-y-1">
              <Label className="text-xs">Day of Month</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="h-8 text-xs"
              />
            </div>
          )}

          {/* Time */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Clock className="size-3" />
              {frequency === 'hourly' ? 'Minute past the hour' : 'Time'}
            </Label>
            {frequency === 'hourly' ? (
              <Input
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                className="h-8 text-xs"
                placeholder=":00"
              />
            ) : (
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  className="h-8 text-xs flex-1"
                  placeholder="HH"
                />
                <span className="flex items-center text-muted-foreground text-xs">
                  :
                </span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                  className="h-8 text-xs flex-1"
                  placeholder="MM"
                />
              </div>
            )}
          </div>

          {/* Schedule button */}
          <Button
            size="sm"
            className="w-full text-xs h-8"
            disabled={!canSchedule || isSubmitting}
            onClick={handleSchedule}
          >
            {isSubmitting ? (
              <Loader2 className="size-3 animate-spin mr-1.5" />
            ) : (
              <CalendarClock className="size-3 mr-1.5" />
            )}
            {isSubmitting ? 'Scheduling...' : 'Schedule Automation'}
          </Button>

          {(!userGoal.trim() || !selectedRecordingId) && (
            <p className="text-[10px] text-muted-foreground text-center">
              {!selectedRecordingId
                ? 'Select a recording above first'
                : 'Type a goal below first'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
