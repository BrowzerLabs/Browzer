import { useState, useEffect } from 'react';
import { Circle, Clock, SparkleIcon } from 'lucide-react';
import { RecordedAction, RecordingSession } from '@/shared/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/renderer/ui/tabs';
import { LiveRecordingView, SessionsListView } from './recording';
import { toast } from 'sonner';
import { cn } from '@/renderer/lib/utils';
import AgentView from './AgentView';

export function RecordingView() {
  const [recordingTab, setRecordingTab] = useState('live');
  const [actions, setActions] = useState<RecordedAction[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [recordingData, setRecordingData] = useState<{ 
    actions: RecordedAction[]; 
    duration: number; 
    startUrl: string 
  } | null>(null);

  useEffect(() => {
    // Initialize state
    window.browserAPI.isRecording().then(setIsRecording);
    loadSessions();

    // Setup event listeners
    const unsubStart = window.browserAPI.onRecordingStarted(() => {
      setIsRecording(true);
      setActions([]);
      setShowSaveForm(false);
      setRecordingTab('live');
    });

    const unsubStop = window.browserAPI.onRecordingStopped((data) => {
      setIsRecording(false);
      setRecordingData(data);
      if (data.actions && data.actions.length > 0) {
        setShowSaveForm(true);
      }
    });

    const unsubAction = window.browserAPI.onRecordingAction((action: RecordedAction) => {
      setActions(prev => {
        // Check for duplicates based on timestamp and type
        const isDuplicate = prev.some(a => 
          a.timestamp === action.timestamp && 
          a.type === action.type &&
          JSON.stringify(a.target) === JSON.stringify(action.target)
        );
        
        if (isDuplicate) {
          console.warn('Duplicate action detected, skipping:', action);
          return prev;
        }
        
        // Add new action and sort by timestamp (newest first)
        const updated = [...prev, action];
        return updated.sort((a, b) => b.timestamp - a.timestamp);
      });
    });

    const unsubSaved = window.browserAPI.onRecordingSaved(() => {
      setActions([]);
      loadSessions();
    });

    const unsubDeleted = window.browserAPI.onRecordingDeleted(() => {
      setActions([]);
      loadSessions();
    });
    
    return () => {
      unsubStart();
      unsubStop();
      unsubAction();
      unsubSaved();
      unsubDeleted();
    };
  }, []);

  const loadSessions = async () => {
    const allSessions = await window.browserAPI.getAllRecordings();
    setSessions(allSessions);
  };

  const handleSaveRecording = async (name: string, description: string) => {
    if (recordingData) {
      await window.browserAPI.saveRecording(name, description, recordingData.actions);
      setShowSaveForm(false);
      setRecordingData(null);
      setActions([]);
      setRecordingTab('sessions');
    }
  };

  const handleDiscardRecording = () => {
    setShowSaveForm(false);
    setRecordingData(null);
    setActions([]);
  };

  const handleDeleteSession = async (id: string) => {
    const confirmed = confirm('Are you sure you want to delete this recording? This action cannot be undone.');
    if (confirmed) {
      await window.browserAPI.deleteRecording(id);
      toast.success('Recording deleted successfully');
    }
  };

  return (
    <Tabs value={recordingTab} onValueChange={setRecordingTab} className='h-full'>
      <TabsList className="w-full rounded-none border-b p-0 h-auto">
        <TabsTrigger 
          value="live" 
        >
          <Circle className={cn('size-3 rounded-full bg-red-300', isRecording && 'bg-red-600 animate-pulse')} />
          Live
        </TabsTrigger>
         <TabsTrigger 
          value="automation" 
        >
          <SparkleIcon className='size-3 text-primary' />
          Automation
        </TabsTrigger>
        <TabsTrigger 
          value="sessions"
        >
          <Clock className="w-3 h-3 mr-1.5" />
          Sessions
        </TabsTrigger>
      </TabsList>

      <TabsContent value="live">
        <LiveRecordingView 
          actions={actions} 
          isRecording={isRecording}
          showSaveForm={showSaveForm}
          recordingData={recordingData}
          onSave={handleSaveRecording}
          onDiscard={handleDiscardRecording}
        />
      </TabsContent>

      <TabsContent value="automation">
        <AgentView />
      </TabsContent>

      <TabsContent value="sessions" className="flex-1 m-0 p-0">
        <SessionsListView
          sessions={sessions} 
          onRefresh={loadSessions}
          onDelete={handleDeleteSession}
        />
      </TabsContent>
    </Tabs>
  );
}
