import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { ScheduleType, RecordingSession } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/renderer/ui/dialog';
import { Input } from '@/renderer/ui/input';
import { Label } from '@/renderer/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/ui/select';
import { useScheduledAutomationStore } from '@/renderer/stores/scheduledAutomationStore';

interface CreateScheduledAutomationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateScheduledAutomationDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateScheduledAutomationDialogProps) {
  const [name, setName] = useState('');
  const [userGoal, setUserGoal] = useState('');
  const [recordingId, setRecordingId] = useState('');
  const [scheduleType, setScheduleType] = useState<ScheduleType>('daily');
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [loading, setLoading] = useState(false);

  const { createScheduledAutomation } = useScheduledAutomationStore();

  useEffect(() => {
    if (open) {
      loadRecordings();
    }
  }, [open]);

  const loadRecordings = async () => {
    try {
      const data = await window.recordingAPI.getAllRecordings();
      setRecordings(data);
    } catch (error) {
      console.error('Failed to load recordings:', error);
      toast.error('Failed to load recordings');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    setLoading(true);
    try {
      const result = await createScheduledAutomation({
        name: name.trim(),
        userGoal: userGoal.trim(),
        recordingId,
        type: scheduleType,
      });

      if (result) {
        toast.success('Scheduled automation created');
        onOpenChange(false);
        resetForm();
        onSuccess?.();
      } else {
        toast.error('Failed to create scheduled automation');
      }
    } catch (error) {
      console.error('Failed to create scheduled automation:', error);
      toast.error('Failed to create scheduled automation');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setUserGoal('');
    setRecordingId('');
    setScheduleType('daily');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create Scheduled Automation
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Daily Report Generation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Input
              id="goal"
              placeholder="Describe what this automation should do"
              value={userGoal}
              onChange={(e) => setUserGoal(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recording">Recording</Label>
            <Select value={recordingId} onValueChange={setRecordingId} required>
              <SelectTrigger>
                <SelectValue placeholder="Select a recording" />
              </SelectTrigger>
              <SelectContent>
                {recordings.map((recording) => (
                  <SelectItem key={recording.id} value={recording.id}>
                    {recording.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {recordings.length === 0 && (
              <p className="text-xs text-gray-500">
                No recordings available. Create a recording first.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule">Schedule Type</Label>
            <Select
              value={scheduleType}
              onValueChange={(value) => setScheduleType(value as ScheduleType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || recordings.length === 0}>
              {loading ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
