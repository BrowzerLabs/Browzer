import { Search, X, Filter, FileVideo, MousePointerClick } from 'lucide-react';
import { Input } from '@/renderer/ui/input';
import { Button } from '@/renderer/ui/button';

interface RecordingFiltersProps {
  searchQuery: string;
  filterType: 'all' | 'with-video' | 'actions-only';
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: 'all' | 'with-video' | 'actions-only') => void;
}

export function RecordingFilters({ 
  searchQuery, 
  filterType, 
  onSearchChange, 
  onFilterChange 
}: RecordingFiltersProps) {
  return (
    <div className="flex gap-4 mb-6">
      <div className="flex-1 relative bg-white dark:bg-slate-700 rounded-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search recordings..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 border-primary"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-800 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant={filterType === 'all' ? 'default' : 'outline'}
          onClick={() => onFilterChange('all')}
        >
          <Filter className="w-4 h-4 mr-2" />
          All
        </Button>
        <Button
          variant={filterType === 'with-video' ? 'default' : 'outline'}
          onClick={() => onFilterChange('with-video')}
        >
          <FileVideo className="w-4 h-4 mr-2" />
          With Video
        </Button>
        <Button
          variant={filterType === 'actions-only' ? 'default' : 'outline'}
          onClick={() => onFilterChange('actions-only')}
        >
          <MousePointerClick className="w-4 h-4 mr-2" />
          Actions Only
        </Button>
      </div>
    </div>
  );
}
