import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import type { AutocompleteSuggestion } from '@/shared/types';

interface Shortcut {
  id: string;
  title: string;
  url: string;
  favicon?: string;
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: '1', title: 'Google', url: 'https://www.google.com', favicon: 'https://www.google.com/favicon.ico' },
  { id: '2', title: 'YouTube', url: 'https://www.youtube.com', favicon: 'https://www.youtube.com/favicon.ico' },
  { id: '3', title: 'GitHub', url: 'https://github.com', favicon: 'https://github.com/favicon.ico' },
  { id: '4', title: 'Twitter', url: 'https://twitter.com', favicon: 'https://twitter.com/favicon.ico' },
];

export function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(DEFAULT_SHORTCUTS);
  const [isAddingShortcut, setIsAddingShortcut] = useState(false);
  const [newShortcut, setNewShortcut] = useState({ title: '', url: '' });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Focus search input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load shortcuts from storage
  useEffect(() => {
    const loadShortcuts = async () => {
      try {
        const stored = localStorage.getItem('browzer-shortcuts');
        if (stored) {
          setShortcuts(JSON.parse(stored));
        }
      } catch (error) {
        console.error('Failed to load shortcuts:', error);
      }
    };
    loadShortcuts();
  }, []);

  // Save shortcuts to storage
  const saveShortcuts = useCallback((newShortcuts: Shortcut[]) => {
    setShortcuts(newShortcuts);
    localStorage.setItem('browzer-shortcuts', JSON.stringify(newShortcuts));
  }, []);

  const totalSuggestions = suggestions.length + searchSuggestions.length;

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      setSearchSuggestions([]);
      setIsDropdownOpen(false);
      return;
    }

    try {
      // Fetch autocomplete suggestions (history, bookmarks)
      const autocompleteSuggestions = await window.browserAPI.getAutocompleteSuggestions(query);
      setSuggestions(autocompleteSuggestions);

      // Fetch search suggestions if not a URL
      if (!isLikelyUrl(query)) {
        const googleSuggestions = await window.browserAPI.getSearchSuggestions(query);
        const existingUrls = new Set(autocompleteSuggestions.map((s: AutocompleteSuggestion) => s.title.toLowerCase()));
        const filteredSearchSuggestions = googleSuggestions.filter(
          (s: string) => !existingUrls.has(s.toLowerCase())
        );
        setSearchSuggestions(filteredSearchSuggestions.slice(0, 5));
      } else {
        setSearchSuggestions([]);
      }

      setIsDropdownOpen(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setSearchQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 150);
  };

  const navigateTo = async (url: string) => {
    try {
      const { activeTabId } = await window.browserAPI.getTabs();
      if (activeTabId) {
        window.browserAPI.navigateTab(activeTabId, url);
      }
    } catch (error) {
      console.error('Failed to navigate:', error);
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    navigateTo(searchQuery);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen && searchQuery) {
        setIsDropdownOpen(true);
        fetchSuggestions(searchQuery);
      } else {
        setSelectedIndex(prev => (prev < totalSuggestions - 1 ? prev + 1 : prev));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        if (selectedIndex < suggestions.length) {
          navigateTo(suggestions[selectedIndex].url);
        } else {
          const searchIndex = selectedIndex - suggestions.length;
          navigateTo(searchSuggestions[searchIndex]);
        }
      } else {
        handleSearch();
      }
      setIsDropdownOpen(false);
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      setSelectedIndex(-1);
    }
  };

  const handleShortcutClick = (url: string) => {
    navigateTo(url);
  };

  const handleRemoveShortcut = (id: string) => {
    saveShortcuts(shortcuts.filter(s => s.id !== id));
  };

  const handleAddShortcut = () => {
    if (!newShortcut.title || !newShortcut.url) return;
    
    const url = newShortcut.url.startsWith('http') ? newShortcut.url : `https://${newShortcut.url}`;
    const newItem: Shortcut = {
      id: Date.now().toString(),
      title: newShortcut.title,
      url,
      favicon: `${new URL(url).origin}/favicon.ico`,
    };
    
    saveShortcuts([...shortcuts, newItem]);
    setNewShortcut({ title: '', url: '' });
    setIsAddingShortcut(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center pt-[20vh]">
      {/* Branding */}
      <div className="mb-8">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Browzer
        </h1>
      </div>

      {/* Search Box */}
      <div className="w-full max-w-[584px] px-4 relative">
        <div
          className={cn(
            "relative flex items-center bg-card border border-border rounded-full shadow-lg transition-all",
            isDropdownOpen && totalSuggestions > 0 && "rounded-b-none rounded-t-3xl border-b-0"
          )}
        >
          <Search className="absolute left-4 h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => searchQuery && fetchSuggestions(searchQuery)}
            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
            placeholder="Search or type a URL"
            className="w-full py-3.5 pl-12 pr-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-base"
          />
        </div>

        {/* Suggestions Dropdown */}
        {isDropdownOpen && totalSuggestions > 0 && (
          <div className="absolute left-4 right-4 bg-card border border-t-0 border-border rounded-b-3xl shadow-lg overflow-hidden z-50">
            <ul className="py-2">
              {/* Autocomplete suggestions */}
              {suggestions.map((suggestion, index) => (
                <li
                  key={`auto-${index}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent",
                    selectedIndex === index && "bg-accent"
                  )}
                  onMouseDown={() => navigateTo(suggestion.url)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {suggestion.favicon ? (
                    <img src={suggestion.favicon} alt="" className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <Search className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{suggestion.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{suggestion.url}</p>
                  </div>
                </li>
              ))}
              
              {/* Search suggestions */}
              {searchSuggestions.map((suggestion, index) => (
                <li
                  key={`search-${index}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent",
                    selectedIndex === suggestions.length + index && "bg-accent"
                  )}
                  onMouseDown={() => navigateTo(suggestion)}
                  onMouseEnter={() => setSelectedIndex(suggestions.length + index)}
                >
                  <Search className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm text-foreground">{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Shortcuts */}
      <div className="mt-12 w-full max-w-[584px] px-4">
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4 justify-items-center">
          {shortcuts.slice(0, 8).map((shortcut) => (
            <ShortcutItem
              key={shortcut.id}
              shortcut={shortcut}
              onClick={() => handleShortcutClick(shortcut.url)}
              onRemove={() => handleRemoveShortcut(shortcut.id)}
            />
          ))}
          
          {/* Add shortcut button */}
          {shortcuts.length < 8 && (
            <button
              onClick={() => setIsAddingShortcut(true)}
              className="group flex flex-col items-center gap-2 w-[72px]"
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-accent transition-colors">
                <Plus className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground truncate w-full text-center">
                Add shortcut
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Add Shortcut Modal */}
      {isAddingShortcut && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Add shortcut</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Name</label>
                <input
                  type="text"
                  value={newShortcut.title}
                  onChange={(e) => setNewShortcut(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., Google"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">URL</label>
                <input
                  type="text"
                  value={newShortcut.url}
                  onChange={(e) => setNewShortcut(prev => ({ ...prev, url: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., google.com"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setIsAddingShortcut(false);
                    setNewShortcut({ title: '', url: '' });
                  }}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddShortcut}
                  disabled={!newShortcut.title || !newShortcut.url}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ShortcutItemProps {
  shortcut: Shortcut;
  onClick: () => void;
  onRemove: () => void;
}

function ShortcutItem({ shortcut, onClick, onRemove }: ShortcutItemProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="group relative flex flex-col items-center gap-2 w-[72px]">
      <button
        onClick={onClick}
        className="w-12 h-12 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors overflow-hidden"
      >
        {shortcut.favicon && !imgError ? (
          <img
            src={shortcut.favicon}
            alt=""
            className="w-6 h-6"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-lg font-semibold text-muted-foreground uppercase">
            {shortcut.title.charAt(0)}
          </span>
        )}
      </button>
      <span className="text-xs text-muted-foreground truncate w-full text-center">
        {shortcut.title}
      </span>
      
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-muted hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function isLikelyUrl(input: string): boolean {
  const trimmed = input.trim();
  
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return true;
  }
  
  const tldPattern = /\.(com|org|net|io|dev|co|app|edu|gov|me|info|biz|tv|cc|ai|xyz)($|\/)/i;
  if (tldPattern.test(trimmed)) {
    return true;
  }
  
  if (trimmed.includes('.') && !trimmed.includes(' ') && trimmed.length > 3) {
    return true;
  }
  
  if (trimmed.startsWith('localhost') || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed)) {
    return true;
  }
  
  return false;
}