export interface SearchEngine {
  id: string;
  name: string;
  searchUrl: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
  {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q={query}',
  },
  {
    id: 'bing',
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q={query}',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q={query}',
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    searchUrl: 'https://search.yahoo.com/search?p={query}',
  },
  {
    id: 'brave',
    name: 'Brave Search',
    searchUrl: 'https://search.brave.com/search?q={query}',
  },
];

export const DEFAULT_SEARCH_ENGINE_ID = 'google';

export function getSearchEngineById(id: string): SearchEngine | undefined {
  return SEARCH_ENGINES.find(engine => engine.id === id);
}

export function getDefaultSearchEngine(): SearchEngine {
  return SEARCH_ENGINES.find(engine => engine.id === DEFAULT_SEARCH_ENGINE_ID) || SEARCH_ENGINES[0];
}

export function buildSearchUrl(engineId: string, query: string): string {
  const engine = getSearchEngineById(engineId) || getDefaultSearchEngine();
  return engine.searchUrl.replace('{query}', encodeURIComponent(query));
}
