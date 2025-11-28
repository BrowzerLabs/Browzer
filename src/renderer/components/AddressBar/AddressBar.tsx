import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { Lock, Globe, Search, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import { useAddressBar } from '@/renderer/hooks/useAddressBar';
import { AutocompleteSuggestionType } from '@/shared/types';
import type { AutocompleteSuggestion } from '@/shared/types';

interface AddressBarProps {
  /** Current URL to display */
  currentUrl: string;
  /** Whether the current URL is secure (https) */
  isSecure: boolean;
  /** Callback when user navigates to a URL */
  onNavigate: (url: string) => void;
  /** Optional className for the container */
  className?: string;
}

export function AddressBar({
  currentUrl,
  isSecure,
  onNavigate,
  className,
}: AddressBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    inputValue,
    setInputValue,
    suggestions,
    searchSuggestions,
    isLoading,
    isOpen,
    setIsOpen,
    selectedIndex,
    setSelectedIndex,
    handleKeyDown: handleAutocompleteKeyDown,
    clearSuggestions,
  } = useAddressBar({
    debounceMs: 150,
    minChars: 1,
    includeSearchSuggestions: true,
  });

  

  // Sync input value with current URL when not editing
  useEffect(() => {
    if (!isEditing) {
      setInputValue(currentUrl);
    }
  }, [currentUrl, isEditing, setInputValue]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setIsEditing(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsOpen]);

  /**
   * Handle input focus
   */
  const handleFocus = useCallback(() => {
    setIsEditing(true);
    // Select all text on focus (like Chrome)
    inputRef.current?.select();
  }, []);

  /**
   * Handle input blur
   */
  const handleBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setIsEditing(false);
        setIsOpen(false);
      }
    }, 150);
  }, [setIsOpen]);

  /**
   * Handle keyboard events
   */
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    const navigateUrl = handleAutocompleteKeyDown(e);
    
    if (navigateUrl) {
      onNavigate(navigateUrl);
      setIsEditing(false);
      inputRef.current?.blur();
    }
    
    if (e.key === 'Escape') {
      setInputValue(currentUrl);
      setIsEditing(false);
      inputRef.current?.blur();
    }
  }, [handleAutocompleteKeyDown, onNavigate, setInputValue, currentUrl]);

  /**
   * Handle suggestion click
   */
  const handleSuggestionClick = useCallback((suggestion: AutocompleteSuggestion) => {
    setInputValue(suggestion.url);
    onNavigate(suggestion.url);
    setIsOpen(false);
    setIsEditing(false);
    clearSuggestions();
  }, [setInputValue, onNavigate, setIsOpen, clearSuggestions]);

  /**
   * Handle search suggestion click
   */
  const handleSearchSuggestionClick = useCallback((query: string) => {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    setInputValue(searchUrl);
    onNavigate(searchUrl);
    setIsOpen(false);
    setIsEditing(false);
    clearSuggestions();
  }, [setInputValue, onNavigate, setIsOpen, clearSuggestions]);

  /**
   * Get icon for suggestion type
   */
  const getSuggestionIcon = (type: AutocompleteSuggestionType) => {
    switch (type) {
      case AutocompleteSuggestionType.HISTORY:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      case AutocompleteSuggestionType.SEARCH:
        return <Search className="w-4 h-4 text-muted-foreground" />;
      case AutocompleteSuggestionType.URL:
        return <ExternalLink className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Globe className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const showDropdown = isOpen && (suggestions.length > 0 || searchSuggestions.length > 0);

  return (
    <div className={cn('relative flex-1', className)}>
      {/* Input Container */}
      <div className="flex items-center rounded-full bg-muted/50 dark:bg-muted/30 h-9 px-3 gap-2 border border-transparent focus-within:border-primary/30 focus-within:bg-background transition-all">
        {/* Security Icon */}
        <div className="flex-shrink-0">
          {isSecure ? (
            <Lock className="w-4 h-4 text-green-500" />
          ) : (
            <Globe className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        {/* URL Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search or enter address"
          className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        {/* Loading indicator */}
        {isLoading && (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
        >
          {/* Autocomplete Suggestions */}
          {suggestions.map((suggestion, index) => (
            <SuggestionItem
              key={suggestion.id}
              suggestion={suggestion}
              isSelected={index === selectedIndex}
              icon={getSuggestionIcon(suggestion.type)}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            />
          ))}

          {/* Divider between autocomplete and search suggestions */}
          {suggestions.length > 0 && searchSuggestions.length > 0 && (
            <div className="border-t border-border" />
          )}

          {/* Google Search Suggestions */}
          {searchSuggestions.map((query, index) => {
            const globalIndex = suggestions.length + index;
            return (
              <SearchSuggestionItem
                key={`search-${index}`}
                query={query}
                isSelected={globalIndex === selectedIndex}
                onClick={() => handleSearchSuggestionClick(query)}
                onMouseEnter={() => setSelectedIndex(globalIndex)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Individual suggestion item component
 */
interface SuggestionItemProps {
  suggestion: AutocompleteSuggestion;
  isSelected: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  onMouseEnter: () => void;
}

function SuggestionItem({
  suggestion,
  isSelected,
  icon,
  onClick,
  onMouseEnter,
}: SuggestionItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
        isSelected ? 'bg-accent' : 'hover:bg-accent/50'
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {/* Favicon or type icon */}
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {suggestion.favicon ? (
          <img
            src={suggestion.favicon}
            alt=""
            className="w-4 h-4 rounded"
            onError={(e) => {
              // Fallback to icon on error
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          icon
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {suggestion.title}
        </div>
        {suggestion.subtitle && suggestion.type !== AutocompleteSuggestionType.URL && (
          <div className="text-xs text-muted-foreground truncate">
            {suggestion.subtitle}
          </div>
        )}
      </div>

      {/* URL preview for history items */}
      {suggestion.type === AutocompleteSuggestionType.HISTORY && (
        <div className="flex-shrink-0 text-xs text-muted-foreground max-w-[200px] truncate">
          {formatUrl(suggestion.url)}
        </div>
      )}

      {/* Visit count badge for frequently visited */}
      {suggestion.visitCount && suggestion.visitCount > 5 && (
        <div className="flex-shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {suggestion.visitCount}
        </div>
      )}
    </div>
  );
}

/**
 * Search suggestion item component
 */
interface SearchSuggestionItemProps {
  query: string;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function SearchSuggestionItem({
  query,
  isSelected,
  onClick,
  onMouseEnter,
}: SearchSuggestionItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
        isSelected ? 'bg-accent' : 'hover:bg-accent/50'
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {/* Search icon */}
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        <Search className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Query text */}
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{query}</div>
      </div>

      {/* Google search label */}
      <div className="flex-shrink-0 text-xs text-muted-foreground">
        Search Google
      </div>
    </div>
  );
}

/**
 * Format URL for display (remove protocol and trailing slash)
 */
function formatUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    let formatted = urlObj.hostname + urlObj.pathname;
    // Remove trailing slash
    if (formatted.endsWith('/')) {
      formatted = formatted.slice(0, -1);
    }
    return formatted;
  } catch {
    return url;
  }
}
