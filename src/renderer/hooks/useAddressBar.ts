import { useState, useCallback, useRef, useEffect } from 'react';
import type { AutocompleteSuggestion } from '@/shared/types';

interface UseAddressBarOptions {
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Minimum characters before fetching suggestions */
  minChars?: number;
  /** Include Google search suggestions */
  includeSearchSuggestions?: boolean;
}

interface UseAddressBarReturn {
  /** Current input value */
  inputValue: string;
  /** Set input value */
  setInputValue: (value: string) => void;
  /** Autocomplete suggestions */
  suggestions: AutocompleteSuggestion[];
  /** Google search suggestions */
  searchSuggestions: string[];
  /** Whether suggestions are loading */
  isLoading: boolean;
  /** Whether dropdown is open */
  isOpen: boolean;
  /** Set dropdown open state */
  setIsOpen: (open: boolean) => void;
  /** Currently selected suggestion index (-1 for none) */
  selectedIndex: number;
  /** Set selected index */
  setSelectedIndex: (index: number) => void;
  /** Handle keyboard navigation */
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => string | null;
  /** Clear suggestions */
  clearSuggestions: () => void;
  /** Get total suggestion count (combined) */
  totalSuggestions: number;
  /** Fetch suggestions manually */
  fetchSuggestions: (query: string) => Promise<void>;
}

/**
 * Custom hook for managing address bar autocomplete state
 * Handles debouncing, keyboard navigation, and suggestion fetching
 */
export function useAddressBar(options: UseAddressBarOptions = {}): UseAddressBarReturn {
  const {
    debounceMs = 150,
    minChars = 1,
    includeSearchSuggestions = true,
  } = options;

  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Hide/show tabs when dropdown opens/closes
  useEffect(() => {
    if (isOpen) {
      window.browserAPI.hideAllTabs();
    } else {
      window.browserAPI.showAllTabs();
    }
  }, [isOpen]);

  // Calculate total suggestions
  const totalSuggestions = suggestions.length + searchSuggestions.length;

  /**
   * Fetch suggestions from the main process
   */
  const fetchSuggestions = useCallback(async (query: string) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (query.length < minChars) {
      setSuggestions([]);
      setSearchSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    try {
      // Fetch autocomplete suggestions (history + URL detection)
      const autocompleteSuggestions = await window.browserAPI.getAutocompleteSuggestions(query);
      setSuggestions(autocompleteSuggestions);

      // Fetch Google search suggestions if enabled
      if (includeSearchSuggestions && !isLikelyUrl(query)) {
        const googleSuggestions = await window.browserAPI.getSearchSuggestions(query);
        // Filter out suggestions that are already in autocomplete
        const existingUrls = new Set(autocompleteSuggestions.map((s: { title: string }) => s.title.toLowerCase()));
        const filteredSearchSuggestions = googleSuggestions.filter(
          (s: string) => !existingUrls.has(s.toLowerCase())
        );
        setSearchSuggestions(filteredSearchSuggestions.slice(0, 4));
      } else {
        setSearchSuggestions([]);
      }

      setIsOpen(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
      setSearchSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [minChars, includeSearchSuggestions]);

  /**
   * Debounced input change handler
   */
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new debounced fetch
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, debounceMs);
  }, [debounceMs, fetchSuggestions]);

  /**
   * Handle keyboard navigation
   * Returns the URL to navigate to, or null if no navigation should occur
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): string | null => {
    if (!isOpen && e.key !== 'ArrowDown') {
      return null;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen && inputValue) {
          setIsOpen(true);
          fetchSuggestions(inputValue);
        } else {
          setSelectedIndex(prev => 
            prev < totalSuggestions - 1 ? prev + 1 : prev
          );
        }
        return null;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > -1 ? prev - 1 : -1));
        return null;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          // Selected a suggestion
          if (selectedIndex < suggestions.length) {
            // It's an autocomplete suggestion
            const selected = suggestions[selectedIndex];
            setInputValue(selected.url);
            setIsOpen(false);
            return selected.url;
          } else {
            // It's a search suggestion
            const searchIndex = selectedIndex - suggestions.length;
            const searchQuery = searchSuggestions[searchIndex];
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
            setInputValue(searchUrl);
            setIsOpen(false);
            return searchUrl;
          }
        } else {
          // No selection, navigate to input value
          setIsOpen(false);
          return inputValue;
        }

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        return null;

      case 'Tab':
        // Allow tab to close dropdown
        setIsOpen(false);
        setSelectedIndex(-1);
        return null;

      default:
        return null;
    }
  }, [isOpen, inputValue, selectedIndex, suggestions, searchSuggestions, totalSuggestions, fetchSuggestions]);

  /**
   * Clear all suggestions
   */
  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setSearchSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    inputValue,
    setInputValue: handleInputChange,
    suggestions,
    searchSuggestions,
    isLoading,
    isOpen,
    setIsOpen,
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    clearSuggestions,
    totalSuggestions,
    fetchSuggestions,
  };
}

/**
 * Check if input looks like a URL
 */
function isLikelyUrl(input: string): boolean {
  const trimmed = input.trim();
  
  // Has protocol
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return true;
  }
  
  // Has common TLD
  const tldPattern = /\.(com|org|net|io|dev|co|app|edu|gov|me|info|biz|tv|cc|ai|xyz)($|\/)/i;
  if (tldPattern.test(trimmed)) {
    return true;
  }
  
  // Looks like domain (contains dot and no spaces)
  if (trimmed.includes('.') && !trimmed.includes(' ') && trimmed.length > 3) {
    return true;
  }
  
  // localhost or IP address
  if (trimmed.startsWith('localhost') || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed)) {
    return true;
  }
  
  return false;
}
