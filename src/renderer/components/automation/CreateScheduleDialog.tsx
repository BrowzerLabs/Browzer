import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/renderer/ui/dialog';
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
  RecordingSession,
  CreateScheduledAutomationInput,
} from '@/shared/types';

interface CreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordings: RecordingSession[];
  prefillGoal?: string;
  prefillRecordingId?: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function CreateScheduleDialog({
  open,
  onOpenChange,
  recordings,
  prefillGoal = '',
  prefillRecordingId = '',
}: CreateScheduleDialogProps) {
  const { createScheduledAutomation } = useSchedulerStore();

  const [name, setName] = useState('');
  const [userGoal, setUserGoal] = useState(prefillGoal);
  const [recordingId, setRecordingId] = useState(prefillRecordingId);
  const [frequency, setFrequency] = useState<ScheduleFrequency>('daily');
  const [scheduledDate, setScheduledDate] = useState('');
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setName('');
    setUserGoal(prefillGoal);
    setRecordingId(prefillRecordingId);
    setFrequency('daily');
    setScheduledDate('');
    setHour(9);
    setMinute(0);
    setDayOfWeek(1);
    setDayOfMonth(1);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    if (!userGoal.trim()) {
      toast.error('Please enter a goal');
      return;
    }
    if (!recordingId) {
      toast.error('Please select a recording');
      return;
    }
    if (frequency === 'one-time' && !scheduledDate) {
      toast.error('Please select a date for one-time schedule');
      return;
    }

    setIsSubmitting(true);

    try {
      const input: CreateScheduledAutomationInput = {
        name: name.trim(),
        userGoal: userGoal.trim(),
        recordingId,
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
        toast.success('Scheduled automation created');
        resetForm();
        onOpenChange(false);
      } else {
        toast.error('Failed to create scheduled automation');
      }
    } catch (error) {
      console.error('[CreateScheduleDialog] Error:', error);
      toast.error('Failed to create scheduled automation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-blue-600" />
            Schedule Automation
          </DialogTitle>
          <DialogDescription>
            Set up an automation to run automatically at specific times.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-name">Name</Label>
            <Input
              id="schedule-name"
              placeholder="e.g., Daily report check"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Goal */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-goal">Goal</Label>
            <Input
              id="schedule-goal"
              placeholder="Describe what to automate..."
              value={userGoal}
              onChange={(e) => setUserGoal(e.target.value)}
            />
          </div>

          {/* Recording */}
          <div className="flex flex-col gap-1.5">
            <Label>Recording</Label>
            <Select value={recordingId} onValueChange={setRecordingId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a recording..." />
              </SelectTrigger>
              <SelectContent>
                {recordings.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frequency */}
          <div className="flex flex-col gap-1.5">
            <Label>Frequency</Label>
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as ScheduleFrequency)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one-time">One-time</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* One-time: Date picker */}
          {frequency === 'one-time' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedule-date">Date</Label>
              <Input
                id="schedule-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          )}

          {/* Weekly: Day of week */}
          {frequency === 'weekly' && (
            <div className="flex flex-col gap-1.5">
              <Label>Day of Week</Label>
              <Select
                value={String(dayOfWeek)}
                onValueChange={(v) => setDayOfWeek(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Monthly: Day of month */}
          {frequency === 'monthly' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedule-day-of-month">Day of Month</Label>
              <Input
                id="schedule-day-of-month"
                type="number"
                min={1}
                max={31}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
              />
            </div>
          )}

          {/* Time */}
          {frequency !== 'hourly' ? (
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="schedule-hour">Hour (0-23)</Label>
                <Input
                  id="schedule-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="schedule-minute">Minute (0-59)</Label>
                <Input
                  id="schedule-minute"
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedule-minute-hourly">
                Minute past the hour (0-59)
              </Label>
              <Input
                id="schedule-minute-hourly"
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
