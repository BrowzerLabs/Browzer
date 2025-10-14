import { useEffect } from 'react';
import { Bot, Video } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { RecordingView } from './RecordingView';
import { ChatBox } from './chat';
import { useSidebarStore } from '../store/useSidebarStore';

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
    <div className="h-full w-full flex flex-col min-h-0">
      {/* Sidebar Header */}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <TabsList className="w-full rounded-none p-0 h-auto sticky top-0 z-20 bg-background">
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

        <TabsContent value="agent" className="flex-1 m-0 p-4 text-gray-200 overflow-hidden min-h-0">
          <AgentView />
        </TabsContent>

        <TabsContent value="recording" className="flex-1 m-0 p-0 text-gray-200 overflow-hidden min-h-0">
          <RecordingView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Agent View - AI chat and automation
function AgentView() {
  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="text-center py-4 border-b border-gray-700">
        <Bot className="w-8 h-8 mx-auto text-gray-600 mb-2" />
        <h3 className="text-lg font-semibold text-gray-300 mb-1">AI Agent</h3>
        <p className="text-xs text-gray-500">
          Chat with AI to automate tasks and analyze pages
        </p>
      </div>
      
      {/* Chat Interface */}
      <div className="flex-1 min-h-0">
        <ChatBox />
      </div>
    </div>
  );
}