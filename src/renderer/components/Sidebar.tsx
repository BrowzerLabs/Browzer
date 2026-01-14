import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import AgentView from './AgentView';
import { LiveRecordingView } from './recording';

import { RecordingAction } from '@/shared/types';

export function Sidebar() {
  const [actions, setActions] = useState<RecordingAction[]>([]);
  const [state, setState] = useState<'default' | 'recording' | 'saving'>('default');

  useEffect(() => {
    window.recordingAPI.isRecording().then(() => setState('recording'));

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
    await window.recordingAPI.saveRecording(name, description)
    .then(() => toast.success('Recording saved successfully'))
    .catch(() => toast.error('Failed to save recording'));
    setState('default');
  };

  const handleDiscardRecording = async () => {
    await window.recordingAPI.discardRecording();
    setActions([])
    setState('default')
    toast.success('Recording discarded');
  };

  return (
    <section className="h-full w-full flex flex-col overflow-hidden bg-background border-l border-l-foreground">
      {state !== 'default' ? (
        <LiveRecordingView
          actions={actions}
          isRecording={state === 'recording'}
          showSaveForm={state === 'saving'}
          onSave={handleSaveRecording}
          onDiscard={handleDiscardRecording}
        />
      ) : (
        <AgentView />
      )}
    </section>
  );
}
