import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import AgentView from './AgentView';
import { LiveRecordingView } from './recording';

import { RecordedAction } from '@/shared/types';

export function Sidebar() {
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [recordingData, setRecordingData] = useState<{
    actions: RecordedAction[];
    duration: number;
    startUrl: string;
  } | null>(null);

  useEffect(() => {
    window.browserAPI.isRecording().then(setIsRecording);

    const unsubStart = window.browserAPI.onRecordingStarted(() => {
      setIsRecording(true);
      setActions([]);
      setShowSaveForm(false);
    });

    const unsubStop = window.browserAPI.onRecordingStopped((data) => {
      setIsRecording(false);
      setRecordingData(data);
      if (data.actions && data.actions.length > 0) {
        setShowSaveForm(true);
      }
    });

    const unsubAction = window.browserAPI.onRecordingAction(
      (action: RecordedAction) => {
        setActions((prev) => {
          const isDuplicate = prev.some(
            (a) =>
              a.timestamp === action.timestamp &&
              a.type === action.type &&
              JSON.stringify(a.target) === JSON.stringify(action.target)
          );

          if (isDuplicate) {
            console.warn('Duplicate action detected, skipping:', action);
            return prev;
          }

          const updated = [...prev, action];
          return updated.sort((a, b) => b.timestamp - a.timestamp);
        });
      }
    );

    const unsubMaxActions = window.browserAPI.onRecordingMaxActionsReached(
      async () => {
        console.log('Max actions limit reached, auto-stopping recording');
        toast.warning(
          'Maximum 150 actions recorded. Stopping recording automatically.'
        );
        const data = await window.browserAPI.stopRecording();
        setIsRecording(false);
        setRecordingData(data);
        if (data.actions && data.actions.length > 0) {
          setShowSaveForm(true);
        }
      }
    );

    return () => {
      unsubStart();
      unsubStop();
      unsubAction();
      unsubMaxActions();
    };
  }, []);

  const handleSaveRecording = async (name: string, description: string) => {
    if (recordingData) {
      await window.browserAPI.saveRecording(
        name,
        description,
        recordingData.actions
      );
      setShowSaveForm(false);
      setRecordingData(null);
      setActions([]);
      toast.success('Recording saved successfully');
    }
  };

  const handleDiscardRecording = () => {
    setShowSaveForm(false);
    setRecordingData(null);
    setActions([]);
    toast.success('Recording discarded');
  };

  const showRecordingView = isRecording || showSaveForm;

  return (
    <section className="h-full w-full flex flex-col overflow-hidden bg-background border-l border-l-foreground">
      {showRecordingView ? (
        <LiveRecordingView
          actions={actions}
          isRecording={isRecording}
          showSaveForm={showSaveForm}
          recordingData={recordingData}
          onSave={handleSaveRecording}
          onDiscard={handleDiscardRecording}
        />
      ) : (
        <AgentView />
      )}
    </section>
  );
}
