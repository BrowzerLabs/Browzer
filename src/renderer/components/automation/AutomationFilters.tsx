import { Input } from '@/renderer/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/renderer/ui/select';
import { Search } from 'lucide-react';

interface AutomationFiltersProps {
  searchQuery: string;
  filterStatus: 'all' | 'running' | 'completed' | 'error' | 'paused';
  onSearchChange: (query: string) => void;
  onFilterChange: (status: 'all' | 'running' | 'completed' | 'error' | 'paused') => void;
}

export function AutomationFilters({
  searchQuery,
  filterStatus,
  onSearchChange,
  onFilterChange,
}: AutomationFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Search by goal, session ID, or recording..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Status Filter */}
      <Select value={filterStatus} onValueChange={onFilterChange}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Filter by status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sessions</SelectItem>
          <SelectItem value="running">Running</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="error">Failed</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
