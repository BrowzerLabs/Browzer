import React, { useEffect, useRef } from 'react';
import { useFindStore } from '@/renderer/stores/findStore';
import { useBrowserAPI } from '@/renderer/hooks/useBrowserAPI';
import { ChevronUp, ChevronDown, X } from 'lucide-react';

export const FindBar = () => {
  const { state, setState, closeFindBar } = useFindStore();
  const browserAPI = useBrowserAPI();
  const activeTabId = browserAPI.activeTabId;
  const inputRef = useRef<HTMLInputElement>(null);
  const previousTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.isVisible) return;
    void window.browserAPI.bringBrowserViewToFront();
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }

    return () => {
      void window.browserAPI.bringBrowserViewToBottom();
    };
  }, [state.isVisible]);

  // Listen for search results
  useEffect(() => {
    const removeListener = window.browserAPI.onFoundInPage((tId: string, result: { matches: number; activeMatchOrdinal: number }) => {
      if (!activeTabId || tId !== activeTabId) return;
      setState({
        matchCount: result.matches,
        activeMatch: result.activeMatchOrdinal
      });
    });
    return removeListener;
  }, [activeTabId, setState]);

  useEffect(() => {
    const prevTabId = previousTabIdRef.current;
    previousTabIdRef.current = activeTabId ?? null;

    if (!state.isVisible || !state.searchText) return;
    if (prevTabId && prevTabId !== activeTabId) {
      window.browserAPI.stopFindInPage(prevTabId, 'clearSelection').catch((error: unknown) => {
        console.error('[FindBar] Failed to clear previous tab find state:', error);
      });
    }
    if (activeTabId) {
      setState({ matchCount: 0, activeMatch: 0 });
      window.browserAPI.findInPage(activeTabId, state.searchText).catch((error: unknown) => {
        console.error('[FindBar] Failed to apply find to active tab:', error);
      });
    }
  }, [activeTabId, state.searchText, state.isVisible, setState]);

  const handleSearch = async (text: string) => {
    setState({ searchText: text });
    if (!activeTabId) return;
    if (text) {
      try {
        await window.browserAPI.findInPage(activeTabId, text);
      } catch (error) {
        console.error('[FindBar] Failed to start findInPage:', error);
      }
    } else {
      try {
        await window.browserAPI.stopFindInPage(activeTabId, 'clearSelection');
        setState({ matchCount: 0, activeMatch: 0 });
      } catch (error) {
        console.error('[FindBar] Failed to stop findInPage:', error);
      }
    }
  };

  const handleNext = async () => {
    if (!state.searchText || !activeTabId) return;
    try {
      const shouldWrap = state.matchCount > 0 && state.activeMatch >= state.matchCount;
      if (shouldWrap) {
        await window.browserAPI.findInPage(activeTabId, state.searchText, { findNext: false, forward: true });
      } else {
        await window.browserAPI.findInPage(activeTabId, state.searchText, { findNext: true, forward: true });
      }
    } catch (error) {
      console.error('[FindBar] Failed to go to next match:', error);
    }
  };

  const handlePrev = async () => {
    if (!state.searchText || !activeTabId) return;
    try {
      const shouldWrap = state.matchCount > 0 && state.activeMatch <= 1;
      if (shouldWrap) {
        await window.browserAPI.findInPage(activeTabId, state.searchText, { findNext: false, forward: false });
      } else {
        await window.browserAPI.findInPage(activeTabId, state.searchText, { findNext: true, forward: false });
      }
    } catch (error) {
      console.error('[FindBar] Failed to go to previous match:', error);
    }
  };

  const handleClose = async () => {
    if (activeTabId) {
    try {
        await window.browserAPI.stopFindInPage(activeTabId, 'clearSelection');
    } catch (error) {
      console.error('[FindBar] Failed to stop findInPage on close:', error);
    }
    }
    closeFindBar();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) handlePrev();
      else handleNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  if (!state.isVisible) return null;

  return (
    <div className="absolute top-2 right-5 z-50 w-[340px] bg-white dark:bg-zinc-800 border dark:border-zinc-700 rounded-md shadow-xl flex items-center p-1.5 gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex-1 flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-sm px-2 h-8 border dark:border-zinc-700 focus-within:ring-1 focus-within:ring-blue-500">
        <input
            ref={inputRef}
            type="text"
            value={state.searchText}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Find in page"
            className="flex-1 bg-transparent border-none outline-none text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
        />
        {state.searchText && (
            <span className="text-xs text-zinc-400 whitespace-nowrap ml-2">
                {state.matchCount > 0 ? `${state.activeMatch}/${state.matchCount}` : '0/0'}
            </span>
        )}
      </div>
      
      <div className="flex items-center gap-0.5">
        <button onClick={handlePrev} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-sm text-zinc-600 dark:text-zinc-400 disabled:opacity-50" disabled={!state.matchCount}>
            <ChevronUp size={16} />
        </button>
        <button onClick={handleNext} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-sm text-zinc-600 dark:text-zinc-400 disabled:opacity-50" disabled={!state.matchCount}>
            <ChevronDown size={16} />
        </button>
        <div className="w-[1px] h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        <button onClick={handleClose} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-sm text-zinc-600 dark:text-zinc-400">
            <X size={16} />
        </button>
      </div>
    </div>
  );
};
