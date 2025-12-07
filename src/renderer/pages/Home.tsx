import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import { Input } from '@/renderer/ui/input';

interface UseSearchBoxOptions {
  debounceMs?: number;
  minChars?: number;
}

interface UseSearchBoxReturn {
  inputValue: string;
  setInputValue: (value: string) => void;
  suggestions: string[];
  isLoading: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  clearSuggestions: () => void;
}

function useSearchBox(
  onNavigate: (query: string) => void,
  options: UseSearchBoxOptions = {}
): UseSearchBoxReturn {
  const { debounceMs = 150, minChars = 1 } = options;

  const [inputValue, setInputValueState] = useState('');
  const [originalInputValue, setOriginalInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < minChars) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    try {
      const searchSuggestions = await window.browserAPI.getSearchSuggestions(query);
      setSuggestions(searchSuggestions.slice(0, 12));
      setIsOpen(searchSuggestions.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Error fetching search suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [minChars]);

  const setInputValue = useCallback((value: string) => {
    setInputValueState(value);
    setOriginalInputValue(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, debounceMs);
  }, [debounceMs, fetchSuggestions]);

  const getValueForIndex = useCallback((index: number): string => {
    if (index === -1) {
      return originalInputValue;
    }
    return suggestions[index] || originalInputValue;
  }, [suggestions, originalInputValue]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen && inputValue) {
          setIsOpen(true);
          setOriginalInputValue(inputValue);
          fetchSuggestions(inputValue);
        } else if (suggestions.length > 0) {
          const newIndex = selectedIndex < suggestions.length - 1 ? selectedIndex + 1 : 0;
          setSelectedIndex(newIndex);
          setInputValueState(getValueForIndex(newIndex));
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (suggestions.length > 0) {
          const newIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
          setSelectedIndex(newIndex);
          setInputValueState(getValueForIndex(newIndex));
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (inputValue.trim()) {
          onNavigate(inputValue.trim());
          setIsOpen(false);
          setSuggestions([]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        setInputValueState(originalInputValue);
        break;
    }
  }, [isOpen, inputValue, selectedIndex, suggestions, fetchSuggestions, originalInputValue, getValueForIndex, onNavigate]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    inputValue,
    setInputValue,
    suggestions,
    isLoading,
    isOpen,
    setIsOpen,
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    clearSuggestions,
  };
}

export function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleNavigate = useCallback(async (query: string) => {
    try {
      const { activeTabId } = await window.browserAPI.getTabs();
      if (activeTabId) {
        await window.browserAPI.navigate(activeTabId, query);
      }
    } catch (error) {
      console.error('Failed to navigate:', error);
    }
  }, []);

  const {
    inputValue,
    setInputValue,
    suggestions,
    isLoading,
    isOpen,
    setIsOpen,
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    clearSuggestions,
  } = useSearchBox(handleNavigate, {
    debounceMs: 150,
    minChars: 1,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsOpen]);

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
      }
    }, 150);
  }, [setIsOpen]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    handleNavigate(suggestion);
    clearSuggestions();
  }, [handleNavigate, clearSuggestions]);

  const showDropdown = isOpen && suggestions.length > 0;

  return (
    <div className="min-h-screen  flex flex-col items-center justify-start pt-[18vh] bg-background">
      <h1 className="text-6xl font-bold tracking-tight mb-10">
          <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Browzer
          </span>
      </h1>

      <div className="w-full max-w-[700px] relative">
        <div
          className={cn(
            "relative flex items-center",
          )}
        >
          <Search className="absolute left-4 size-4 text-muted-foreground/70" />
          
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder="Search Browzer"
            spellCheck={false}
            className={cn(
              "pl-12 pr-12 rounded-full shadow-xl border-1",
              "h-12 font-semibold"
            )}
          />

          {isLoading && (
            <Loader2 className="absolute right-4 size-4 text-muted-foreground/50 animate-spin" />
          )}
        </div>

        {showDropdown && (
          <div
            ref={dropdownRef}
            className={cn(
              "bg-background/70 backdrop-blur-sm rounded-2xl z-10 shadow-xl border-1 border-primary/70",
            )}
          >
            <ul className="py-2">
              {suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3",
                    "cursor-pointer transition-colors",
                    selectedIndex === index 
                      ? "bg-accent/80" 
                      : "hover:bg-accent/40"
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSuggestionClick(suggestion);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Search className="h-4 w-4 text-muted-foreground/60 flex-shrink-0" />
                  <span className="text-sm text-foreground truncate">
                    {suggestion}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-muted-foreground/40 select-none">
        Press Enter to search
      </p>
    </div>
  );
}
