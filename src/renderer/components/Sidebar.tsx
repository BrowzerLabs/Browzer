import { useEffect } from 'react';
import { Bot, Video } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/renderer/ui/tabs';
import { RecordingView } from './RecordingView';
import { useSidebarStore } from '@/renderer/store/useSidebarStore';
import AgentView from './AgentView';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Sidebar - Agent UI with tabbed interface
 * 
 * Features:
 * - Agent tab: AI chat and automation
 * - Recording tab: Live recording and session history
 */
export function Sidebar() {
  const { activeTab, setActiveTab } = useSidebarStore();
  
  // Listen for recording events to auto-switch tabs
  useEffect(() => {
    const unsubStart = window.browserAPI.onRecordingStarted(() => {
      setActiveTab('recording');
    });
    
     const unsubStop = window.browserAPI.onRecordingStopped(() => {
      setActiveTab('recording');
    });

    return () => {
      unsubStart();
      unsubStop();
    };
  }, [setActiveTab]);

  return (
    <ErrorBoundary>
      <section className="h-full w-full flex flex-col overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full rounded-none p-0 h-auto flex-shrink-0">
          <TabsTrigger 
            value="agent" 
          >
            <Bot className="w-4 h-4 mr-2" />
            Agent
          </TabsTrigger>
          <TabsTrigger 
            value="recording"
          >
            <Video className="w-4 h-4 mr-2" />
            Recording
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className='flex-1 overflow-hidden'>
          <AgentView />
        </TabsContent>

        <TabsContent value="recording" className='flex-1 overflow-hidden'>
          <RecordingView />
        </TabsContent>
      </Tabs>
    </section>
    </ErrorBoundary>
  );
}
