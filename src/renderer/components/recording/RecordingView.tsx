import { SaveRecordingForm } from './SaveRecordingForm';
import { RecordingAction } from '@/shared/types';
import { ActionList } from './ActionList';
import { Button } from '@/renderer/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { Input } from '@/renderer/ui/input';
import { Textarea } from '@/renderer/ui/textarea';
import { useRecording } from '@/renderer/hooks/useRecording';
import { Loader2 } from 'lucide-react';

interface RecordingViewProps {
  actions: RecordingAction[];
  onSave: (name: string, description: string) => void;
  onDiscard: () => void;
  state: 'recording' | 'saving';
}

export function RecordingView({
  actions,
  onSave,
  onDiscard,
  state,
}: RecordingViewProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { stopRecording, isLoading } = useRecording();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Recording name is required');
      return;
    }
    onSave(name.trim(), description.trim());
    setName('');
    setDescription('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-100 dark:bg-gray-800 relative">
      <ActionList actions={actions} />

      <div className="fixed bottom-0 bg-background p-4 w-[30%]">
        {
          state === 'recording' ?(
            <Button
              variant="destructive"
              onClick={stopRecording}
              className='w-full'
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className='size-4 animate-spin' /> : 'Stop Recording'}
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className='flex flex-col items-center justify-center gap-2'>
              <Input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value)}}
                placeholder="Recording Name"
                autoFocus
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes about this recording..."
                rows={4}
              />
              <div className='w-full flex gap-2'>
                <Button type="submit" className='flex-1'>Save</Button>
                <Button type="button" variant='destructive' onClick={onDiscard}>Discard</Button>
              </div>
            </form>
          )
        }
      </div>
    </div>
  );
}
