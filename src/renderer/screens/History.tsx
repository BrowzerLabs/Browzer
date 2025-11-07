import { useEffect, useState } from 'react';
import { Search, Trash2, Clock, TrendingUp, Calendar, Loader2Icon, ExternalLink, X, RefreshCcw } from 'lucide-react';
import type { HistoryEntry, HistoryStats } from '../../shared/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { formatDate } from '../lib/utils';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';

export function History() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week'>('all');

  useEffect(() => {
    loadHistory();
    loadStats();
  }, [timeFilter]);

  useEffect(() => {
    filterHistory();
  }, [searchQuery, history]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      let entries: HistoryEntry[];

      if (timeFilter === 'today') {
        entries = await window.browserAPI.getTodayHistory();
      } else if (timeFilter === 'week') {
        entries = await window.browserAPI.getLastNDaysHistory(7);
      } else {
        entries = await window.browserAPI.getAllHistory(200); // Limit to 200 for performance
      }

      setHistory(entries);
      setFilteredHistory(entries);
    } catch (error) {
      console.error('Failed to load history:', error);
      toast.error('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const historyStats = await window.browserAPI.getHistoryStats();
      setStats(historyStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const filterHistory = () => {
    if (!searchQuery.trim()) {
      setFilteredHistory(history);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = history.filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) ||
        entry.url.toLowerCase().includes(query)
    );
    setFilteredHistory(filtered);
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      await window.browserAPI.deleteHistoryEntry(id);
      toast.success('Entry deleted');
      loadHistory();
      loadStats();
    } catch (error) {
      console.error('Failed to delete entry:', error);
      toast.error('Failed to delete entry');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedEntries.size === 0) return;

    try {
      const ids = Array.from(selectedEntries);
      await window.browserAPI.deleteHistoryEntries(ids);
      toast.success(`Deleted ${ids.length} entries`);
      setSelectedEntries(new Set());
      loadHistory();
      loadStats();
    } catch (error) {
      console.error('Failed to delete entries:', error);
      toast.error('Failed to delete entries');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all browsing history? This action cannot be undone.')) {
      return;
    }

    try {
      await window.browserAPI.clearAllHistory();
      toast.success('All history cleared');
      setHistory([]);
      setFilteredHistory([]);
      setSelectedEntries(new Set());
      loadStats();
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast.error('Failed to clear history');
    }
  };


  const toggleSelectEntry = (id: string) => {
    const newSelected = new Set(selectedEntries);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedEntries(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedEntries.size === filteredHistory.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(filteredHistory.map((e) => e.id)));
    }
  };

  const groupByDate = (entries: HistoryEntry[]) => {
    const groups: Record<string, HistoryEntry[]> = {};

    entries.forEach((entry) => {
      const date = new Date(entry.lastVisitTime);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dateKey: string;

      if (date.toDateString() === today.toDateString()) {
        dateKey = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = 'Yesterday';
      } else {
        dateKey = date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(entry);
    });

    return groups;
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <Loader2Icon className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const groupedHistory = groupByDate(filteredHistory);

  return (
    <div className="bg-slate-100 dark:bg-slate-800 min-h-screen">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-600" />
             History
            </h1>
            {stats && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                {stats.totalEntries} sites • {stats.totalVisits} total visits
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => { loadHistory(); loadStats(); toast.success('History Refreshed'); }} disabled={loading}>
              <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {selectedEntries.size > 0 && (
              <Button variant="destructive" onClick={handleDeleteSelected}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedEntries.size})
              </Button>
            )}
            <Button onClick={handleClearAll} className='bg-red-100 text-red-600 hover:bg-red-200'>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative bg-white dark:bg-black rounded-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-800 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant={timeFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setTimeFilter('all')}
            >
              All Time
            </Button>
            <Button
              variant={timeFilter === 'today' ? 'default' : 'outline'}
              onClick={() => setTimeFilter('today')}
            >
              Today
            </Button>
            <Button
              variant={timeFilter === 'week' ? 'default' : 'outline'}
              onClick={() => setTimeFilter('week')}
            >
              Last 7 Days
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Today</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.todayVisits}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">This Week</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.weekVisits}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Sites</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalEntries}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History List */}
      <div className="max-w-6xl mx-auto px-8 pb-8">
        {filteredHistory.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center">
            <Clock className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {searchQuery ? 'No results found' : 'No history yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery
                ? 'Try a different search term'
                : 'Your browsing history will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Select All */}
            {filteredHistory.length > 0 && (
              <div className="flex items-center gap-2 px-4">
                <Checkbox
                  checked={selectedEntries.size === filteredHistory.length}
                  onCheckedChange={toggleSelectAll}
                  className='border-primary'
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Select all ({filteredHistory.length})
                </span>
              </div>
            )}

            {Object.entries(groupedHistory).map(([date, entries]) => (
              <div key={date} className="space-y-2">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white px-4">
                  {date}
                </h2>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-200 dark:divide-slate-700 shadow-sm">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center gap-4 p-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors group"
                    >
                      <Checkbox
                        checked={selectedEntries.has(entry.id)}
                        onCheckedChange={() => toggleSelectEntry(entry.id)}
                        className='border-primary'
                      />

                      {entry.favicon ? (
                        <img
                          src={entry.favicon}
                          alt=""
                          className="w-6 h-6 rounded"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
                          <ExternalLink className="w-3 h-3 text-gray-500" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                          <h3 className="text-sm text-gray-900 dark:text-white truncate">
                            {entry.title}
                          </h3>
                          <p 
                            className="text-xs text-gray-600 dark:text-gray-400 truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                            onClick={() => {
                              window.browserAPI.createTab(entry.url)
                            }}
                          >
                            {entry.url}
                          </p>
                      </div>

                      <div className="flex items-center gap-4">
                        {entry.visitCount > 1 && (
                          <Badge variant="secondary">
                            {entry.visitCount} visits
                          </Badge>
                        )}

                        <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(entry.lastVisitTime)}
                        </span>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}