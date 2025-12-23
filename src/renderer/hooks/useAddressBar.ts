import { useState, useCallback, useRef, useEffect } from 'react';

import type { AutocompleteSuggestion } from '@/shared/types';
import { isLikelyUrl } from '@/shared/utils';
import { useBrowserViewLayerStore } from '@/renderer/stores/browserViewLayerStore';

interface UseAddressBarOptions {
  debounceMs?: number;
  minChars?: number;
  includeSearchSuggestions?: boolean;
}

interface UseAddressBarReturn {
  inputValue: string;
  setInputValue: (value: string) => void;
  setInputValueSilent: (value: string) => void;
  suggestions: AutocompleteSuggestion[];
  searchSuggestions: string[];
  isLoading: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => string | null;
  clearSuggestions: () => void;
  totalSuggestions: number;
  fetchSuggestions: (query: string) => Promise<void>;
}

export function useAddressBar(
  options: UseAddressBarOptions = {}
): UseAddressBarReturn {
  const {
    debounceMs = 150,
    minChars = 1,
    includeSearchSuggestions = true,
  } = options;

  const [inputValue, setInputValueState] = useState('');
  const [originalInputValue, setOriginalInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { registerOverlay, unregisterOverlay } = useBrowserViewLayerStore();

  const showDropdown =
    isOpen && (suggestions.length > 0 || searchSuggestions.length > 0);

  useEffect(() => {
    if (showDropdown) {
      registerOverlay('address-bar-dropdown');
    } else {
      unregisterOverlay('address-bar-dropdown');
    }
    return () => {
      unregisterOverlay('address-bar-dropdown');
    };
  }, [showDropdown, registerOverlay, unregisterOverlay]);

  const totalSuggestions = suggestions.length + searchSuggestions.length;

  const fetchSuggestions = useCallback(
    async (query: string) => {
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
        const autocompleteSuggestions =
          await window.browserAPI.getAutocompleteSuggestions(query);
        setSuggestions(autocompleteSuggestions);

        if (includeSearchSuggestions && !isLikelyUrl(query)) {
          const googleSuggestions =
            await window.browserAPI.getSearchSuggestions(query);
          const existingUrls = new Set(
            autocompleteSuggestions.map((s: { title: string }) =>
              s.title.toLowerCase()
            )
          );
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
    },
    [minChars, includeSearchSuggestions]
  );

  const setInputValueSilent = useCallback((value: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setInputValueState(value);
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValueState(value);
      setOriginalInputValue(value); // Store original user input

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        fetchSuggestions(value);
      }, debounceMs);
    },
    [debounceMs, fetchSuggestions]
  );

  const getValueForIndex = useCallback(
    (index: number): string => {
      if (index === -1) {
        return originalInputValue;
      }
      if (index < suggestions.length) {
        return suggestions[index].url;
      }
      const searchIndex = index - suggestions.length;
      if (searchIndex < searchSuggestions.length) {
        return searchSuggestions[searchIndex];
      }
      return originalInputValue;
    },
    [suggestions, searchSuggestions, originalInputValue]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): string | null => {
      if (!isOpen && e.key !== 'ArrowDown') {
        return null;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen && inputValue) {
            setIsOpen(true);
            setOriginalInputValue(inputValue);
            fetchSuggestions(inputValue);
          } else if (totalSuggestions > 0) {
            const newIndex =
              selectedIndex < totalSuggestions - 1 ? selectedIndex + 1 : 0;
            setSelectedIndex(newIndex);
            setInputValueState(getValueForIndex(newIndex));
          }
          return null;

        case 'ArrowUp':
          e.preventDefault();
          if (totalSuggestions > 0) {
            const newIndex =
              selectedIndex <= 0 ? totalSuggestions - 1 : selectedIndex - 1;
            setSelectedIndex(newIndex);
            setInputValueState(getValueForIndex(newIndex));
          }
          return null;

        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0) {
            // Selected a suggestion
            if (selectedIndex < suggestions.length) {
              // It's an autocomplete suggestion
              const selected = suggestions[selectedIndex];
              setInputValueState(selected.url);
              setIsOpen(false);
              return selected.url;
            } else {
              // It's a search suggestion
              const searchIndex = selectedIndex - suggestions.length;
              const searchQuery = searchSuggestions[searchIndex];
              const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
              setInputValueState(searchUrl);
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
    },
    [
      isOpen,
      inputValue,
      selectedIndex,
      suggestions,
      searchSuggestions,
      totalSuggestions,
      fetchSuggestions,
      originalInputValue,
      getValueForIndex,
    ]
  );

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setSearchSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
  }, []);

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
    setInputValueSilent,
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
