import { useState } from 'react';
import { Camera, X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';
import type { RecordedAction } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { Badge } from '@/renderer/ui/badge';
import { Dialog, DialogContent } from '@/renderer/ui/dialog';

interface SnapshotGalleryProps {
  actions: RecordedAction[];
}

export function SnapshotGallery({ actions }: SnapshotGalleryProps) {
  const [selectedSnapshot, setSelectedSnapshot] = useState<{ path: string; action: RecordedAction; index: number } | null>(null);
  
  // Filter actions that have snapshots
  const actionsWithSnapshots = actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.snapshotPath);

  if (actionsWithSnapshots.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-700">
        <Camera className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No snapshots captured for this recording
        </p>
      </div>
    );
  }

  const handlePrevious = () => {
    if (!selectedSnapshot) return;
    const currentIndex = actionsWithSnapshots.findIndex(({ index }) => index === selectedSnapshot.index);
    if (currentIndex > 0) {
      const prev = actionsWithSnapshots[currentIndex - 1];
      const path = prev.action.snapshotPath || '';
      setSelectedSnapshot({ path, action: prev.action, index: prev.index });
    }
  };

  const handleNext = () => {
    if (!selectedSnapshot) return;
    const currentIndex = actionsWithSnapshots.findIndex(({ index }) => index === selectedSnapshot.index);
    if (currentIndex < actionsWithSnapshots.length - 1) {
      const next = actionsWithSnapshots[currentIndex + 1];
      const path = next.action.snapshotPath || '';
      setSelectedSnapshot({ path, action: next.action, index: next.index });
    }
  };

  const currentSnapshotIndex = selectedSnapshot 
    ? actionsWithSnapshots.findIndex(({ index }) => index === selectedSnapshot.index) + 1
    : 0;

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-purple-600" />
            Visual Snapshots ({actionsWithSnapshots.length})
          </h3>
          <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            Context for LLM
          </Badge>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-2">
          {actionsWithSnapshots.map(({ action, index }) => (
            <button
              key={index}
              onClick={() => setSelectedSnapshot({ path: action.snapshotPath || '', action, index })}
              className="group relative aspect-video rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:shadow-lg"
            >
              <img
                src={`video-file://${encodeURIComponent(action.snapshotPath || '')}`}
                alt={`Snapshot for ${action.type} action`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <Badge variant="secondary" className="text-xs bg-white/90 text-gray-900">
                  #{index + 1} {action.type}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox Dialog */}
      <Dialog open={!!selectedSnapshot} onOpenChange={() => setSelectedSnapshot(null)}>
        <DialogContent className="max-w-[95vw] w-[1400px] max-h-[95vh] p-0 overflow-hidden">
          {selectedSnapshot && (
            <div className="relative">
              {/* Navigation */}
              {actionsWithSnapshots.length > 1 && (
                <>
                  <Button
                    onClick={handlePrevious}
                    disabled={currentSnapshotIndex === 1}
                    variant="ghost"
                    size="icon"
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full disabled:opacity-30"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={currentSnapshotIndex === actionsWithSnapshots.length}
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full disabled:opacity-30"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </Button>
                </>
              )}

              {/* Image */}
              <div className="flex items-center justify-center min-h-[60vh] max-h-[80vh]">
                <img
                  src={`video-file://${encodeURIComponent(selectedSnapshot.path)}`}
                  alt={`Snapshot for ${selectedSnapshot.action.type} action`}
                  className="max-w-full max-h-[80vh] object-contain"
                />
              </div>

              {/* Info Bar */}
              <div className="bg-black/90 text-white p-4 border-t border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">Action #{selectedSnapshot.index + 1}</p>
                    <p className="text-lg font-semibold capitalize">{selectedSnapshot.action.type}</p>
                    {selectedSnapshot.action.value && (
                      <p className="text-sm text-gray-400 mt-1">Value: {selectedSnapshot.action.value}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400">
                      {currentSnapshotIndex} of {actionsWithSnapshots.length}
                    </p>
                    <p className="text-sm text-gray-400">
                      {new Date(selectedSnapshot.action.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
