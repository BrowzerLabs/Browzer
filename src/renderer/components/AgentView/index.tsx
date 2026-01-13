import { useEffect } from 'react';
import { Circle, FileText } from 'lucide-react';

import { RecordingPanel } from './RecordingPanel';
import { WorkflowsPanel } from './WorkflowsPanel';

import { useRecordingStore } from '@/renderer/store/useRecordingStore';
import { cn } from '@/renderer/lib/utils';

export default function AgentView() {
  const { activeTab, setActiveTab, initialize, cleanup } = useRecordingStore();

  useEffect(() => {
    initialize();
    return () => cleanup();
  }, [initialize, cleanup]);

  const renderContent = () => {
    switch (activeTab) {
      case 'recording':
        return <RecordingPanel />;
      case 'workflows':
        return <WorkflowsPanel />;
      default:
        return <RecordingPanel />;
    }
  };

  return (
    <section className="flex flex-col h-full overflow-hidden">
      {/* Tab Header */}
      <div className="flex items-center border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <button
          onClick={() => setActiveTab('recording')}
          className={cn(
            'flex-1 px-3 py-3 text-sm font-medium transition-colors',
            'hover:bg-muted/50',
            activeTab === 'recording'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          )}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Circle className="w-4 h-4" />
            Record
          </div>
        </button>
        <button
          onClick={() => setActiveTab('workflows')}
          className={cn(
            'flex-1 px-3 py-3 text-sm font-medium transition-colors',
            'hover:bg-muted/50',
            activeTab === 'workflows'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground'
          )}
        >
          <div className="flex items-center justify-center gap-1.5">
            <FileText className="w-4 h-4" />
            Workflows
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </section>
  );
}
