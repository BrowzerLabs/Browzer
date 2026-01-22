import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import AgentView from './AgentView';
import { RecordingView } from './recording/RecordingView';

import { RecordingAction } from '@/shared/types';

export function Sidebar() {
  const [actions, setActions] = useState<RecordingAction[]>([]);
  const [state, setState] = useState<'default' | 'recording' | 'saving'>(
    'default'
  );

  useEffect(() => {
    window.recordingAPI
      .isRecording()
      .then((isRecording) => setState(isRecording ? 'recording' : 'default'))
      .catch(() => setState('default'));

    const unsubStart = window.recordingAPI.onRecordingStarted(() => {
      setActions([]);
      setState('recording');
    });

    const unsubStop = window.recordingAPI.onRecordingStopped(() => {
      setState('saving');
    });

    const unsubAction = window.recordingAPI.onActionRecorded(
      (action: RecordingAction) => {
        setActions((prev) => {
          const updated = [...prev, action];
          return updated.sort((a, b) => b.timestamp - a.timestamp);
        });
      }
    );

    return () => {
      unsubAction();
      unsubStart();
      unsubStop();
    };
  }, []);

  const handleSaveRecording = async (name: string, description: string) => {
    try {
      await window.recordingAPI.saveRecording(name, description);
      toast.success('Recording saved successfully');
      setState('default');
    } catch {
      toast.error('Failed to save recording');
    }
  };

  const handleDiscardRecording = async () => {
    try {
      await window.recordingAPI.discardRecording();
      setActions([]);
      setState('default');
      toast.success('Recording discarded');
    } catch {
      toast.error('Failed to discard recording');
    }
  };

  return (
    <section className="h-full w-full flex flex-col overflow-hidden bg-background border-l border-l-foreground">
      {state !== 'default' ? (
        <RecordingView
          actions={actions}
          state={state}
          onSave={handleSaveRecording}
          onDiscard={handleDiscardRecording}
        />
      ) : (
        <AgentView />
      )}
    </section>
  );
}
