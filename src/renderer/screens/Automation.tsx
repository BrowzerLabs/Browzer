import { useEffect, useState } from 'react';
import { Bot, Loader2Icon, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/renderer/ui/button';
import { SessionListItem } from '@/renderer/stores/automationStore';
import { AutomationSessionCard } from '@/renderer/components/automation/AutomationSessionCard';
import { AutomationStats } from '@/renderer/components/automation/AutomationStats';
import { AutomationFilters } from '@/renderer/components/automation/AutomationFilters';
import { AutomationDialog } from '@/renderer/components/automation/AutomationDialog';

export function Automation() {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [filteredSessions, setFilteredSessions] = useState<SessionListItem[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'running' | 'completed' | 'failed' | 'stopped'
  >('all');
  const [selectedSession, setSelectedSession] =
    useState<SessionListItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    loadSessions();

    const unsubscribe = window.browserAPI.onAutomationProgress(() => {
      loadSessions();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    filterSessions();
  }, [searchQuery, filterStatus, sessions]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await window.browserAPI.getAutomationSessions();
      const sorted = data.sort(
        (a: SessionListItem, b: SessionListItem) => b.updatedAt - a.createdAt
      );
      setSessions(sorted);
      setFilteredSessions(sorted);
    } catch (error) {
      console.error('Failed to load automation sessions:', error);
      toast.error('Failed to load automation sessions');
    } finally {
      setLoading(false);
    }
  };

  const filterSessions = () => {
    let filtered = [...sessions];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (session) =>
          session.userGoal.toLowerCase().includes(query) ||
          session.sessionId.toLowerCase().includes(query) ||
          session.recordingId?.toLowerCase().includes(query)
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter((session) => session.status === filterStatus);
    }

    setFilteredSessions(filtered);
  };

  const handleViewSession = (session: SessionListItem) => {
    setSelectedSession(session);
    setIsDialogOpen(true);
  };

  const handleResumeSession = async (sessionId: string) => {
    try {
      await window.browserAPI.resumeAutomationSession(sessionId);
      toast.success('Session resumed');
      loadSessions();
    } catch (error) {
      console.error('Failed to resume session:', error);
      toast.error('Failed to resume session');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (
      !confirm(
        'Are you sure you want to delete this automation session? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      await window.browserAPI.deleteAutomationSession(sessionId);
      toast.success('Session deleted');
      loadSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Failed to delete session');
    }
  };

  const getStats = () => {
    const total = sessions.length;
    const running = sessions.filter((s) => s.status === 'running').length;
    const completed = sessions.filter((s) => s.status === 'completed').length;
    const failed = sessions.filter((s) => s.status === 'failed').length;
    const stopped = sessions.filter((s) => s.status === 'stopped').length;
    const totalSteps = sessions.reduce((sum, s) => sum + s.stepCount, 0);
    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0);

    return {
      total,
      running,
      completed,
      failed,
      stopped,
      totalSteps,
      totalMessages,
    };
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-black">
        <Loader2Icon className="size-4 animate-spin text-blue-600" />
      </div>
    );
  }

  const stats = getStats();

  return (
    <div className="bg-slate-100 dark:bg-slate-800 min-h-screen">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Bot className="w-6 h-6 text-blue-600" />
              Automation Sessions
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {stats.total} sessions • {stats.running} running •{' '}
              {stats.completed} completed • {stats.failed} failed
            </p>
          </div>

          <section className="flex items-center gap-2">
            <Button
              onClick={() => {
                loadSessions();
                toast.success('Sessions refreshed');
              }}
              disabled={loading}
              size="icon-lg"
              variant="outline"
            >
              <RefreshCcw />
            </Button>
          </section>
        </div>

        {/* Search and Filters */}
        <AutomationFilters
          searchQuery={searchQuery}
          filterStatus={filterStatus}
          onSearchChange={setSearchQuery}
          onFilterChange={setFilterStatus}
        />

        {/* Stats Cards */}
        <AutomationStats {...stats} />

        {/* Sessions Grid */}
        {filteredSessions.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center">
            <Bot className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {searchQuery ? 'No sessions found' : 'No automation sessions yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery
                ? 'Try a different search term or filter'
                : 'Start an automation from the sidebar to see sessions here'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSessions.map((session) => (
              <AutomationSessionCard
                key={session.sessionId}
                session={session}
                onView={handleViewSession}
                onResume={handleResumeSession}
                onDelete={handleDeleteSession}
              />
            ))}
          </div>
        )}
      </div>

      {/* Session Details Dialog */}
      <AutomationDialog
        session={selectedSession}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onResume={handleResumeSession}
        onDelete={handleDeleteSession}
      />
    </div>
  );
}
