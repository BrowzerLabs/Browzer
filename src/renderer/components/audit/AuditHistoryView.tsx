import { useEffect, useState } from 'react';
import { History, RefreshCw, Trash2, Filter, Search } from 'lucide-react';

import { AuditLogCard } from './AuditLogCard';
import { AuditLogDetail } from './AuditLogDetail';

import { useAuditStore } from '@/renderer/stores/auditStore';
import { Button } from '@/renderer/ui/button';
import { Input } from '@/renderer/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/renderer/ui/select';
import { ScrollArea } from '@/renderer/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/renderer/ui/alert-dialog';
import type {
  AuditLog,
  AuditAgentMode,
  AuditStatus,
} from '@/shared/types/audit';

export function AuditHistoryView() {
  const {
    logs,
    selectedLog,
    stats,
    isLoading,
    fetchLogs,
    fetchStats,
    selectLog,
    deleteLog,
    clearAll,
    fetchFilteredLogs,
    searchLogs,
  } = useAuditStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleRefresh = () => {
    fetchLogs();
    fetchStats();
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchLogs(searchQuery.trim());
    } else {
      applyFilters();
    }
  };

  const applyFilters = () => {
    const filters: Record<string, unknown> = {};
    if (modeFilter !== 'all') {
      filters.agentMode = modeFilter as AuditAgentMode;
    }
    if (statusFilter !== 'all') {
      filters.status = statusFilter as AuditStatus;
    }
    if (Object.keys(filters).length > 0) {
      fetchFilteredLogs(filters);
    } else {
      fetchLogs();
    }
  };

  useEffect(() => {
    applyFilters();
  }, [modeFilter, statusFilter]);

  const handleViewLog = (log: AuditLog) => {
    selectLog(log.id);
  };

  const handleDeleteLog = async (id: string) => {
    await deleteLog(id);
    fetchStats();
  };

  const handleClearAll = async () => {
    await clearAll();
  };

  const handleBack = () => {
    selectLog(null);
  };

  if (selectedLog) {
    return <AuditLogDetail log={selectedLog} onBack={handleBack} />;
  }

  return (
    <div className="flex flex-col h-full p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5" />
          <h1 className="text-xl font-semibold">Audit History</h1>
          {stats && (
            <span className="text-sm text-gray-500">
              ({stats.totalLogs} total)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                disabled={logs.length === 0}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Audit Logs</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all audit logs. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearAll}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by goal or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[130px]">
            <Filter className="w-4 h-4 mr-1" />
            <SelectValue placeholder="Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="automate">Automate</SelectItem>
            <SelectItem value="autopilot">Autopilot</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
            <SelectItem value="running">Running</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : logs.length > 0 ? (
          <div className="grid gap-3">
            {logs.map((log) => (
              <AuditLogCard
                key={log.id}
                log={log}
                onView={handleViewLog}
                onDelete={handleDeleteLog}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500">
            <History className="w-12 h-12 mb-2 opacity-50" />
            <p>No audit logs found</p>
            <p className="text-sm">
              Automation and autopilot executions will appear here
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
