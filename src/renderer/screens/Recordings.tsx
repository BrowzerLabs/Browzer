import { useEffect, useState } from 'react';
import { Video, Loader2Icon, RefreshCcw } from 'lucide-react';
import type { RecordingSession } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { toast } from 'sonner';
import ThemeToggle from '@/renderer/ui/theme-toggle';
import { RecordingCard ,RecordingStats ,RecordingDialog ,RecordingFilters } from '@/renderer/components/recordings';

export function Recordings() {
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [filteredRecordings, setFilteredRecordings] = useState<RecordingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'with-video' | 'actions-only'>('all');
  const [selectedRecording, setSelectedRecording] = useState<RecordingSession | null>(null);
  const [isPlayDialogOpen, setIsPlayDialogOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadRecordings();
  }, []);

  useEffect(() => {
    filterRecordings();
  }, [searchQuery, filterType, recordings]);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const data = await window.browserAPI.getAllRecordings();
      // Sort by creation date (newest first)
      const sorted = data.sort((a, b) => b.createdAt - a.createdAt);
      setRecordings(sorted);
      setFilteredRecordings(sorted);
    } catch (error) {
      console.error('Failed to load recordings:', error);
      toast.error('Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  const filterRecordings = () => {
    let filtered = [...recordings];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (rec) =>
          rec.name.toLowerCase().includes(query) ||
          rec.description?.toLowerCase().includes(query) ||
          rec.url?.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (filterType === 'with-video') {
      filtered = filtered.filter((rec) => rec.videoPath);
    } else if (filterType === 'actions-only') {
      filtered = filtered.filter((rec) => !rec.videoPath);
    }

    setFilteredRecordings(filtered);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this recording? This action cannot be undone.')) {
      return;
    }

    try {
      await window.browserAPI.deleteRecording(id);
      toast.success('Recording deleted');
      loadRecordings();
    } catch (error) {
      console.error('Failed to delete recording:', error);
      toast.error('Failed to delete recording');
    }
  };

  const handlePlay = async (recording: RecordingSession) => {
    setSelectedRecording(recording);
    setIsPlayDialogOpen(true);
    
    // Load video URL if video exists
    if (recording.videoPath) {
      try {
        const url = await window.browserAPI.getVideoFileUrl(recording.videoPath);
        setVideoUrl(url);
      } catch (error) {
        console.error('Failed to load video URL:', error);
        setVideoUrl(null);
      }
    } else {
      setVideoUrl(null);
    }
  };

  const handleOpenVideo = async (videoPath: string) => {
    try {
      await window.browserAPI.openVideoFile(videoPath);
      toast.success('Opening video file...');
    } catch (error) {
      console.error('Failed to open video:', error);
      toast.error('Failed to open video file');
    }
  };

  const getTotalStats = () => {
    const totalActions = recordings.reduce((sum, rec) => sum + rec.actionCount, 0);
    const totalDuration = recordings.reduce((sum, rec) => sum + rec.duration, 0);
    const totalVideoSize = recordings.reduce((sum, rec) => sum + (rec.videoSize || 0), 0);
    const totalSnapshotSize = recordings.reduce((sum, rec) => sum + (rec.totalSnapshotSize || 0), 0);
    const withVideo = recordings.filter((rec) => rec.videoPath).length;

    return {
      total: recordings.length,
      totalActions,
      totalDuration,
      totalVideoSize,
      totalSnapshotSize,
      withVideo,
    };
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-black">
        <Loader2Icon className="size-4 animate-spin text-blue-600" />
      </div>
    );
  }

  const stats = getTotalStats();

  return (
    <div className="bg-slate-100 dark:bg-slate-800 min-h-screen">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Video className="w-6 h-6 text-blue-600" />
              Recordings
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {stats.total} recordings • {stats.withVideo} with video • {stats.totalActions} total actions
            </p>
          </div>

          <section className='flex items-center gap-2'>
            <Button 
              onClick={() => { 
                loadRecordings(); 
                toast.success('Recordings refreshed'); 
              }} 
              disabled={loading}
            >
              <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <ThemeToggle />
          </section>
        </div>

        {/* Search and Filters */}
        <RecordingFilters
          searchQuery={searchQuery}
          filterType={filterType}
          onSearchChange={setSearchQuery}
          onFilterChange={setFilterType}
        />

        {/* Stats Cards */}
        <RecordingStats {...stats} />

        {/* Recordings Grid */}
        {filteredRecordings.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-12 text-center">
            <Video className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {searchQuery ? 'No recordings found' : 'No recordings yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery
                ? 'Try a different search term or filter'
                : 'Start recording your browser actions to see them here'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecordings.map((recording) => (
              <RecordingCard
                key={recording.id}
                recording={recording}
                onPlay={handlePlay}
                onDelete={handleDelete}
                onOpenVideo={handleOpenVideo}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recording Details Dialog */}
      <RecordingDialog
        recording={selectedRecording}
        videoUrl={videoUrl}
        open={isPlayDialogOpen}
        onOpenChange={setIsPlayDialogOpen}
        onOpenVideo={handleOpenVideo}
      />
    </div>
  );
}
