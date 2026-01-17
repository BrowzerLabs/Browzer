import { useState } from 'react';
import { toast } from 'sonner';

import { Input } from '@/renderer/ui/input';
import { Textarea } from '@/renderer/ui/textarea';
import { Button } from '@/renderer/ui/button';
import { Label } from '@/renderer/ui/label';

interface SaveRecordingFormProps {
  onSave: (name: string, description: string) => void;
  onDiscard: () => void;
}

export function SaveRecordingForm({
  onSave,
  onDiscard,
}: SaveRecordingFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Recording name is required');
      toast.error('Recording name is required');
      return;
    }
    onSave(name.trim(), description.trim());
    setName('');
    setDescription('');
    setError('');
  };

  const handleDiscardClick = () => {
    setName('');
    setDescription('');
    setError('');
    onDiscard();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h3 className="text-lg font-semibold mb-2">Save Recording</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Input */}
        <div>
          <Label
            htmlFor="recording-name"
            className="block text-sm font-medium mb-2"
          >
            Recording Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="recording-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="e.g., Login Flow, Checkout Process"
            autoFocus
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>

        {/* Description Input */}
        <div>
          <Label
            htmlFor="recording-description"
            className="block text-sm font-medium mb-2"
          >
            Description (Optional)
          </Label>
          <Textarea
            id="recording-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add notes about this recording..."
            rows={4}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3 justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={handleDiscardClick}
            className="w-1/2"
          >
            Discard
          </Button>
          <Button type="submit" className="w-1/2">
            Save Recording
          </Button>
        </div>
      </form>
    </div>
  );
}
