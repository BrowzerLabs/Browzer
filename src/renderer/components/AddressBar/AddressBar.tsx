import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react';
import { Lock, Globe, Search, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/renderer/lib/utils';
import { useAddressBar } from '@/renderer/hooks/useAddressBar';
import { AutocompleteSuggestionType } from '@/shared/types';
import type { AutocompleteSuggestion } from '@/shared/types';
import { Input } from '@/renderer/ui/input';

interface AddressBarProps {
  currentUrl: string;
  isSecure: boolean;
  onNavigate: (url: string) => void;
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
    setInputValueSilent,
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

  useEffect(() => {
    if (!isEditing) {
      setInputValueSilent(currentUrl);
    }
  }, [currentUrl, isEditing, setInputValueSilent]);

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

  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setIsEditing(false);
        setIsOpen(false);
      }
    }, 150);
  }, [setIsOpen]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    const navigateUrl = handleAutocompleteKeyDown(e);
    
    if (navigateUrl) {
      onNavigate(navigateUrl);
      setIsEditing(false);
      clearSuggestions();
      inputRef.current?.blur();
    }
    
    if (e.key === 'Escape') {
      setInputValueSilent(currentUrl);
      setIsEditing(false);
      clearSuggestions();
      inputRef.current?.blur();
    }
  }, [handleAutocompleteKeyDown, onNavigate, setInputValueSilent, currentUrl, clearSuggestions]);

  /**
   * Handle suggestion click
   */
  const handleSuggestionClick = useCallback((suggestion: AutocompleteSuggestion) => {
    setInputValueSilent(suggestion.url);
    onNavigate(suggestion.url);
    setIsOpen(false);
    setIsEditing(false);
    clearSuggestions();
  }, [setInputValueSilent, onNavigate, setIsOpen, clearSuggestions]);

  const handleSearchSuggestionClick = useCallback((query: string) => {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    setInputValueSilent(searchUrl);
    onNavigate(searchUrl);
    setIsOpen(false);
    setIsEditing(false);
    clearSuggestions();
  }, [setInputValueSilent, onNavigate, setIsOpen, clearSuggestions]);

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
      {isSecure ? (
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500 z-10" />
      ) : (
        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
      )}

      <Input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Search or enter address"
        className="h-8 pl-9 pr-9 rounded-full bg-muted/50 dark:bg-muted/30 text-sm placeholder:text-muted-foreground border-transparent focus:border-primary/30 focus:bg-background transition-all"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {isLoading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin z-10" />
      )}

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
        >
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

          {suggestions.length > 0 && searchSuggestions.length > 0 && (
            <div className="border-t border-border" />
          )}

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
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {suggestion.favicon ? (
          <img
            src={suggestion.favicon}
            alt=""
            className="w-4 h-4 rounded"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          icon
        )}
      </div>

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

      {suggestion.type === AutocompleteSuggestionType.HISTORY && (
        <div className="flex-shrink-0 text-xs text-muted-foreground max-w-[200px] truncate">
          {formatUrl(suggestion.url)}
        </div>
      )}

      {suggestion.visitCount && suggestion.visitCount > 5 && (
        <div className="flex-shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {suggestion.visitCount}
        </div>
      )}
    </div>
  );
}

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
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        <Search className="w-4 h-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{query}</div>
      </div>

      <div className="flex-shrink-0 text-xs text-muted-foreground">
        Search Google
      </div>
    </div>
  );
}

function formatUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    let formatted = urlObj.hostname + urlObj.pathname;
    if (formatted.endsWith('/')) {
      formatted = formatted.slice(0, -1);
    }
    return formatted;
  } catch {
    return url;
  }
}
